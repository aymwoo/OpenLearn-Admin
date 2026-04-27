use std::{fs, path::{Path, PathBuf}, thread};
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::collections::HashMap;
use std::net::TcpListener;

use chrono::{DateTime, Local};
use git2::{
    build::CheckoutBuilder, AnnotatedCommit, Cred, FetchOptions, Oid, RemoteCallbacks, RemoteRedirect, Repository,
};
use serde::{Deserialize, Serialize};

use sysinfo::{System, Disks};
use std::env;
use tauri::{command, Emitter, State, Window, Manager};

const WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR: &str = "nodejs";

struct AppState {
    system: Mutex<System>,
    is_syncing: Arc<Mutex<bool>>,
    current_progress: Arc<Mutex<FetchProgress>>,
    cancel_flag: Arc<AtomicBool>,
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

struct ProgressCallbackContext {
    window: Window,
    cache: Option<Arc<Mutex<FetchProgress>>>,
    cancel_flag: Arc<AtomicBool>,
    stage: String,
    percent_range: (u8, u8),
}

fn is_http_remote(url: &str) -> bool {
    let lower = url.trim().to_ascii_lowercase();
    lower.starts_with("http://") || lower.starts_with("https://")
}

fn is_gitee_remote(url: &str) -> bool {
    url.to_ascii_lowercase().contains("gitee.com")
}

fn is_ssh_remote(url: &str) -> bool {
    let trimmed = url.trim();
    trimmed.starts_with("git@")
        || trimmed.starts_with("ssh://")
        || trimmed.starts_with("ssh+git://")
}

fn https_auth_guidance(remote_url: Option<&str>) -> String {
    match remote_url {
        Some(url) if is_gitee_remote(url) => {
            "Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT".to_string()
        }
        Some(url) if is_http_remote(url) => {
            "HTTPS 远端认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT".to_string()
        }
        _ => "远端认证失败，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT".to_string(),
    }
}

fn https_auth_error(remote_url: Option<&str>) -> git2::Error {
    let message = https_auth_guidance(remote_url);
    git2::Error::new(git2::ErrorCode::Auth, git2::ErrorClass::Http, &message)
}

fn resolve_remote_credentials(
    url: Option<&str>,
    username: Option<&str>,
    allowed: git2::CredentialType,
) -> Result<Cred, git2::Error> {
    let remote_url = url.unwrap_or_default();

    if is_ssh_remote(remote_url) {
        if allowed.contains(git2::CredentialType::USERNAME) {
            return Cred::username(username.unwrap_or("git"));
        }

        if allowed.contains(git2::CredentialType::SSH_KEY) {
            let user = username.unwrap_or("git");
            if let Ok(cred) = Cred::ssh_key_from_agent(user) {
                return Ok(cred);
            }
        }
    }

    if is_http_remote(remote_url) {
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) {
            let config = git2::Config::open_default().map_err(|_| https_auth_error(url))?;
            return Cred::credential_helper(&config, remote_url, username)
                .map_err(|_| https_auth_error(url));
        }

        if allowed.contains(git2::CredentialType::DEFAULT) {
            return Cred::default();
        }
    }

    if allowed.contains(git2::CredentialType::DEFAULT) {
        Cred::default()
    } else {
        Err(git2::Error::new(
            git2::ErrorCode::Auth,
            git2::ErrorClass::Http,
            "无法提供有效的认证凭据，请使用 SSH 方式克隆或配置凭据",
        ))
    }
}

fn is_redirect_or_auth_replay_error(error: &git2::Error) -> bool {
    let message = error.message().to_ascii_lowercase();
    message.contains("too many redirects") || message.contains("authentication replays")
}

fn normalize_git_operation_error(
    context: &str,
    remote_url: Option<&str>,
    error: git2::Error,
) -> String {
    if is_redirect_or_auth_replay_error(&error)
        || (error.code() == git2::ErrorCode::Auth && remote_url.is_some_and(is_http_remote))
    {
        return format!("{context}: {}", https_auth_guidance(remote_url));
    }

    format!("{context}: {error}")
}

fn build_remote_callbacks(progress: Option<ProgressCallbackContext>) -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |url, username, allowed| {
        resolve_remote_credentials(Some(url), username, allowed)
    });

    if let Some(progress) = progress {
        let ProgressCallbackContext {
            window,
            cache,
            cancel_flag,
            stage,
            percent_range,
        } = progress;
        let (min_percent, max_percent) = percent_range;

        callbacks.transfer_progress(move |p| {
            if cancel_flag.load(Ordering::SeqCst) {
                return false;
            }
            let received_objects = p.received_objects();
            let total_objects = p.total_objects();
            let received_bytes = p.received_bytes();

            let git_pct = if total_objects > 0 {
                received_objects as f64 / total_objects as f64
            } else {
                0.0
            };
            let percent =
                (min_percent as f64 + git_pct * (max_percent - min_percent) as f64).min(99.0)
                    as u8;

            let size_label = format_bytes(received_bytes as u64);
            let label = if total_objects > 0 {
                format!("{} ({}, 对象 {}/{})", stage, size_label, received_objects, total_objects)
            } else {
                format!("{} ({})", stage, size_label)
            };

            let progress = FetchProgress {
                stage: stage.clone(),
                percent,
                label,
                result: None,
                received_bytes: Some(received_bytes as u64),
                total_objects: Some(total_objects as u32),
                received_objects: Some(received_objects as u32),
            };

            if let Some(ref cache) = cache {
                if let Ok(mut lock) = cache.lock() {
                    *lock = progress.clone();
                }
            }

            window.emit(PROGRESS_EVENT, progress).ok();
            true
        });
    } else {
        callbacks.transfer_progress(|_| true);
    }

    callbacks
}


