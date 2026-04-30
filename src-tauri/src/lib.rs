use std::{fs, path::Path, thread};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use std::net::TcpListener;

use chrono::{DateTime, Local};
use git2::{
    build::CheckoutBuilder, AnnotatedCommit, Cred, FetchOptions, Oid, RemoteCallbacks, Repository,
};
use serde::{Deserialize, Serialize};

use sysinfo::{System, Disks};
use std::env;
use tauri::{command, Emitter, State, Window, Manager};

struct AppState {
    system: Mutex<System>,
    disks: Mutex<Disks>,
    is_syncing: Arc<Mutex<bool>>,
    current_progress: Arc<Mutex<FetchProgress>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    uptime: u64,
    cpu_usage: f32,
    memory_total: u64,
    memory_used: u64,
    disk_total: u64,
    disk_available: u64,
}

#[command]
fn get_system_info(state: State<'_, AppState>) -> Result<SystemInfo, String> {
    let mut sys = state.system.lock().map_err(|e| format!("锁错误: {}", e))?;
    // Bolt: Selectively refresh only required system metrics to reduce CPU overhead
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let mut disks = state.disks.lock().map_err(|e| format!("锁错误: {}", e))?;
    // Bolt: Refresh existing cached Disks instead of expensive repeated instantiations
    disks.refresh(true);
    let mut disk_total = 0;
    let mut disk_available = 0;
    for disk in disks.list() {
        disk_total += disk.total_space();
        disk_available += disk.available_space();
    }

    Ok(SystemInfo {
        uptime: System::uptime(),
        cpu_usage: sys.global_cpu_usage(),
        memory_total: sys.total_memory(),
        memory_used: sys.used_memory(),
        disk_total,
        disk_available,
    })
}



const PROGRESS_EVENT: &str = "pull-progress";


#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitConfig {
    remote_url: String,
    local_path: String,
    branch: String,
    force_push: bool,
    backup_before_pull: bool,
    version_file_path: String,
    changelog_file_path: String,
    #[allow(dead_code)]
    web_service_url: Option<String>,
    auto_restore_web_config: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoSyncStatus {
    current_branch: String,
    has_updates: bool,
    local_version: Option<String>,
    remote_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VersionDetails {
    version: String,
    branch: Option<String>,
    last_fetched_at: Option<String>,
    changelog_section: Option<String>,
    changelog_diff: Option<String>,
    source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardData {
    status: RepoSyncStatus,
    local: VersionDetails,
    remote: VersionDetails,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullResult {
    updated: bool,
    skipped: bool,
    message: String,
    local: VersionDetails,
    remote: VersionDetails,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FetchProgress {
    stage: String,
    percent: u8,
    label: String,
    result: Option<PullResult>,
    received_bytes: Option<u64>,
    total_objects: Option<u32>,
    received_objects: Option<u32>,
}


#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DbConnectionStatus {
    connected: bool,
    server: String,
    database: String,
    provider: String,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebServiceInfo {
    student_count: i32,
    lesson_count: i32,
    work_count: i32,
    system_uptime: String,
    process_start_time: String,
    asp_net_memory: String,
    asp_net_thread_count: i32,
    courses: Option<i32>,
    db_size: Option<String>,
}

struct ProcessManager {
    processes: Mutex<HashMap<String, std::process::Child>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NodeEnvStatus {
    node_version: Option<String>,
    pnpm_version: Option<String>,
    registry: String,
}

fn default_branch(branch: &str) -> &str {
    if branch.trim().is_empty() {
        "main"
    } else {
        branch
    }
}

fn extract_version(content: &str) -> Result<String, String> {
    content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "版本文件为空".to_string())
}

fn split_sections(content: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut current: Vec<&str> = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        let starts_new_section =
            trimmed.starts_with("20") && trimmed.len() >= 10 && trimmed.chars().nth(4) == Some('-');

        if starts_new_section && !current.is_empty() {
            sections.push(current.join("\n").trim().to_string());
            current.clear();
        }

        if !trimmed.is_empty() || !current.is_empty() {
            current.push(line);
        }
    }

    if !current.is_empty() {
        sections.push(current.join("\n").trim().to_string());
    }

    sections
        .into_iter()
        .filter(|section| !section.is_empty())
        .collect()
}

fn find_changelog_section(content: &str, version: &str) -> Result<String, String> {
    let sections = split_sections(content);

    if sections.is_empty() {
        return Err("更新日志为空".to_string());
    }

    if let Some(section) = sections.iter().find(|section| {
        section.contains(version)
            || section.contains(&format!("版本号更新至 {version}"))
            || section.contains(&format!("本次发版升级到 {version}"))
    }) {
        return Ok(section.clone());
    }

    sections
        .first()
        .cloned()
        .ok_or_else(|| "更新日志为空".to_string())
}

fn compute_changelog_diff(local: &str, remote: &str) -> Option<String> {
    let local_trimmed = local.trim();
    let remote_trimmed = remote.trim();

    if remote_trimmed.is_empty() {
        return None;
    }

    // 如果远端包含本地内容，说明本地已有，返回远端多出的新增部分
    if remote_trimmed.contains(local_trimmed) {
        let diff_start = remote_trimmed.find(local_trimmed)? + local_trimmed.len();
        let diff = remote_trimmed[diff_start..].trim();
        if diff.is_empty() {
            return None;
        }
        return Some(diff.to_string());
    }

    // 否则返回完整的远端内容(可能是全新内容)
    Some(remote_trimmed.to_string())
}

fn versions_differ(local: &str, remote: &str) -> bool {
    local.trim() != remote.trim()
}

fn ensure_config(config: &GitConfig) -> Result<(), String> {
    if config.local_path.trim().is_empty() {
        return Err("本地仓库路径不能为空".to_string());
    }
    if config.version_file_path.trim().is_empty() {
        return Err("版本文件路径不能为空".to_string());
    }
    if config.changelog_file_path.trim().is_empty() {
        return Err("更新日志路径不能为空".to_string());
    }
    Ok(())
}

fn is_valid_git_repo(path: &Path) -> bool {
    path.join(".git").is_dir()
}

fn is_directory_empty(path: &Path) -> Result<bool, String> {
    fs::read_dir(path)
        .map_err(|_| "无法读取目录".to_string())?
        .next()
        .transpose()
        .map_err(|_| "无法检查目录".to_string())
        .map(|entry| entry.is_none())
}


fn open_repo(path: &str) -> Result<Repository, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err("路径不存在".to_string());
    }
    if !p.is_dir() {
        return Err("路径不是有效目录".to_string());
    }
    if !is_valid_git_repo(p) {
        return Err("目标目录不是有效的 Git 仓库（缺少 .git 目录），请先克隆仓库".to_string());
    }
    Repository::open(path).map_err(|e| format!("无法打开仓库: {e}"))
}


fn remote_callbacks() -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, username, _allowed| {
        if let Some(name) = username {
            Cred::ssh_key_from_agent(name)
        } else {
            Cred::default()
        }
    });
    callbacks.transfer_progress(|_progress| {
        true
    });
    callbacks
}

