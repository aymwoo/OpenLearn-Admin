use std::{fs, path::Path};
use std::process::{Command, Stdio};
use std::io::{BufRead, BufReader};
use std::thread;
use std::sync::Mutex;

use chrono::{DateTime, Local};
use git2::{
    build::CheckoutBuilder, AnnotatedCommit, Cred, FetchOptions, Oid, RemoteCallbacks, Repository,
};
use serde::{Deserialize, Serialize};

use sysinfo::{System, Disks};
use std::env;
use tauri::{command, Emitter, State, Window};

struct AppState {
    child_process: Mutex<Option<std::process::Child>>,
    system: Mutex<System>,
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
    sys.refresh_all();

    let disks = Disks::new_with_refreshed_list();
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[derive(PartialEq)]
enum DirectoryState {
    Valid,
    Empty,
    NonExistent,
    ExistingRepo,
    InvalidRepo,
    MissingFile(String),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GitConfig {
    #[allow(dead_code)]
    remote_url: String,
    local_path: String,
    branch: String,
    force_push: bool,
    backup_before_pull: bool,
    version_file_path: String,
    changelog_file_path: String,
    web_service_url: Option<String>,
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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebServiceInfo {
    courses: i32,
    students: i32,
    works: i32,
    uptime: String,
    start_time: String,
    #[serde(rename = "memoryMB")]
    memory_mb: String,
    #[serde(rename = "dbSize")]
    db_size: String,
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

fn check_directory_state(path: &Path) -> DirectoryState {
    if !path.exists() {
        return DirectoryState::NonExistent;
    }
    
    if !path.is_dir() {
        return DirectoryState::InvalidRepo;
    }
    
    if is_valid_git_repo(path) {
        return DirectoryState::ExistingRepo;
    }
    
    match is_directory_empty(path) {
        Ok(true) => DirectoryState::Empty,
        Ok(false) => DirectoryState::InvalidRepo,
        Err(_) => DirectoryState::InvalidRepo,
    }
}

fn check_repo_health(repo_path: &Path, version_file: &str, changelog_file: &str) -> DirectoryState {
    let state = check_directory_state(repo_path);
    
    if state != DirectoryState::ExistingRepo {
        return state;
    }
    
    let version_path = repo_path.join(version_file);
    let changelog_path = repo_path.join(changelog_file);
    
    if !version_path.exists() || !changelog_path.exists() {
        return DirectoryState::MissingFile(
            if !version_path.exists() { 
                version_file.to_string() 
            } else { 
                changelog_file.to_string() 
            }
        );
    }
    
    DirectoryState::Valid
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

    if !path.exists() || !is_valid_git_repo(path) {
        if config.remote_url.trim().is_empty() {
            return Err("本地仓库路径不存在且未配置 remote_url".to_string());
        }

        if path.exists() && !is_valid_git_repo(path) {
            let is_empty = is_directory_empty(path).unwrap_or(true);
            if !is_empty {
                let backup_path = format!(
                    "{}.backup-{}",
                    &config.local_path,
                    Local::now().format("%Y-%m-%dT%H-%M-%S")
                );
                copy_dir_recursive(path, Path::new(&backup_path))
                    .map_err(|e| format!("备份失败: {e}"))?;
            }
            fs::remove_dir_all(path).map_err(|e| format!("清理目录失败: {e}"))?;
        }

        let branch = default_branch(&config.branch).to_string();
        git2::build::RepoBuilder::new()
            .branch(&branch)
            .fetch_options({
                let mut options = FetchOptions::new();
                options.remote_callbacks(remote_callbacks());
                options
            })
            .clone(&config.remote_url, path)
            .map_err(|e| format!("自动克隆仓库失败: {e}"))?;
    }

    let state = check_repo_health(path, &config.version_file_path, &config.changelog_file_path);
    match state {
        DirectoryState::Empty => {
            if config.remote_url.trim().is_empty() {
                return Err("本地目录为空且未配置 remote_url，无法自动克隆".to_string());
            }
            let backup_path = format!(
                "{}.backup-{}",
                &config.local_path,
                Local::now().format("%Y-%m-%dT%H-%M-%S")
            );
            copy_dir_recursive(path, Path::new(&backup_path))
                .map_err(|e| format!("备份失败: {e}"))?;
            fs::remove_dir_all(path).map_err(|e| format!("清理目录失败: {e}"))?;
            fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {e}"))?;
            let branch = default_branch(&config.branch).to_string();
            git2::build::RepoBuilder::new()
                .branch(&branch)
                .fetch_options({
                    let mut options = FetchOptions::new();
                    options.remote_callbacks(remote_callbacks());
                    options
                })
                .clone(&config.remote_url, path)
                .map_err(|e| format!("自动克隆仓库失败: {e}"))?;
        }
        DirectoryState::MissingFile(_) | DirectoryState::ExistingRepo => {
            if let Ok(repo) = open_repo(&config.local_path) {
                let branch = get_head_branch(&repo).unwrap_or_else(|_| "main".to_string());
                if fetch_branch(&repo, &branch).is_ok() {
                    if fast_forward(&repo, &branch, true).is_ok() {
                        log::info!("通过 git pull 成功恢复仓库");
                    } else {
                        log::warn!("git pull 失败，将尝试重新克隆");
                        let backup_path = format!(
                            "{}.backup-{}",
                            &config.local_path,
                            Local::now().format("%Y-%m-%dT%H-%M-%S")
                        );
                        if copy_dir_recursive(path, Path::new(&backup_path)).is_ok() {
                            log::info!("已备份到 {}", backup_path);
                        }
                        fs::remove_dir_all(path).map_err(|e| format!("清理目录失败: {e}"))?;
                        fs::create_dir_all(path).map_err(|e| format!("创建目录失败: {e}"))?;
                        let branch = default_branch(&config.branch).to_string();
                        git2::build::RepoBuilder::new()
                            .branch(&branch)
                            .fetch_options({
                                let mut options = FetchOptions::new();
                                options.remote_callbacks(remote_callbacks());
                                options
                            })
                            .clone(&config.remote_url, path)
                            .map_err(|e| format!("重新克隆仓库失败: {e}"))?;
                    }
                } else {
                    return Err("fetch 失败，无法恢复仓库".to_string());
                }
            } else {
                return Err("无法打开仓库".to_string());
            }
        }
        DirectoryState::Valid | DirectoryState::NonExistent | DirectoryState::InvalidRepo => {}
    }

    ensure_config(config)?;

    let repo = open_repo(&config.local_path)?;
    fetch_branch(&repo, &config.branch)?;
    let branch = get_head_branch(&repo)?;

    let local_version_content = read_worktree_file(&config.local_path, &config.version_file_path)?;
    let remote_version_content =
        read_remote_file(&repo, &config.branch, &config.version_file_path)?;
    let local_changelog_content =
        read_worktree_file(&config.local_path, &config.changelog_file_path)?;
    let remote_changelog_content =
        read_remote_file(&repo, &config.branch, &config.changelog_file_path)?;

    let local_version = extract_version(&local_version_content)?;
    let remote_version = extract_version(&remote_version_content)?;
    let local_section = find_changelog_section(&local_changelog_content, &local_version).ok();
    let remote_section = find_changelog_section(&remote_changelog_content, &remote_version).ok();
    let last_fetched_at = file_timestamp(&config.local_path, &config.version_file_path);

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

fn emit_progress(window: &Window, stage: &str, percent: u8, label: &str) -> Result<(), String> {
    window
        .emit(
            PROGRESS_EVENT,
            FetchProgress {
                stage: stage.to_string(),
                percent,
                label: label.to_string(),
                result: None,
            },
        )
        .map_err(|e| format!("发送进度失败: {e}"))
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
fn get_dashboard_data(config: GitConfig) -> Result<DashboardData, String> {
    collect_dashboard_data(&config)
}

#[command]
fn run_smart_pull(window: Window, config: GitConfig) -> Result<(), String> {
    thread::spawn(move || {
        match run_smart_pull_logic(&window, config) {
            Ok(res) => {
                let _ = window.emit(
                    PROGRESS_EVENT,
                    FetchProgress {
                        stage: "done".to_string(),
                        percent: 100,
                        label: "更新成功".to_string(),
                        result: Some(res),
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
                    },
                );
            }
        }
    });
    Ok(())
}

fn run_smart_pull_logic(window: &Window, config: GitConfig) -> Result<PullResult, String> {
    ensure_config(&config)?;

    let target_path = Path::new(&config.local_path);
    if !is_valid_git_repo(target_path) {
        emit_progress(&window, "cloning", 10, "正在准备克隆仓库")?;

        if target_path.exists() && !is_valid_git_repo(target_path) {
            let is_empty = fs::read_dir(target_path)
                .map_err(|_| "无法读取目录")?
                .next()
                .transpose()
                .map_err(|_| "无法检查目录")?
                .is_none();

            if !is_empty {
                emit_progress(&window, "backup", 20, "正在备份现有目录")?;
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

        emit_progress(&window, "cloning", 50, "正在克隆仓库")?;
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

        emit_progress(&window, "done", 100, "克隆完成")?;
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

    emit_progress(&window, "checking", 10, "检查远端版本")?;

    let repo = open_repo(&config.local_path)?;
    fetch_branch(&repo, &config.branch)?;

    emit_progress(&window, "reading_remote_version", 25, "读取远端版本")?;
    let remote_version_content =
        read_remote_file(&repo, &config.branch, &config.version_file_path)?;
    let remote_version = extract_version(&remote_version_content)?;

    emit_progress(&window, "reading_remote_changelog", 40, "读取远端更新日志")?;
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
        emit_progress(&window, "done", 100, "当前已是最新版本")?;
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
        emit_progress(&window, "backup", 55, "正在备份本地仓库")?;
        backup_repo_dir(&config.local_path)?;
    }

    emit_progress(&window, "pulling", 75, "正在更新本地仓库")?;
    fast_forward(&repo, &config.branch, config.force_push)?;

    emit_progress(&window, "refreshing_local", 90, "刷新本地版本信息")?;
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

    emit_progress(&window, "done", 100, "抓取完成")?;
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

fn setup_graphics_workarounds() {
    // These can help when GBM fails due to GPU/display issues
    #[cfg(target_os = "linux")]
    {
        use std::env;
        // Try to use software rendering when GPU is not available
        if env::var("LIBGL_ALWAYS_SOFTWARE").is_err() {
            env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
        }
        // Disable hardware composition in WebKit
        if env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }
}

#[command]
fn start_service(window: Window, state: State<'_, AppState>, path: String) -> Result<String, String> {
    let mut child_guard = state.child_process.lock().map_err(|e| e.to_string())?;
    if child_guard.is_some() {
        return Err("Service is already running".to_string());
    }

    // Attempt to run npm run dev or a script
    let mut child = Command::new("bash")
        .arg("-c")
        .arg("npm run dev")
        .current_dir(&path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start service: {}", e))?;

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    
    let w1 = window.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w1.emit("service-log", l);
            }
        }
        let _ = w1.emit("service-log", "[PROCESS EXITED]".to_string());
    });

    let w2 = window.clone();
    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                let _ = w2.emit("service-log", format!("[ERROR] {}", l));
            }
        }
    });

    *child_guard = Some(child);
    Ok("Service started".to_string())
}

#[command]
fn stop_service(state: State<'_, AppState>) -> Result<String, String> {
    let mut child_guard = state.child_process.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
        Ok("Service stopped".to_string())
    } else {
        Err("No service running".to_string())
    }
}

#[command]
async fn get_web_service_info(url: String) -> Result<WebServiceInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("无法创建 HTTP 客户端: {}", e))?;

    let target_url = format!("{}/api/SiteStats.ashx", url.trim_end_matches('/'));
    
    let res = client.get(&target_url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("无法连接到 Web 服务 ({}): {}", target_url, e))?;
        
    let status = res.status();
    if !status.is_success() {
        return Err(format!("Web 服务返回 HTTP 错误: {} (URL: {})", status, target_url));
    }
    
    let body = res.text().await
        .map_err(|e| format!("读取响应内容失败 (URL: {}): {}", target_url, e))?;
    
    let info = serde_json::from_str::<WebServiceInfo>(&body)
        .map_err(|e| {
            format!("解析数据失败 (URL: {}), 错误: {}. \n原始数据: {}", target_url, e, body)
        })?;
        
    Ok(info)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    setup_graphics_workarounds();
    if let Err(e) = tauri::Builder::default()
        .manage(AppState { 
            child_process: Mutex::new(None),
            system: Mutex::new(System::new_all()),
        })
        .invoke_handler(tauri::generate_handler![
            git_clone,
            git_pull,
            git_status,
            git_branches,
            git_backup,
            get_dashboard_data,
            run_smart_pull,
            get_system_info,
            get_web_service_info,
            start_service,
            stop_service,
        ])
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
// Triggering new build to clear potential cache issues