fn remote_callbacks() -> RemoteCallbacks<'static> {
    build_remote_callbacks(None)
}

fn create_progress_fetch_options(
    window: &Window,
    cache: Option<&Arc<Mutex<FetchProgress>>>,
    cancel_flag: &Arc<AtomicBool>,
    stage: &str,
    percent_range: (u8, u8),
) -> FetchOptions<'static> {
    let callbacks = build_remote_callbacks(Some(ProgressCallbackContext {
        window: window.clone(),
        cache: cache.cloned(),
        cancel_flag: cancel_flag.clone(),
        stage: stage.to_string(),
        percent_range,
    }));

    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks);
    options.follow_redirects(RemoteRedirect::Initial);
    options
}

fn format_bytes(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1}GB", bytes as f64 / 1024.0 / 1024.0 / 1024.0)
    } else if bytes >= 1024 * 1024 {
        format!("{:.1}MB", bytes as f64 / 1024.0 / 1024.0)
    } else if bytes >= 1024 {
        format!("{}KB", bytes / 1024)
    } else {
        format!("{}B", bytes)
    }
}

fn fetch_branch(repo: &Repository, branch: &str) -> Result<(), String> {
    let mut options = FetchOptions::new();
    options.remote_callbacks(remote_callbacks());
    options.follow_redirects(RemoteRedirect::Initial);
    fetch_branch_with_opts(repo, branch, Some(options))
}

fn fetch_branch_with_opts(repo: &Repository, branch: &str, fetch_options: Option<FetchOptions<'_>>) -> Result<(), String> {
    let branch_name = default_branch(branch);
    let mut options = fetch_options.unwrap_or_else(|| {
        let mut opts = FetchOptions::new();
        opts.remote_callbacks(remote_callbacks());
        opts.follow_redirects(RemoteRedirect::Initial);
        opts
    });

    let mut remote = repo
        .find_remote("origin")
        .map_err(|e| format!("找不到远端 origin: {e}"))?;
    let remote_url = remote.url().map(str::to_string);

    let refspec = format!("+refs/heads/{}:refs/remotes/origin/{}", branch_name, branch_name);

    remote
        .fetch(&[&refspec], Some(&mut options), None)
        .map_err(|e| normalize_git_operation_error(
            &format!("拉取远端引用失败 ({branch_name})"),
            remote_url.as_deref(),
            e,
        ))
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

#[cfg(target_os = "windows")]
fn refresh_windows_path() -> Result<(), String> {
    use std::process::Command;

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "$machine=[Environment]::GetEnvironmentVariable('Path','Machine');$user=[Environment]::GetEnvironmentVariable('Path','User');$segments=@();if($machine){$segments+=$machine};if($user){$segments+=$user};[Console]::Out.Write(($segments -join ';'))",
        ])
        .output()
        .map_err(|e| format!("刷新 Windows PATH 失败: {}", e))?;

    if !output.status.success() {
        return Err(command_output_error("刷新 Windows PATH 失败", &output));
    }

    let refreshed_path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !refreshed_path.is_empty() {
        env::set_var("PATH", refreshed_path);
    }

    Ok(())
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

#[derive(Debug, Clone)]
struct WindowsNodeCommandPaths {
    node_dir: PathBuf,
    node_exe: PathBuf,
    npm_cmd: PathBuf,
    pnpm_cmd: PathBuf,
}

fn windows_node_install_dir_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(path) = env::var_os("PATH") {
        candidates.extend(env::split_paths(&path));
    }

    candidates.push(PathBuf::from(r"C:\Program Files\nodejs"));
    candidates.push(PathBuf::from(r"C:\Program Files (x86)\nodejs"));

    let mut deduped = Vec::new();
    for candidate in candidates {
        if !deduped.iter().any(|existing: &PathBuf| existing == &candidate) {
            deduped.push(candidate);
        }
    }

    deduped
}

fn build_windows_node_command_paths(node_dir: PathBuf) -> WindowsNodeCommandPaths {
    WindowsNodeCommandPaths {
        node_exe: node_dir.join("node.exe"),
        npm_cmd: node_dir.join("npm.cmd"),
        pnpm_cmd: node_dir.join("pnpm.cmd"),
        node_dir,
    }
}