fn fetch_branch(repo: &Repository, branch: &str) -> Result<(), String> {
    let branch_name = default_branch(branch);
    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(remote_callbacks());

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("找不到远端 origin: {e}"))?;

    // 使用显式 refspec 确保更新远程跟踪分支
    let refspec = format!("+refs/heads/{}:refs/remotes/origin/{}", branch_name, branch_name);
    
    remote
        .fetch(&[&refspec], Some(&mut fetch_options), None)
        .map_err(|e| format!("拉取远端引用失败 ({branch_name}): {e}"))
}

fn get_head_branch(repo: &Repository) -> Result<String, String> {
    match repo.head() {
        Ok(head) => head
            .shorthand()
            .map(str::to_string)
            .ok_or_else(|| "无法确定当前分支".to_string()),
        Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
            // 如果是未初始化的分支（如刚 init 还没 commit），尝试获取 HEAD 指向的名字
            repo.find_reference("HEAD")
                .and_then(|r| {
                    r.symbolic_target()
                        .map(|t| t.to_string())
                        .ok_or_else(|| git2::Error::from_str("HEAD is not symbolic"))
                })
                .map(|target| {
                    target
                        .strip_prefix("refs/heads/")
                        .unwrap_or(&target)
                        .to_string()
                })
                .map_err(|_| "读取当前分支失败: 仓库未拉取且无法确定默认分支名".to_string())
        }
        Err(e) => Err(format!("读取当前分支失败: {e}")),
    }
}

fn read_worktree_file(repo_root: &str, relative_path: &str) -> Result<String, String> {
    let full_path = Path::new(repo_root).join(relative_path);
    fs::read_to_string(&full_path).map_err(|e| format!("读取文件失败 {}: {e}", full_path.display()))
}

fn read_remote_file(
    repo: &Repository,
    branch: &str,
    relative_path: &str,
) -> Result<String, String> {
    let branch = default_branch(branch);
    let remote_ref = repo
        .find_reference(&format!("refs/remotes/origin/{branch}"))
        .map_err(|e| format!("找不到远端分支 origin/{branch}: {e}"))?;
    let commit = remote_ref
        .peel_to_commit()
        .map_err(|e| format!("读取远端提交失败: {e}"))?;
    let tree = commit
        .tree()
        .map_err(|e| format!("读取远端 tree 失败: {e}"))?;
    let entry = tree
        .get_path(Path::new(relative_path))
        .map_err(|e| format!("远端文件不存在 {}: {e}", relative_path))?;
    let blob = entry
        .to_object(repo)
        .map_err(|e| format!("读取远端文件对象失败: {e}"))?
        .peel_to_blob()
        .map_err(|e| format!("远端目标不是文件: {e}"))?;

    std::str::from_utf8(blob.content())
        .map(str::to_string)
        .map_err(|e| format!("远端文件不是有效 UTF-8: {e}"))
}

fn file_timestamp(repo_root: &str, relative_path: &str) -> Option<String> {
    let full_path = Path::new(repo_root).join(relative_path);
    let modified = fs::metadata(full_path).ok()?.modified().ok()?;
    let datetime: DateTime<Local> = DateTime::<Local>::from(modified);
    Some(datetime.format("%Y-%m-%d %H:%M:%S").to_string())
}

fn build_version_details(
    version: String,
    branch: Option<String>,
    last_fetched_at: Option<String>,
    changelog_section: Option<String>,
    changelog_diff: Option<String>,
    source: &str,
) -> VersionDetails {
    VersionDetails {
        version,
        branch,
        last_fetched_at,
        changelog_section,
        changelog_diff,
        source: source.to_string(),
    }
}

fn build_repo_status(
    current_branch: &str,
    local_version: &str,
    remote_version: &str,
) -> RepoSyncStatus {
    RepoSyncStatus {
        current_branch: current_branch.to_string(),
        has_updates: versions_differ(local_version, remote_version),
        local_version: Some(local_version.to_string()),
        remote_version: Some(remote_version.to_string()),
    }
}

fn build_pull_result(
    updated: bool,
    skipped: bool,
    message: &str,
    local: VersionDetails,
    remote: VersionDetails,
) -> PullResult {
    PullResult {
        updated,
        skipped,
        message: message.to_string(),
        local,
        remote,
    }
}