fn resolve_windows_node_command_paths() -> Option<WindowsNodeCommandPaths> {
    windows_node_install_dir_candidates()
        .into_iter()
        .map(build_windows_node_command_paths)
        .find(|paths| paths.node_exe.exists() && paths.npm_cmd.exists())
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn windows_node_command_path_labels(node_paths: &WindowsNodeCommandPaths) -> String {
    format!(
        "node.exe: {}；npm.cmd: {}；pnpm.cmd: {}",
        node_paths.node_exe.display(),
        node_paths.npm_cmd.display(),
        node_paths.pnpm_cmd.display()
    )
}

fn prepend_command_path(extra_dirs: &[PathBuf]) -> Result<std::ffi::OsString, String> {
    let mut joined_paths = extra_dirs.to_vec();

    if let Some(current_path) = env::var_os("PATH") {
        joined_paths.extend(env::split_paths(&current_path));
    }

    env::join_paths(joined_paths)
        .map_err(|e| format!("拼接 PATH 失败: {}", e))
}

fn inject_windows_node_env(
    command: &mut std::process::Command,
    node_paths: Option<&WindowsNodeCommandPaths>,
) -> Result<(), String> {
    command.envs(env::vars());

    if let Some(node_paths) = node_paths {
        let updated_path = prepend_command_path(std::slice::from_ref(&node_paths.node_dir))?;
        command.env("PATH", updated_path);
    }

    Ok(())
}

fn read_command_stdout(output: &std::process::Output) -> Option<String> {
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}

fn command_output_error(prefix: &str, output: &std::process::Output) -> String {
    format!(
        "{}；stdout: {}；stderr: {}",
        prefix,
        format_command_output_text(&output.stdout),
        format_command_output_text(&output.stderr)
    )
}

fn command_spawn_error(prefix: &str, error: std::io::Error) -> String {
    format!("{}: {}", prefix, error)
}

fn run_windows_node_command(
    program: &Path,
    args: &[&str],
    node_paths: &WindowsNodeCommandPaths,
) -> Result<std::process::Output, String> {
    let mut command = std::process::Command::new(program);
    inject_windows_node_env(&mut command, Some(node_paths))?;
    command.args(args);
    command
        .output()
        .map_err(|e| command_spawn_error(&format!("启动命令失败 {}", program.display()), e))
}

#[cfg(target_os = "windows")]
fn ensure_windows_node_ready() -> Result<WindowsNodeCommandPaths, String> {
    refresh_windows_path()?;

    let node_paths = resolve_windows_node_command_paths().ok_or_else(|| {
        format!(
            "安装后程序内 npm 不可用；未能在当前进程中重新解析 Windows Node.js 安装目录；已扫描候选目录: {}",
            windows_node_install_dir_candidates()
                .iter()
                .map(|path| path.display().to_string())
                .collect::<Vec<_>>()
                .join("；")
        )
    })?;

    let output = run_windows_node_command(&node_paths.npm_cmd, &["-v"], &node_paths)?;
    if output.status.success() {
        Ok(node_paths)
    } else {
        Err(format!(
            "安装后程序内 npm 不可用；{}；stdout: {}；stderr: {}",
            windows_node_command_path_labels(&node_paths),
            format_command_output_text(&output.stdout),
            format_command_output_text(&output.stderr)
        ))
    }
}

#[cfg(not(target_os = "windows"))]
fn ensure_windows_node_ready() -> Result<WindowsNodeCommandPaths, String> {
    Err("当前平台不是 Windows，无法执行 Windows Node.js 就绪校验".to_string())
}

#[derive(Debug, Clone)]
struct BundledNodeMsiDiscovery {
    selected_msi: Option<PathBuf>,
    scanned_dirs: Vec<PathBuf>,
}

fn windows_bundled_node_msi_scan_dirs(resource_dir: &Path) -> Vec<PathBuf> {
    vec![
        resource_dir.join(WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR),
        resource_dir
            .join("resources")
            .join(WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR),
    ]
}

fn describe_windows_bundled_node_msi_scan(discovery: &BundledNodeMsiDiscovery) -> String {
    let scanned_dirs = discovery
        .scanned_dirs
        .iter()
        .map(|dir| format!("{}\\*.msi", dir.display()))
        .collect::<Vec<_>>()
        .join("；");

    if let Some(msi) = &discovery.selected_msi {
        format!(
            "命中 resources/{} 内置 MSI: {}；已扫描: {}",
            WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR,
            msi.display(),
            scanned_dirs
        )
    } else {
        format!(
            "未在 resources/{} 内置资源中找到 Node.js MSI；已扫描: {}",
            WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR,
            scanned_dirs
        )
    }
}

fn discover_windows_bundled_node_msi(resource_dir: &Path) -> Result<BundledNodeMsiDiscovery, String> {
    let scanned_dirs = windows_bundled_node_msi_scan_dirs(resource_dir);
    let mut matches = Vec::new();

    for dir in &scanned_dirs {
        if !dir.exists() || !dir.is_dir() {
            continue;
        }

        for entry in fs::read_dir(dir)
            .map_err(|e| format!("读取内置 Node.js 资源目录失败 {}: {e}", dir.display()))?
        {
            let entry = entry.map_err(|e| format!("读取资源条目失败 {}: {e}", dir.display()))?;
            let path = entry.path();
            if path.is_file()
                && path
                    .extension()
                    .map(|ext| ext.to_string_lossy().eq_ignore_ascii_case("msi"))
                    .unwrap_or(false)
            {
                matches.push(path);
            }
        }
    }

    matches.sort();

    Ok(BundledNodeMsiDiscovery {
        selected_msi: matches.into_iter().next(),
        scanned_dirs,
    })
}

fn format_command_output_text(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes).trim().to_string();
    if text.is_empty() {
        "<empty>".to_string()
    } else {
        text
    }
}

fn format_windows_msi_failure(output: &std::process::Output, context: &str) -> String {
    let exit_code = output
        .status
        .code()
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let stdout = format_command_output_text(&output.stdout);
    let stderr = format_command_output_text(&output.stderr);

    format!(
        "{}；msiexec 退出码: {}；stdout: {}；stderr: {}",
        context, exit_code, stdout, stderr
    )
}

fn install_windows_msi(msi_path: &Path, context: &str) -> Result<(), String> {
    let output = std::process::Command::new("msiexec")
        .args(["/i", &msi_path.to_string_lossy(), "/quiet", "/norestart"])
        .output()
        .map_err(|e| format!("{}；拉起 msiexec 失败: {}", context, e))?;

    if output.status.success() {
        Ok(())
    } else {
        Err(format_windows_msi_failure(&output, context))
    }
}

fn emit_env_install_progress(window: &Window, message: impl Into<String>) {
    window.emit("env-install-progress", message.into()).ok();
}

fn ensure_windows_node_ready_with_context(context: &str) -> Result<WindowsNodeCommandPaths, String> {
    ensure_windows_node_ready().map_err(|error| format!("{}；{}", context, error))
}

fn install_windows_node_and_verify(
    window: &Window,
    msi_path: &Path,
    install_context: &str,
    ready_context: &str,
) -> Result<WindowsNodeCommandPaths, String> {
    install_windows_msi(msi_path, install_context)?;
    emit_env_install_progress(window, "正在校验程序内 npm 可用性...");
    ensure_windows_node_ready_with_context(ready_context)
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
fn git_clone(window: Window, state: State<'_, AppState>, url: String, path: String, branch: String) -> Result<String, String> {
    state.cancel_flag.store(false, Ordering::SeqCst);
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
                if state.cancel_flag.load(Ordering::SeqCst) {
                    return Err("操作已取消".to_string());
                }
                emit_progress(&window, None, "cloning", 5, "正在备份已有目录")?;
                let backup_path = format!(
                    "{}.backup-{}",
                    &path,
                    Local::now().format("%Y-%m-%dT%H-%M-%S")
                );
                copy_dir_recursive(target_path, Path::new(&backup_path))
                    .map_err(|e| format!("备份失败: {e}"))?;
            }
            if state.cancel_flag.load(Ordering::SeqCst) {
                return Err("操作已取消".to_string());
            }
            emit_progress(&window, None, "cloning", 10, "正在清理目录")?;
            fs::remove_dir_all(target_path).map_err(|e| format!("清理目录失败: {e}"))?;
        }
    }

    if state.cancel_flag.load(Ordering::SeqCst) {
        return Err("操作已取消".to_string());
    }
    emit_progress(&window, None, "cloning", 15, "正在克隆仓库")?;
    git2::build::RepoBuilder::new()
        .branch(&branch)
        .fetch_options(create_progress_fetch_options(&window, None, &state.cancel_flag, "cloning", (20, 95)))
        .clone(&url, Path::new(&path))
        .map_err(|e| {
            let message = normalize_git_operation_error("克隆仓库失败", Some(&url), e);
            let is_cancelled = state.cancel_flag.load(Ordering::SeqCst);
            let _ = window.emit(
                PROGRESS_EVENT,
                FetchProgress {
                    stage: if is_cancelled { "idle" } else { "error" }.to_string(),
                    percent: 0,
                    label: if is_cancelled { "操作已取消".to_string() } else { message.clone() },
                    result: None,
                    received_bytes: None,
                    total_objects: None,
                    received_objects: None,
                },
            );
            message
        })?;

    if state.cancel_flag.load(Ordering::SeqCst) {
        return Err("操作已取消".to_string());
    }
    let _ = window.emit(
        PROGRESS_EVENT,
        FetchProgress {
            stage: "done".to_string(),
            percent: 100,
            label: "克隆成功".to_string(),
            result: None,
            received_bytes: None,
            total_objects: None,
            received_objects: None,
        },
    );
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
        let remote_url = remote.url().map(str::to_string);
        let mut fetch_options = FetchOptions::new();
        fetch_options.remote_callbacks(remote_callbacks());
        fetch_options.follow_redirects(RemoteRedirect::Initial);
        let refspec = format!("+refs/heads/{}:refs/remotes/{}/{}", branch, remote_name, branch);
        remote.fetch(&[&refspec], Some(&mut fetch_options), None)
            .map_err(|e| normalize_git_operation_error(
                &format!("拉取失败 ({}/{})", remote_name, branch),
                remote_url.as_deref(),
                e,
            ))?;
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
    let is_win = cfg!(target_os = "windows");

    let node_version = thread::spawn(move || {
        if is_win {
            if let Some(node_paths) = resolve_windows_node_command_paths() {
                if let Ok(output) = run_windows_node_command(&node_paths.node_exe, &["-v"], &node_paths) {
                    if let Some(version) = read_command_stdout(&output) {
                        return Some(version);
                    }
                }
            }
            if let Ok(output) = std::process::Command::new("node").arg("-v").output() {
                if let Some(version) = read_command_stdout(&output) {
                    return Some(version);
                }
            }
            None
        } else {
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
        }
    }).join().map_err(|_| "检测 Node.js 线程崩溃".to_string())?;

    let pnpm_version = thread::spawn(move || {
        if is_win {
            if let Some(node_paths) = resolve_windows_node_command_paths() {
                if node_paths.pnpm_cmd.exists() {
                    if let Ok(output) = run_windows_node_command(&node_paths.pnpm_cmd, &["-v"], &node_paths) {
                        if let Some(version) = read_command_stdout(&output) {
                            return Some(version);
                        }
                    }
                }
            }
            if let Ok(output) = std::process::Command::new("pnpm").arg("-v").output() {
                if let Some(version) = read_command_stdout(&output) {
                    return Some(version);
                }
            }
            None
        } else {
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
        }
    }).join().map_err(|_| "检测 pnpm 线程崩溃".to_string())?;

    let registry = thread::spawn(move || {
        if is_win {
            if let Some(node_paths) = resolve_windows_node_command_paths() {
                if let Ok(output) = run_windows_node_command(&node_paths.npm_cmd, &["config", "get", "registry"], &node_paths) {
                    if let Some(registry) = read_command_stdout(&output) {
                        return registry;
                    }
                }
            }
        }
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
    let project_path = std::path::Path::new(&path);

    // 自动检测包管理器
    let use_pnpm = project_path.join("pnpm-lock.yaml").exists();
    let cmd_name = if use_pnpm { "pnpm" } else { "npm" };

    let is_dev = task == "dev";
    let windows_node_paths = if cfg!(target_os = "windows") {
        Some(resolve_windows_node_command_paths().ok_or_else(|| {
            format!("未找到可用的 Windows Node.js 安装目录，无法执行 {}", cmd_name)
        })?)
    } else {
        None
    };

    let command_program = if let Some(node_paths) = windows_node_paths.as_ref() {
        let explicit_path = if use_pnpm {
            &node_paths.pnpm_cmd
        } else {
            &node_paths.npm_cmd
        };

        if !explicit_path.exists() {
            return Err(format!(
                "未找到 {} 可执行文件: {}",
                cmd_name,
                explicit_path.display()
            ));
        }

        explicit_path.to_path_buf()
    } else {
        PathBuf::from(cmd_name)
    };

    let mut cmd = std::process::Command::new(&command_program);
    if let Some(node_paths) = windows_node_paths.as_ref() {
        inject_windows_node_env(&mut cmd, Some(node_paths))?;
    } else {
        cmd.envs(std::env::vars());
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
        let output = if cfg!(target_os = "windows") {
            let node_paths = resolve_windows_node_command_paths()
                .ok_or_else(|| "未找到可用的 Windows Node.js 安装目录，无法设置 npm 镜像源".to_string())?;
            run_windows_node_command(&node_paths.npm_cmd, &["config", "set", "registry", &url], &node_paths)?
        } else {
            std::process::Command::new("npm")
                .args(["config", "set", "registry", &url])
                .output()
                .map_err(|e| format!("无法执行 npm 命令: {}", e))?
        };

        if output.status.success() {
            Ok(format!("成功切换镜像源至: {}", url))
        } else {
            Err(command_output_error("切换 npm 镜像源失败", &output))
        }
    }).join().map_err(|_| "设置镜像源线程崩溃".to_string())?
}