fn fast_forward(repo: &Repository, branch: &str, force: bool) -> Result<(), String> {
    let branch = default_branch(branch);
    let annotated = find_remote_commit(repo, branch)?;
    let (analysis, _) = repo
        .merge_analysis(&[&annotated])
        .map_err(|e| format!("分析远端更新失败: {e}"))?;

    if analysis.is_up_to_date() {
        return Ok(());
    }

    if !analysis.is_fast_forward() {
        if !force {
            return Err("当前仅支持 fast-forward 更新".to_string());
        }
        
        log::info!("强制覆盖模式：非 fast-forward 更新，将备份并强制覆盖");
        
        let repo_path = repo.path().parent().map(|p| p.to_path_buf())
            .ok_or_else(|| "无法获取仓库路径".to_string())?;
        let backup_path = format!(
            "{}.conflict-backup-{}",
            repo_path.display(),
            Local::now().format("%Y-%m-%dT%H-%M-%S")
        );
        
        if let Err(e) = copy_dir_recursive(&repo_path, Path::new(&backup_path)) {
            log::warn!("备份冲突文件失败: {}，继续强制覆盖", e);
        } else {
            log::info!("已备份到 {}", backup_path);
        }
        
        let target_oid = annotated.id();
        
        let reference_name = format!("refs/heads/{branch}");
        match repo.find_reference(&reference_name) {
            Ok(mut reference) => {
                reference.set_target(target_oid, "force override").map_err(|e| format!("更新本地分支失败: {e}"))?;
            }
            Err(_) => {
                repo.reference(&reference_name, target_oid, true, "create local branch")
                    .map_err(|e| format!("创建本地分支失败: {e}"))?;
            }
        }
        
        repo.set_head(&reference_name).map_err(|e| format!("切换分支头失败: {e}"))?;
        
        let mut builder = CheckoutBuilder::default();
        builder.force().remove_untracked(true);
        repo.checkout_head(Some(&mut builder)).map_err(|e| format!("强制覆盖工作区失败: {e}"))?;
        
        return Ok(());
    }

    let reference_name = format!("refs/heads/{branch}");
    let target_oid = annotated.id();

    match repo.find_reference(&reference_name) {
        Ok(mut reference) => {
            reference
                .set_target(target_oid, "fast-forward")
                .map_err(|e| format!("更新本地分支失败: {e}"))?;
        }
        Err(_) => {
            repo.reference(&reference_name, target_oid, true, "create local branch")
                .map_err(|e| format!("创建本地分支失败: {e}"))?;
        }
    }

    repo.set_head(&reference_name)
        .map_err(|e| format!("切换分支头失败: {e}"))?;
    let mut builder = CheckoutBuilder::default();
    if force {
        builder.force().remove_untracked(true);
    }
    repo.checkout_head(Some(&mut builder))
        .map_err(|e| format!("更新工作区失败: {e}"))
}

fn find_remote_commit<'repo>(
    repo: &'repo Repository,
    branch: &str,
) -> Result<AnnotatedCommit<'repo>, String> {
    let reference = repo
        .find_reference(&format!("refs/remotes/origin/{}", default_branch(branch)))
        .map_err(|e| format!("找不到远端分支: {e}"))?;
    let oid = reference
        .target()
        .ok_or_else(|| "远端分支缺少提交目标".to_string())?;
    repo.find_annotated_commit(oid)
        .map_err(|e| format!("读取远端提交失败: {e}"))
}


fn backup_repo_dir(source_path: &str) -> Result<String, String> {
    let timestamp = Local::now().format("%Y-%m-%dT%H-%M-%S");
    let backup_path = format!("{}.backup-{}", source_path, timestamp);
    copy_dir_recursive(Path::new(source_path), Path::new(&backup_path))?;
    Ok(backup_path)
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|e| format!("创建备份目录失败 {}: {e}", target.display()))?;

    for entry in
        fs::read_dir(source).map_err(|e| format!("读取目录失败 {}: {e}", source.display()))?
    {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let target_path = target.join(entry.file_name());

        if path.is_dir() {
            copy_dir_recursive(&path, &target_path)?;
        } else {
            fs::copy(&path, &target_path).map_err(|e| {
                format!(
                    "复制文件失败 {} -> {}: {e}",
                    path.display(),
                    target_path.display()
                )
            })?;
        }
    }

    Ok(())
}

fn collect_dashboard_data(config: &GitConfig) -> Result<DashboardData, String> {
    let path = Path::new(&config.local_path);

    // 只读检查：不触发任何网络操作（克隆/拉取/fetch）
    if !path.exists() {
        return Err("本地仓库路径不存在，请先克隆仓库".to_string());
    }

    if !is_valid_git_repo(path) {
        let is_empty = is_directory_empty(path).unwrap_or(true);
        if is_empty {
            return Err("本地路径是空文件夹，请先克隆仓库".to_string());
        } else {
            return Err("目标目录不是有效的 Git 仓库，请先克隆仓库".to_string());
        }
    }

    // 仓库存在且有效，只读取本地数据
    let repo = open_repo(&config.local_path)?;
    let branch = get_head_branch(&repo).unwrap_or_else(|_| default_branch(&config.branch).to_string());

    let local_version_content = read_worktree_file(&config.local_path, &config.version_file_path)
        .unwrap_or_default();
    let local_changelog_content = read_worktree_file(&config.local_path, &config.changelog_file_path)
        .unwrap_or_default();

    let local_version = extract_version(&local_version_content).unwrap_or_else(|_| "-".to_string());
    let local_section = find_changelog_section(&local_changelog_content, &local_version).ok();
    let last_fetched_at = file_timestamp(&config.local_path, &config.version_file_path);

    // 尝试从已有的远程引用读取远程版本（不触发 fetch）
    let remote_version_content = read_remote_file(&repo, &config.branch, &config.version_file_path)
        .unwrap_or_default();
    let remote_changelog_content = read_remote_file(&repo, &config.branch, &config.changelog_file_path)
        .unwrap_or_default();

    let remote_version = extract_version(&remote_version_content).unwrap_or_else(|_| local_version.clone());
    let remote_section = find_changelog_section(&remote_changelog_content, &remote_version).ok();

    let changelog_diff = match (&local_section, &remote_section) {
        (Some(local), Some(remote)) => compute_changelog_diff(local, remote),
        _ => remote_section.clone(),
    };

    Ok(DashboardData {
        status: build_repo_status(&branch, &local_version, &remote_version),
        local: build_version_details(
            local_version,
            Some(branch.clone()),
            last_fetched_at,
            local_section,
            None,
            "local",
        ),
        remote: build_version_details(
            remote_version,
            Some(default_branch(&config.branch).to_string()),
            None,
            remote_section,
            changelog_diff,
            "remote",
        ),
    })
}

fn emit_progress(window: &Window, cache: Option<&Mutex<FetchProgress>>, stage: &str, percent: u8, label: &str) -> Result<(), String> {
    let progress = FetchProgress {
        stage: stage.to_string(),
        percent,
        label: label.to_string(),
        result: None,
        received_bytes: None,
        total_objects: None,
        received_objects: None,
    };
    if let Some(c) = cache {
        if let Ok(mut lock) = c.lock() {
            *lock = progress.clone();
        }
    }
    window.emit(PROGRESS_EVENT, progress).map_err(|e| e.to_string())
}


#[command]
fn git_clone(url: String, path: String, branch: String) -> Result<String, String> {
    let target_path = Path::new(&path);
    let branch = default_branch(&branch).to_string();

    if target_path.exists() {
        if !is_valid_git_repo(target_path) {
            let is_empty = fs::read_dir(target_path)
                .map_err(|_| "无法读取目录")?
                .next()
                .transpose()
                .map_err(|_| "无法检查目录")?
                .is_none();

            if !is_empty {
                let backup_path = format!(
                    "{}.backup-{}",
                    &path,
                    Local::now().format("%Y-%m-%dT%H-%M-%S")
                );
                copy_dir_recursive(target_path, Path::new(&backup_path))
                    .map_err(|e| format!("备份失败: {e}"))?;
            }
            fs::remove_dir_all(target_path).map_err(|e| format!("清理目录失败: {e}"))?;
        }
    }

    git2::build::RepoBuilder::new()
        .branch(&branch)
        .fetch_options({
            let mut options = FetchOptions::new();
            options.remote_callbacks(remote_callbacks());
            options
        })
        .clone(&url, Path::new(&path))
        .map_err(|e| format!("克隆仓库失败: {e}"))?;
    Ok("Clone successful".to_string())
}

#[command]
fn git_pull(path: String, force: bool) -> Result<String, String> {
    let path = Path::new(&path);
    if !path.exists() || !path.is_dir() {
        return Err("本地仓库路径不存在或无效".to_string());
    }
    let repo = open_repo(&path.to_string_lossy())?;
    let branch = get_head_branch(&repo)?;
    fetch_branch(&repo, &branch)?;
    fast_forward(&repo, &branch, force)?;
    Ok("Pull successful".to_string())
}

#[command]
fn git_status(path: String, branch: Option<String>) -> Result<serde_json::Value, String> {
    let path = Path::new(&path);

    if !path.exists() {
        return Err("本地仓库路径不存在".to_string());
    }

    if !path.is_dir() {
        return Err("本地路径不是有效的目录".to_string());
    }

    let is_empty = fs::read_dir(path)
        .map_err(|_| "无法读取目录")?
        .next()
        .transpose()
        .map_err(|_| "无法检查目录")?
        .is_none();

    if is_empty {
        return Err("本地路径是空文件夹，请先克隆仓库".to_string());
    }

    // 检查是否为有效的 Git 仓库（避免在克隆进行中时阻塞）
    if !is_valid_git_repo(path) {
        return Err("目标目录不是有效的 Git 仓库".to_string());
    }

    // 检查是否有 .git/index.lock（表示另一个 git 操作正在进行）
    let lock_file = path.join(".git").join("index.lock");
    if lock_file.exists() {
        return Err("仓库正在被其他操作使用中，请稍后再试".to_string());
    }

    let repo = open_repo(&path.to_string_lossy())?;
    
    // 动态检测远程名称，优先使用 origin
    let remote_name = repo.find_remote("origin").ok().map(|_| "origin".to_string())
        .or_else(|| repo.remotes().ok().and_then(|r| r.get(0).map(|s| s.to_string())))
        .unwrap_or_else(|| "origin".to_string());

    let branch = if let Some(ref b) = branch {
        if b.trim().is_empty() {
            get_head_branch(&repo)?
        } else {
            b.clone()
        }
    } else {
        get_head_branch(&repo)?
    };

    // 改进 fetch 逻辑
    {
        let mut remote = repo
            .find_remote(&remote_name)
            .map_err(|e| format!("找不到远程 {}: {}", remote_name, e))?;
        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(remote_callbacks());
        let refspec = format!("+refs/heads/{}:refs/remotes/{}/{}", branch, remote_name, branch);
        remote.fetch(&[&refspec], Some(&mut fetch_options), None)
            .map_err(|e| format!("拉取失败 ({}/{}): {}", remote_name, branch, e))?;
    }

    let local_oid = repo
        .head()
        .map_err(|e| e.to_string())?
        .target()
        .unwrap_or(Oid::zero());

    // 尝试多个远程引用路径
    let remote_ref_name = format!("refs/remotes/{}/{}", remote_name, branch);
    let remote_oid = match repo.find_reference(&remote_ref_name) {
        Ok(reference) => reference.target().unwrap_or(Oid::zero()),
        Err(_) => {
            let head_ref_name = format!("refs/remotes/{}/HEAD", remote_name);
            match repo.find_reference(&head_ref_name) {
                Ok(reference) => reference.target().unwrap_or(Oid::zero()),
                Err(e) => {
                    log::warn!("无法找到远程引用 {} 或 {}: {}", remote_ref_name, head_ref_name, e);
                    Oid::zero()
                }
            }
        }
    };

    log::info!(
        "git_status: remote={}, branch={}, local_oid={}, remote_oid={}",
        remote_name,
        branch,
        local_oid,
        remote_oid
    );

    // 使用 graph_ahead_behind 计算 ahead/behind
    let (ahead, behind) = if local_oid != Oid::zero() && remote_oid != Oid::zero() {
        repo.graph_ahead_behind(local_oid, remote_oid)
            .unwrap_or_else(|e| {
                log::warn!("计算 ahead/behind 失败: {}", e);
                (0, 0)
            })
    } else {
        if local_oid == Oid::zero() {
            log::warn!("git_status: local_oid 为空");
        }
        if remote_oid == Oid::zero() {
            log::warn!("git_status: remote_oid 为空，可能是远端引用未找到");
        }
        (0, 0)
    };

    // 获取最后提交时间
    let last_commit_time = repo
        .head()
        .ok()
        .and_then(|h| h.target())
        .and_then(|oid| repo.find_commit(oid).ok())
        .map(|commit| {
            let timestamp = commit.time().seconds();
            let datetime = chrono::DateTime::from_timestamp(timestamp, 0)
                .unwrap_or_else(|| chrono::Utc::now().into());
            datetime.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(serde_json::json!({
        "remote": remote_name,
        "branch": branch,
        "hasUpdates": behind > 0,
        "ahead": ahead,
        "behind": behind,
        "local_oid": local_oid.to_string(),
        "remote_oid": remote_oid.to_string(),
        "lastCommitTime": last_commit_time,
    }))
}

#[command]
fn git_branches(path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Ok(vec!["main".to_string(), "master".to_string()]);
    }
    let repo = open_repo(&path)?;
    let mut branches = Vec::new();

    for branch in repo
        .branches(None)
        .map_err(|e| format!("读取分支失败: {e}"))?
    {
        let (branch, _) = branch.map_err(|e| e.to_string())?;
        if let Some(name) = branch.name().map_err(|e| e.to_string())? {
            let cleaned = name.strip_prefix("remotes/").unwrap_or(name).to_string();
            if !branches.contains(&cleaned) {
                branches.push(cleaned);
            }
        }
    }

    if branches.is_empty() {
        Ok(vec!["main".to_string(), "master".to_string()])
    } else {
        Ok(branches)
    }
}

#[command]
fn git_backup(source_path: String) -> Result<String, String> {
    backup_repo_dir(&source_path)
}

#[command]
async fn get_dashboard_data(config: GitConfig) -> Result<DashboardData, String> {
    // 使用 thread::spawn 将同步的 Git 操作包装起来，防止阻塞主线程
    thread::spawn(move || {
        collect_dashboard_data(&config)
    }).join().map_err(|_| "获取数据线程崩溃".to_string())?
}

#[command]
async fn check_node_env() -> Result<NodeEnvStatus, String> {
    let node_version = thread::spawn(|| {
        std::process::Command::new("node")
            .arg("-v")
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
                } else {
                    None
                }
            })
    }).join().map_err(|_| "检测 Node.js 线程崩溃".to_string())?;

    let pnpm_version = thread::spawn(|| {
        std::process::Command::new("pnpm")
            .arg("-v")
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
                } else {
                    None
                }
            })
    }).join().map_err(|_| "检测 pnpm 线程崩溃".to_string())?;

    let registry = thread::spawn(|| {
        std::process::Command::new("npm")
            .args(["config", "get", "registry"])
            .output()
            .ok()
            .and_then(|output| {
                if output.status.success() {
                    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
                } else {
                    None
                }
            })
            .unwrap_or_else(|| "https://registry.npmjs.org/".to_string())
    }).join().map_err(|_| "检测镜像源线程崩溃".to_string())?;

    Ok(NodeEnvStatus {
        node_version,
        pnpm_version,
        registry,
    })
}