#[command]
async fn install_node_env(window: Window) -> Result<String, String> {
    let is_win = cfg!(target_os = "windows");
    let app_handle = window.app_handle();
    let data_dir = app_handle.path().app_local_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let tools_dir = data_dir.join("tools");
    std::fs::create_dir_all(&tools_dir).map_err(|e| format!("无法创建工具目录: {}", e))?;

    if is_win {
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let discovery = discover_windows_bundled_node_msi(&resource_dir)?;
            let discovery_summary = describe_windows_bundled_node_msi_scan(&discovery);

            if let Some(source) = discovery.selected_msi {
                let msi_path = tools_dir.join("node.msi");
                emit_env_install_progress(&window, format!("已发现内置 Node.js MSI：{}", source.display()));
                emit_env_install_progress(
                    &window,
                    format!("正在复制 resources/{} 内置 MSI...", WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR),
                );
                std::fs::copy(&source, &msi_path).map_err(|e| {
                    format!(
                        "复制内置 Node.js MSI 失败 {} -> {}: {e}",
                        source.display(),
                        msi_path.display()
                    )
                })?;
                emit_env_install_progress(&window, "正在安装内置 Node.js MSI...");
                let ready_result = install_windows_node_and_verify(
                    &window,
                    &msi_path,
                    &format!("{discovery_summary}；内置 Node.js MSI 安装失败，文件: {}", msi_path.display()),
                    &discovery_summary,
                );
                let _ = std::fs::remove_file(&msi_path);

                let ready_paths = ready_result?;
                emit_env_install_progress(
                    &window,
                    format!("Node.js 安装完成，npm 已就绪：{}", ready_paths.npm_cmd.display()),
                );
                return Ok(format!(
                    "Node.js 安装成功（内置版本），程序内 npm 已就绪：{}",
                    ready_paths.npm_cmd.display()
                ));
            }

            // 未找到内置 MSI，回退到在线下载
        }
    }

    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        let bundled_nodejs = resource_dir.join("nodejs");
        if !is_win && bundled_nodejs.exists() {
            emit_env_install_progress(&window, "正在从内置资源安装 Node.js...");
            for entry in std::fs::read_dir(&bundled_nodejs).map_err(|e| format!("读取内置资源失败: {}", e))? {
                let entry = entry.map_err(|e| format!("读取资源条目失败: {}", e))?;
                let source = entry.path();
                if source.is_dir() {
                    copy_dir_recursive(&source, &tools_dir.join(entry.file_name()))?;
                } else {
                    std::fs::copy(&source, &tools_dir.join(entry.file_name()))
                        .map_err(|e| format!("复制资源文件失败: {}", e))?;
                }
            }
            emit_env_install_progress(&window, "Node.js 安装完成");
            return Ok("Node.js 安装成功（内置版本）".to_string());
        }
    }

    let node_url = if is_win {
        "https://mirrors.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-x64.msi"
    } else {
        "https://mirrors.huaweicloud.com/nodejs/v20.12.2/node-v20.12.2-linux-x64.tar.xz"
    };

    let filename = if is_win { "node.msi" } else { "node.tar.xz" };
    let download_path = tools_dir.join(filename);

    let client = reqwest::Client::new();
    let response = client.get(node_url).send().await.map_err(|e| {
        format!("下载失败: {}", e)
    })?;
    let response = response.error_for_status().map_err(|e| {
        let status = e
            .status()
            .map(|code| code.to_string())
            .unwrap_or_else(|| "unknown".to_string());
        format!(
            "下载 Node.js 失败，URL: {}，HTTP 状态: {}，目标文件: {}",
            node_url,
            status,
            download_path.display()
        )
    })?;
    let total_size = response.content_length().unwrap_or(0);
    emit_env_install_progress(&window, "正在下载 Node.js (0%)...");

    let mut file = std::fs::File::create(&download_path).map_err(|e| format!("创建文件失败: {}", e))?;
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_percent: u32 = 0;

    use futures_util::stream::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取下载内容失败: {}", e))?;
        downloaded += chunk.len() as u64;
        std::io::Write::write_all(&mut file, &chunk).map_err(|e| format!("写入文件失败: {}", e))?;
        
        if total_size > 0 {
            let percent = ((downloaded as f64 / total_size as f64) * 100.0) as u32;
            if percent != last_percent && percent % 10 == 0 {
                emit_env_install_progress(&window, format!("正在下载 Node.js ({}%)...", percent));
                last_percent = percent;
            }
        }
    }

    if is_win {
        emit_env_install_progress(&window, "正在安装 Node.js...");
        let ready_result = install_windows_node_and_verify(
            &window,
            &download_path,
            &format!(
                "在线 Node.js MSI 安装失败，文件: {}",
                download_path.display()
            ),
            "在线 Node.js MSI 已完成安装，但程序内 npm readiness 校验失败",
        );
        let _ = std::fs::remove_file(download_path);

        let ready_paths = ready_result?;
        emit_env_install_progress(
            &window,
            format!("Node.js 安装完成，npm 已就绪：{}", ready_paths.npm_cmd.display()),
        );
        return Ok(format!(
            "Node.js 安装成功，程序内 npm 已就绪：{}",
            ready_paths.npm_cmd.display()
        ));
    } else {
        emit_env_install_progress(&window, "正在解压 Node.js...");
        std::process::Command::new("tar")
            .args([
                "-xJf",
                &download_path.to_string_lossy(),
                "-C",
                &tools_dir.to_string_lossy()
            ])
            .output()
            .map_err(|e| format!("解压失败: {}", e))?;
        let _ = std::fs::remove_file(download_path);
    }

    emit_env_install_progress(&window, "Node.js 安装完成");
    Ok("Node.js 安装成功".to_string())
}