#[command]
async fn run_project_task(
    window: Window,
    state: State<'_, ProcessManager>,
    task: String,
    path: String,
) -> Result<String, String> {
    let app_handle = window.app_handle();
    let data_dir = app_handle.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let tools_dir = data_dir.join("tools");
    let project_path = std::path::Path::new(&path);

    // 自动检测包管理器
    let use_pnpm = project_path.join("pnpm-lock.yaml").exists();
    let cmd_name = if use_pnpm { "pnpm" } else { "npm" };

    // 寻找本地 Node.js 路径
    let mut node_bin_path = None;
    if tools_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&tools_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("node-v") {
                    let p = if cfg!(target_os = "windows") {
                        entry.path()
                    } else {
                        entry.path().join("bin")
                    };
                    if p.exists() {
                        node_bin_path = Some(p);
                        break;
                    }
                }
            }
        }
    }

    let is_dev = task == "dev";
    let mut cmd = std::process::Command::new(cmd_name);
    
    // 继承环境变量
    cmd.envs(std::env::vars());

    // 注入路径
    if let Some(bin_path) = node_bin_path {
        let current_path = std::env::var_os("PATH").unwrap_or_default();
        let mut new_path = bin_path.clone().into_os_string();
        if cfg!(target_os = "windows") {
            new_path.push(";");
        } else {
            new_path.push(":");
        }
        new_path.push(current_path);
        cmd.env("PATH", new_path);
    }

    cmd.current_dir(&path);
    if task == "install" {
        cmd.arg("install");
    } else {
        cmd.args(["run", &task]);
    }

    if is_dev {
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        
        let mut child = cmd.spawn().map_err(|e| format!("启动失败: {}", e))?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();

        {
            let mut procs = state.processes.lock().unwrap();
            if let Some(mut old_child) = procs.remove(&task) {
                let _ = (old_child as std::process::Child).kill();
            }
            procs.insert(task.clone(), child);
        }

        let win_clone = window.clone();
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in std::io::BufRead::lines(reader).flatten() {
                win_clone.emit("service-log", line).ok();
            }
        });

        let win_clone_err = window.clone();
        thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in std::io::BufRead::lines(reader).flatten() {
                win_clone_err.emit("service-log", format!("[ERROR] {}", line)).ok();
            }
        });

        Ok(format!("服务已使用 {} 启动", cmd_name))
    } else {
        window.emit("service-log", format!("开始执行任务: {}", task)).ok();
        let output = cmd.output().map_err(|e| format!("执行失败: {}", e))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        
        for line in stdout.lines() {
            window.emit("service-log", line.to_string()).ok();
        }
        for line in stderr.lines() {
            window.emit("service-log", format!("[ERR] {}", line)).ok();
        }

        if output.status.success() {
            Ok(format!("任务 {} 执行成功", task))
        } else {
            Err(format!("任务 {} 执行失败", task))
        }
    }
}

#[command]
async fn stop_project_task(state: State<'_, ProcessManager>, task: String) -> Result<String, String> {
    let mut procs = state.processes.lock().unwrap();
    if let Some(mut child) = procs.remove(&task) {
        (child as std::process::Child).kill().map_err(|e| format!("停止失败: {}", e))?;
        Ok("服务已停止".to_string())
    } else {
        Err("服务未在运行".to_string())
    }
}

#[command]
async fn set_npm_registry(url: String) -> Result<String, String> {
    thread::spawn(move || {
        let output = std::process::Command::new("npm")
            .args(["config", "set", "registry", &url])
            .output()
            .map_err(|e| format!("无法执行 npm 命令: {}", e))?;

        if output.status.success() {
            Ok(format!("成功切换镜像源至: {}", url))
        } else {
            Err(format!("切换失败: {}", String::from_utf8_lossy(&output.stderr)))
        }
    }).join().map_err(|_| "设置镜像源线程崩溃".to_string())?
}

#[command]
async fn install_node_env(window: Window) -> Result<String, String> {
    let is_win = cfg!(target_os = "windows");
    let node_url = if is_win {
        "https://mirrors.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-win-x64.zip"
    } else {
        "https://mirrors.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-linux-x64.tar.xz"
    };

    window.emit("env-install-progress", "正在下载 Node.js...").ok();

    let app_handle = window.app_handle();
    let data_dir = app_handle.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let tools_dir = data_dir.join("tools");
    std::fs::create_dir_all(&tools_dir).map_err(|e| format!("无法创建工具目录: {}", e))?;

    let filename = if is_win { "node.zip" } else { "node.tar.xz" };
    let download_path = tools_dir.join(filename);

    let response = reqwest::get(node_url).await.map_err(|e| format!("下载失败: {}", e))?;
    let content = response.bytes().await.map_err(|e| format!("读取内容失败: {}", e))?;
    std::fs::write(&download_path, &content).map_err(|e| format!("写入文件失败: {}", e))?;

    window.emit("env-install-progress", "正在解压 Node.js...").ok();

    if is_win {
        std::process::Command::new("powershell")
            .args([
                "-Command",
                &format!("Expand-Archive -Path '{}' -DestinationPath '{}' -Force", download_path.display(), tools_dir.display())
            ])
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
    } else {
        std::process::Command::new("tar")
            .args([
                "-xJf",
                &download_path.to_string_lossy(),
                "-C",
                &tools_dir.to_string_lossy()
            ])
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
    }

    let _ = std::fs::remove_file(download_path);
    window.emit("env-install-progress", "Node.js 安装完成").ok();
    Ok("Node.js 安装成功".to_string())
}

#[command]
async fn install_pnpm(window: Window) -> Result<String, String> {
    window.emit("env-install-progress", "正在安装 pnpm...").ok();

    thread::spawn(move || {
        let output = std::process::Command::new("npm")
            .args(["install", "-g", "pnpm"])
            .output()
            .map_err(|e| format!("执行 npm install -g pnpm 失败: {}", e))?;

        if output.status.success() {
            Ok("pnpm 安装成功".to_string())
        } else {
            Err(format!("安装失败: {}", String::from_utf8_lossy(&output.stderr)))
        }
    }).join().map_err(|_| "安装 pnpm 线程崩溃".to_string())?
}

#[command]
async fn is_port_occupied(port: u16) -> Result<bool, String> {
    match TcpListener::bind(format!("127.0.0.1:{}", port)) {
        Ok(_) => Ok(false),
        Err(_) => Ok(true),
    }
}

#[command]
fn get_sync_progress(state: State<'_, AppState>) -> Result<FetchProgress, String> {
    let progress = state.current_progress.lock().map_err(|e| e.to_string())?;
    Ok(progress.clone())
}

#[command]
fn run_smart_pull(window: Window, state: State<'_, AppState>, config: GitConfig) -> Result<(), String> {
    {
        let is_syncing = state.is_syncing.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        if *is_syncing {
            return Err("另一个同步任务正在运行中，请等待当前任务完成。".to_string());
        }
    }

    let is_syncing_arc = state.is_syncing.clone();
    let progress_cache = state.current_progress.clone();
    
    std::thread::spawn(move || {
        {
            if let Ok(mut lock) = is_syncing_arc.lock() {
                *lock = true;
            }
        }

        let result = run_smart_pull_logic(&window, Some(&progress_cache), config);

        {
            if let Ok(mut lock) = is_syncing_arc.lock() {
                *lock = false;
            }
        }

        match result {
            Ok(res) => {
                let _ = window.emit(
                    PROGRESS_EVENT,
                    FetchProgress {
                        stage: "done".to_string(),
                        percent: 100,
                        label: "更新成功".to_string(),
                        result: Some(res),
                        received_bytes: None,
                        total_objects: None,
                        received_objects: None,
                    },
                );
            }
            Err(e) => {
                let _ = window.emit(
                    PROGRESS_EVENT,
                    FetchProgress {
                        stage: "error".to_string(),
                        percent: 0,
                        label: e.clone(),
                        result: None,
                        received_bytes: None,
                        total_objects: None,
                        received_objects: None,
                    },
                );
            }
        }
    });

    Ok(())
}