#[command]
async fn install_pnpm(window: Window) -> Result<String, String> {
    window.emit("env-install-progress", "正在安装 pnpm...").ok();

    let is_win = cfg!(target_os = "windows");

    thread::spawn(move || {
        if is_win {
            let node_paths = resolve_windows_node_command_paths()
                .ok_or_else(|| "未找到可用的 Windows Node.js 安装目录，无法安装 pnpm".to_string())?;

            let output = run_windows_node_command(
                &node_paths.npm_cmd,
                &["install", "-g", "pnpm"],
                &node_paths,
            )?;

            if output.status.success() {
                Ok("pnpm 安装成功".to_string())
            } else {
                Err(command_output_error("安装 pnpm 失败", &output))
            }
        } else {
            let output = std::process::Command::new("npm")
                .args(["install", "-g", "pnpm"])
                .output()
                .map_err(|e| format!("执行 npm install -g pnpm 失败: {}", e))?;
            if output.status.success() {
                Ok("pnpm 安装成功".to_string())
            } else {
                Err(command_output_error("安装 pnpm 失败", &output))
            }
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
fn cancel_sync(window: Window, state: State<'_, AppState>) -> Result<(), String> {
    state.cancel_flag.store(true, Ordering::SeqCst);
    let _ = window.emit(
        PROGRESS_EVENT,
        FetchProgress {
            stage: "idle".to_string(),
            percent: 0,
            label: "操作已取消".to_string(),
            result: None,
            received_bytes: None,
            total_objects: None,
            received_objects: None,
        },
    );
    Ok(())
}

#[command]
fn run_smart_pull(window: Window, state: State<'_, AppState>, config: GitConfig) -> Result<(), String> {
    {
        let is_syncing = state.is_syncing.lock().map_err(|e: std::sync::PoisonError<_>| e.to_string())?;
        if *is_syncing {
            return Err("另一个同步任务正在运行中，请等待当前任务完成。".to_string());
        }
    }

    state.cancel_flag.store(false, Ordering::SeqCst);
    let is_syncing_arc = state.is_syncing.clone();
    let progress_cache = state.current_progress.clone();
    let cancel_flag = state.cancel_flag.clone();
    
    std::thread::spawn(move || {
        {
            if let Ok(mut lock) = is_syncing_arc.lock() {
                *lock = true;
            }
        }

        let result = run_smart_pull_logic(&window, Some(&progress_cache), &cancel_flag, config);

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
                let is_cancelled = cancel_flag.load(Ordering::SeqCst);
                let _ = window.emit(
                    PROGRESS_EVENT,
                    FetchProgress {
                        stage: if is_cancelled { "idle" } else { "error" }.to_string(),
                        percent: 0,
                        label: if is_cancelled { "操作已取消".to_string() } else { e.clone() },
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

fn run_smart_pull_logic(window: &Window, cache: Option<&Arc<Mutex<FetchProgress>>>, cancel_flag: &Arc<AtomicBool>, config: GitConfig) -> Result<PullResult, String> {
    ensure_config(&config)?;

    let web_config_path = Path::new(&config.local_path).join("web.config");
    let mut web_config_backup: Option<Vec<u8>> = None;
    if config.auto_restore_web_config && web_config_path.exists() {
        if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
        emit_progress(&window, cache.map(|c| c.as_ref()), "backup", 5, "正在暂存 web.config")?;
        web_config_backup = fs::read(&web_config_path).ok();
        if web_config_backup.is_some() {
            window.emit("service-log", "[SYSTEM] 已暂存本地 web.config 文件").ok();
        }
    }

    let target_path = Path::new(&config.local_path);
    if !is_valid_git_repo(target_path) {
        if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
        emit_progress(&window, cache.map(|c| c.as_ref()), "cloning", 10, "正在准备克隆仓库")?;

        if target_path.exists() && !is_valid_git_repo(target_path) {
            let is_empty = fs::read_dir(target_path)
                .map_err(|_| "无法读取目录")?
                .next()
                .transpose()
                .map_err(|_| "无法检查目录")?
                .is_none();

            if !is_empty {
                if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
                emit_progress(&window, cache.map(|c| c.as_ref()), "backup", 20, "正在备份现有目录")?;
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

        if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
        emit_progress(&window, cache.map(|c| c.as_ref()), "cloning", 20, "正在克隆仓库")?;
        let branch = default_branch(&config.branch).to_string();
        let clone_fetch_opts = create_progress_fetch_options(&window, cache, cancel_flag, "cloning", (20, 95));
        git2::build::RepoBuilder::new()
            .branch(&branch)
            .fetch_options(clone_fetch_opts)
            .clone(&config.remote_url, target_path)
            .map_err(|e| normalize_git_operation_error("克隆仓库失败", Some(&config.remote_url), e))?;

        if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
        if let Some(content) = &web_config_backup {
            fs::write(&web_config_path, content).ok();
            window.emit("service-log", "[SYSTEM] 已恢复 web.config 文件").ok();
        }

        emit_progress(&window, cache.map(|c| c.as_ref()), "done", 100, "克隆完成")?;
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

    if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
    emit_progress(&window, cache.map(|c| c.as_ref()), "checking", 10, "检查远端版本")?;

    let repo = open_repo(&config.local_path)?;
    let pull_fetch_opts = create_progress_fetch_options(&window, cache, cancel_flag, "pulling", (25, 60));
    fetch_branch_with_opts(&repo, &config.branch, Some(pull_fetch_opts))?;

    if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }

    emit_progress(&window, cache.map(|c| c.as_ref()), "reading_remote_version", 65, "读取远端版本")?;
    let remote_version_content =
        read_remote_file(&repo, &config.branch, &config.version_file_path)?;
    let remote_version = extract_version(&remote_version_content)?;

    emit_progress(&window, cache.map(|c| c.as_ref()), "reading_remote_changelog", 75, "读取远端更新日志")?;
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
        emit_progress(&window, cache.map(|c| c.as_ref()), "done", 100, "当前已是最新版本")?;
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
        if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }
        emit_progress(&window, cache.map(|c| c.as_ref()), "backup", 80, "正在备份本地仓库")?;
        backup_repo_dir(&config.local_path)?;
    }

    if cancel_flag.load(Ordering::SeqCst) { return Err("操作已取消".to_string()); }

    emit_progress(&window, cache.map(|c| c.as_ref()), "pulling", 85, "正在更新本地仓库")?;
    fast_forward(&repo, &config.branch, config.force_push)?;

    if let Some(content) = &web_config_backup {
        fs::write(&web_config_path, content).ok();
        window.emit("service-log", "[SYSTEM] 已恢复 web.config 文件").ok();
    }

    emit_progress(&window, cache.map(|c| c.as_ref()), "refreshing_local", 95, "刷新本地版本信息")?;
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

    emit_progress(&window, cache.map(|c| c.as_ref()), "done", 100, "抓取完成")?;
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
        build_pull_result, build_repo_status, build_windows_node_command_paths, default_branch,
        discover_windows_bundled_node_msi, extract_version, find_changelog_section,
        https_auth_guidance, is_ssh_remote,
        normalize_git_operation_error, windows_bundled_node_msi_scan_dirs,
        windows_node_command_path_labels, versions_differ, VersionDetails,
        WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR,
    };
    use std::{fs, path::PathBuf, time::{SystemTime, UNIX_EPOCH}};

    fn unique_test_dir(name: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("openlearn-admin-{name}-{nanos}"))
    }

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

    #[test]
    fn https_auth_guidance_is_gitee_specific() {
        let message = https_auth_guidance(Some("https://gitee.com/nylon26/openlearnsite.git"));
        assert!(message.contains("Gitee HTTPS"));
        assert!(message.contains("SSH"));
    }

    #[test]
    fn normalize_git_operation_error_maps_redirect_replay_to_actionable_message() {
        let error = git2::Error::new(
            git2::ErrorCode::GenericError,
            git2::ErrorClass::Http,
            "too many redirects or authentication replays",
        );

        let message = normalize_git_operation_error(
            "拉取远端引用失败 (main)",
            Some("https://gitee.com/nylon26/openlearnsite.git"),
            error,
        );

        assert!(message.contains("Gitee HTTPS 认证被拒绝"));
        assert!(message.contains("SSH 地址"));
    }

    #[test]
    fn ssh_remote_detection_keeps_ssh_path_available() {
        assert!(is_ssh_remote("git@gitee.com:nylon26/openlearnsite.git"));
        assert!(is_ssh_remote("ssh://git@gitee.com/nylon26/openlearnsite.git"));
    }

    #[test]
    fn windows_bundled_scan_dirs_include_resources_contract() {
        let resource_dir = PathBuf::from(r"C:\\OpenLearn\\resources");
        let scan_dirs = windows_bundled_node_msi_scan_dirs(&resource_dir);

        assert_eq!(
            scan_dirs,
            vec![
                resource_dir.join(WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR),
                resource_dir.join("resources").join(WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR),
            ]
        );
    }

    #[test]
    fn discover_windows_bundled_node_msi_selects_sorted_first_match() {
        let resource_dir = unique_test_dir("bundled-msi-discovery");
        let scan_dir = resource_dir.join(WINDOWS_BUNDLED_NODE_RESOURCE_SUBDIR);
        fs::create_dir_all(&scan_dir).unwrap();
        fs::write(scan_dir.join("node-v24.15.0-x64.msi"), b"a").unwrap();
        fs::write(scan_dir.join("node-v20.12.2-x64.msi"), b"b").unwrap();
        fs::write(scan_dir.join("README.txt"), b"ignore").unwrap();

        let discovery = discover_windows_bundled_node_msi(&resource_dir).unwrap();
        let selected = discovery.selected_msi.unwrap();
        assert_eq!(selected.file_name().unwrap().to_string_lossy(), "node-v20.12.2-x64.msi");

        let _ = fs::remove_dir_all(resource_dir);
    }

    #[test]
    fn windows_command_paths_keep_node_npm_pnpm_in_same_directory() {
        let base_dir = PathBuf::from(r"C:\\Program Files\\nodejs");
        let paths = build_windows_node_command_paths(base_dir.clone());

        assert_eq!(paths.node_dir, base_dir);
        assert_eq!(paths.node_exe, paths.node_dir.join("node.exe"));
        assert_eq!(paths.npm_cmd, paths.node_dir.join("npm.cmd"));
        assert_eq!(paths.pnpm_cmd, paths.node_dir.join("pnpm.cmd"));

        let labels = windows_node_command_path_labels(&paths);
        assert!(labels.contains("node.exe"));
        assert!(labels.contains("npm.cmd"));
        assert!(labels.contains("pnpm.cmd"));
    }
}

// Set environment variables to help work around GBM/graphics issues in some Linux environments


#[command]
async fn get_web_service_info(url: String) -> bool {
    let client = reqwest::Client::new();
    let target_url = url.trim_end_matches('/').to_string();

    match client.get(&target_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => r.status().is_success(),
        Err(_) => false,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebServiceInfo {
    student_count: Option<u32>,
    lesson_count: Option<u32>,
    work_count: Option<u32>,
    system_uptime: Option<String>,
    asp_net_memory: Option<f64>,
    asp_net_thread_count: Option<u32>,
    db_size: Option<String>,
}

#[command]
async fn fetch_web_service_business_info(url: String) -> Result<Option<WebServiceInfo>, String> {
    let client = reqwest::Client::new();
    let target_url = url.trim_end_matches('/').to_string();

    // 先检查 web 服务是否可达
    match client.get(&target_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(r) => {
            if !r.status().is_success() {
                return Ok(None);
            }
        }
        Err(_) => return Ok(None),
    }

    // 尝试从 API 端点获取业务数据
    let api_url = format!("{}/api/status", target_url);
    match client.get(&api_url)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<WebServiceInfo>().await {
                    Ok(info) => Ok(Some(info)),
                    Err(e) => {
                        log::warn!("解析业务信息失败: {}", e);
                        Ok(None)
                    }
                }
            } else {
                Ok(None)
            }
        }
        Err(e) => {
            log::warn!("获取业务信息失败: {}", e);
            Ok(None)
        }
    }
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
            cancel_flag: Arc::new(AtomicBool::new(false)),
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
            cancel_sync,
            get_sync_progress,
            get_system_info,
            get_web_service_info,
            fetch_web_service_business_info,
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