fn run_smart_pull_logic(window: &Window, cache: Option<&Mutex<FetchProgress>>, config: GitConfig) -> Result<PullResult, String> {
    ensure_config(&config)?;

    let web_config_path = Path::new(&config.local_path).join("web.config");
    let mut web_config_backup: Option<Vec<u8>> = None;
    if config.auto_restore_web_config && web_config_path.exists() {
        emit_progress(&window, cache, "backup", 5, "正在暂存 web.config")?;
        web_config_backup = fs::read(&web_config_path).ok();
        if web_config_backup.is_some() {
            window.emit("service-log", "[SYSTEM] 已暂存本地 web.config 文件").ok();
        }
    }

    let target_path = Path::new(&config.local_path);
    if !is_valid_git_repo(target_path) {
        emit_progress(&window, cache, "cloning", 10, "正在准备克隆仓库")?;

        if target_path.exists() && !is_valid_git_repo(target_path) {
            let is_empty = fs::read_dir(target_path)
                .map_err(|_| "无法读取目录")?
                .next()
                .transpose()
                .map_err(|_| "无法检查目录")?
                .is_none();

            if !is_empty {
                emit_progress(&window, cache, "backup", 20, "正在备份现有目录")?;
                let backup_path = format!(
                    "{}.backup-{}",
                    &config.local_path,
                    Local::now().format("%Y-%m-%dT%H-%M-%S")
                );
                copy_dir_recursive(target_path, Path::new(&backup_path))
                    .map_err(|e| format!("备份失败: {e}"))?;
            }
            fs::remove_dir_all(target_path).map_err(|e| format!("清理目录失败: {e}"))?;
        }

        emit_progress(&window, cache, "cloning", 50, "正在克隆仓库")?;
        let branch = default_branch(&config.branch).to_string();
        git2::build::RepoBuilder::new()
            .branch(&branch)
            .fetch_options({
                let mut options = FetchOptions::new();
                options.remote_callbacks(remote_callbacks());
                options
            })
            .clone(&config.remote_url, target_path)
            .map_err(|e| format!("克隆仓库失败: {e}"))?;

        if let Some(content) = &web_config_backup {
            fs::write(&web_config_path, content).ok();
            window.emit("service-log", "[SYSTEM] 已恢复 web.config 文件").ok();
        }

        emit_progress(&window, cache, "done", 100, "克隆完成")?;
        return Ok(build_pull_result(
            true,
            false,
            "仓库克隆完成",
            build_version_details(
                "新克隆".to_string(),
                Some(branch.clone()),
                None,
                None,
                None,
                "local",
            ),
            build_version_details(
                "新克隆".to_string(),
                Some(branch),
                None,
                None,
                None,
                "remote",
            ),
        ));
    }

    emit_progress(&window, cache, "checking", 10, "检查远端版本")?;

    let repo = open_repo(&config.local_path)?;
    fetch_branch(&repo, &config.branch)?;

    emit_progress(&window, cache, "reading_remote_version", 25, "读取远端版本")?;
    let remote_version_content =
        read_remote_file(&repo, &config.branch, &config.version_file_path)?;
    let remote_version = extract_version(&remote_version_content)?;

    emit_progress(&window, cache, "reading_remote_changelog", 40, "读取远端更新日志")?;
    let remote_changelog_content =
        read_remote_file(&repo, &config.branch, &config.changelog_file_path)?;
    let remote_section = find_changelog_section(&remote_changelog_content, &remote_version).ok();

    let local_version_content = read_worktree_file(&config.local_path, &config.version_file_path)?;
    let local_version = extract_version(&local_version_content)?;

    let branch = get_head_branch(&repo)?;
    let remote_details = build_version_details(
        remote_version.clone(),
        Some(default_branch(&config.branch).to_string()),
        None,
        remote_section.clone(),
        remote_section.clone(),
        "remote",
    );

    if !versions_differ(&local_version, &remote_version) {
        emit_progress(&window, cache, "done", 100, "当前已是最新版本")?;
        let local_changelog_content =
            read_worktree_file(&config.local_path, &config.changelog_file_path)?;
        let local_section = find_changelog_section(&local_changelog_content, &local_version).ok();
        let local_details = build_version_details(
            local_version,
            Some(branch),
            file_timestamp(&config.local_path, &config.version_file_path),
            local_section,
            None,
            "local",
        );

        return Ok(build_pull_result(
            false,
            true,
            "当前已是最新版本",
            local_details,
            remote_details,
        ));
    }

    if config.backup_before_pull {
        emit_progress(&window, cache, "backup", 55, "正在备份本地仓库")?;
        backup_repo_dir(&config.local_path)?;
    }

    emit_progress(&window, cache, "pulling", 75, "正在更新本地仓库")?;
    fast_forward(&repo, &config.branch, config.force_push)?;

    if let Some(content) = &web_config_backup {
        fs::write(&web_config_path, content).ok();
        window.emit("service-log", "[SYSTEM] 已恢复 web.config 文件").ok();
    }

    emit_progress(&window, cache, "refreshing_local", 90, "刷新本地版本信息")?;
    let local_version_content = read_worktree_file(&config.local_path, &config.version_file_path)?;
    let updated_local_version = extract_version(&local_version_content)?;
    let local_changelog_content =
        read_worktree_file(&config.local_path, &config.changelog_file_path)?;
    let local_section =
        find_changelog_section(&local_changelog_content, &updated_local_version).ok();
    let local_details = build_version_details(
        updated_local_version,
        Some(get_head_branch(&repo)?),
        file_timestamp(&config.local_path, &config.version_file_path),
        local_section,
        None,
        "local",
    );

    emit_progress(&window, cache, "done", 100, "抓取完成")?;
    Ok(build_pull_result(
        true,
        false,
        "抓取完成",
        local_details,
        remote_details,
    ))
}

#[cfg(test)]
mod tests {
    use super::{
        build_pull_result, default_branch, build_repo_status, extract_version, find_changelog_section,
        versions_differ, VersionDetails,
    };

    #[test]
    fn default_branch_returns_main_for_empty_string() {
        assert_eq!(default_branch(""), "main");
        assert_eq!(default_branch("   "), "main");
    }

    #[test]
    fn default_branch_returns_input_when_not_empty() {
        assert_eq!(default_branch("develop"), "develop");
        assert_eq!(default_branch(" feature/xyz "), " feature/xyz ");
    }

    #[test]
    fn extracts_release_version_from_first_line() {
        let content = "v2.0.0.2.20260419125025\nignored";
        assert_eq!(extract_version(content).unwrap(), "v2.0.0.2.20260419125025");
    }

    #[test]
    fn extract_version_empty_content() {
        let content = "";
        assert_eq!(extract_version(content), Err("版本文件为空".to_string()));
    }

    #[test]
    fn extract_version_whitespace_content() {
        let content = "   \n  \t  \n";
        assert_eq!(extract_version(content), Err("版本文件为空".to_string()));
    }

    #[test]
    fn extract_version_ignores_leading_empty_lines() {
        let content = "\n  \n  v1.0.0  \nignored";
        assert_eq!(extract_version(content).unwrap(), "v1.0.0");
    }

    #[test]
    fn finds_exact_matching_changelog_section() {
        let changelog = "2026-04-19\n升级增强\n版本号更新至 v2.0.0.2.20260419125025\n\n2026-04-18\n升级增强\n版本号更新至 v2.0.0.1.20260418111118";
        let section = find_changelog_section(changelog, "v2.0.0.2.20260419125025").unwrap();
        assert!(section.contains("2026-04-19"));
    }

    #[test]
    fn falls_back_to_latest_section_when_exact_match_missing() {
        let changelog = "2026-04-19\n新功能\nA\n\n2026-04-18\n新功能\nB";
        let section = find_changelog_section(changelog, "v0.0.0").unwrap();
        assert!(section.contains("2026-04-19"));
    }

    #[test]
    fn marks_update_when_remote_version_differs() {
        assert!(versions_differ("v1", "v2"));
    }

    #[test]
    fn skips_update_when_versions_match() {
        assert!(!versions_differ("v2", "v2"));
    }

    #[test]
    fn dashboard_status_reports_updates_when_versions_differ() {
        let status = build_repo_status("main", "v1", "v2");
        assert!(status.has_updates);
        assert_eq!(status.current_branch, "main");
    }

    #[test]
    fn pull_result_marks_skip_without_update() {
        let result = build_pull_result(
            false,
            true,
            "当前已是最新版本",
            VersionDetails {
                version: "v1".to_string(),
                branch: Some("main".to_string()),
                last_fetched_at: None,
                changelog_section: None,
                changelog_diff: None,
                source: "local".to_string(),
            },
            VersionDetails {
                version: "v1".to_string(),
                branch: Some("main".to_string()),
                last_fetched_at: None,
                changelog_section: None,
                changelog_diff: None,
                source: "remote".to_string(),
            },
        );
        assert!(result.skipped);
        assert!(!result.updated);
    }
}

// Set environment variables to help work around GBM/graphics issues in some Linux environments


#[command]
async fn get_web_service_info(url: String) -> Option<WebServiceInfo> {
    let client = reqwest::Client::new();
    let target_url = format!("{}/api/SiteStats.ashx", url.trim_end_matches('/'));
    
    let res = match client.get(target_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return None,
    };
        
    if !res.status().is_success() {
        return None;
    }
    
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct SiteStatsRaw {
        courses: Option<i32>,
        students: Option<i32>,
        works: Option<i32>,
        uptime: Option<String>,
        #[serde(rename = "startTime")]
        start_time: Option<String>,
        #[serde(rename = "memoryMB")]
        memory_mb: Option<String>,
        #[serde(rename = "dbSize")]
        db_size: Option<String>,
    }
    
    let raw: SiteStatsRaw = match res.json().await {
        Ok(r) => r,
        Err(_) => return None,
    };
    
    let uptime_str = raw.uptime.unwrap_or_default();
    let start_time_str = raw.start_time.unwrap_or_default();
    
    Some(WebServiceInfo {
        student_count: raw.students.unwrap_or(0),
        lesson_count: raw.courses.unwrap_or(0),
        work_count: raw.works.unwrap_or(0),
        system_uptime: format!("{} ({})", uptime_str, start_time_str),
        process_start_time: start_time_str,
        asp_net_memory: raw.memory_mb.unwrap_or_default(),
        asp_net_thread_count: raw.works.unwrap_or(0),
        courses: raw.courses,
        db_size: raw.db_size,
    })
}

#[command]
async fn get_database_connection_status(local_path: String) -> Result<DbConnectionStatus, String> {
    use std::fs;
    
    let config_paths = [
        "OpenLearn.Web/Web.config",
        "OpenLearn.Web/appsettings.json",
        "web.config",
        "appsettings.json",
    ];
    
    let base_path = std::path::Path::new(&local_path);
    let mut content: Option<String> = None;
    let mut found_file: String = String::new();
    
    for config_path in &config_paths {
        let full_path = base_path.join(config_path);
        if full_path.exists() {
            if let Ok(c) = fs::read_to_string(&full_path) {
                content = Some(c);
                found_file = config_path.to_string();
                break;
            }
        }
    }
    
    let content = content.ok_or_else(|| "未找到数据库配置文件 (web.config 或 appsettings.json)".to_string())?;
    
    let (server, database) = if found_file.ends_with(".json") {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let conn_str = json.get("ConnectionStrings")
                .and_then(|cs| cs.get("OpenLearn"))
                .or_else(|| json.get("ConnectionStrings").and_then(|cs| cs.get("Default")))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            parse_connection_string(conn_str)
        } else {
            return Err("无法解析 JSON 文件".to_string());
        }
    } else {
        let conn_str = content.lines()
            .find(|l| l.contains("connectionString="))
            .map(|l| {
                l.split("connectionString=\"")
                    .nth(1)
                    .unwrap_or("")
                    .split('"')
                    .next()
                    .unwrap_or("")
            })
            .unwrap_or("");
        parse_connection_string(conn_str)
    };
    
    Ok(DbConnectionStatus {
        connected: !server.is_empty() && server != "未知",
        server,
        database,
        provider: "SqlServer".to_string(),
        error: None,
    })
}

fn parse_connection_string(conn_str: &str) -> (String, String) {
    let mut server = String::new();
    let mut database = String::new();
    
    for part in conn_str.split(';') {
        let part = part.trim();
        if part.to_lowercase().starts_with("server=") || part.to_lowercase().starts_with("data source=") {
            server = part.split('=').nth(1).unwrap_or("").trim().to_string();
        } else if part.to_lowercase().starts_with("database=") || part.to_lowercase().starts_with("initial catalog=") {
            database = part.split('=').nth(1).unwrap_or("").trim().to_string();
        }
    }
    
    if server.is_empty() { server = "未知".to_string(); }
    if database.is_empty() { database = "未知".to_string(); }
    (server, database)
}

#[command]
fn is_windows() -> bool {
    cfg!(target_os = "windows")
}

#[command]
fn check_local_repo(path: String) -> bool {
    let p = Path::new(&path);
    p.exists() && is_valid_git_repo(p)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // 修复 Linux 下 (尤其是 NVIDIA 驱动) WebKitGTK 的 GBM buffer 错误
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    if let Err(e) = tauri::Builder::default()
        .manage(AppState { 
            system: Mutex::new(System::new_all()),
            disks: Mutex::new(Disks::new_with_refreshed_list()),
            is_syncing: Arc::new(Mutex::new(false)),
            current_progress: Arc::new(Mutex::new(FetchProgress {
                stage: "idle".to_string(),
                percent: 0,
                label: "".to_string(),
                result: None,
                received_bytes: None,
                total_objects: None,
                received_objects: None,
            })),
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            git_clone,
            git_pull,
            git_status,
            git_branches,
            git_backup,
            get_dashboard_data,
            run_smart_pull,
            get_sync_progress,
            get_system_info,
            get_web_service_info,
            get_database_connection_status,
            is_windows,
            check_local_repo,
            check_node_env,
            set_npm_registry,
            install_node_env,
            install_pnpm,
            run_project_task,
            stop_project_task,
            is_port_occupied,
        ])
        .manage(ProcessManager {
            processes: Mutex::new(HashMap::new()),
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!()) {
            eprintln!("error while running tauri application: {}", e);
        }
}
