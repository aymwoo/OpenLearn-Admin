import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

export interface GitConfig {
  remoteUrl: string;
  localPath: string;
  branch: string;
  forcePush: boolean;
  backupBeforePull: boolean;
  versionFilePath: string;
  changelogFilePath: string;
  webServiceUrl?: string;
  isWindows?: boolean;
}

const CONFIG_KEY = 'git-updater-config';

export const DEFAULT_GIT_CONFIG: GitConfig = {
  remoteUrl: 'https://gitee.com/nylon26/openlearnsite.git',
  localPath: '',
  branch: 'main',
  forcePush: false,
  backupBeforePull: true,
  versionFilePath: 'release.log',
  changelogFilePath: 'CHANGELOG.md',
  webServiceUrl: 'http://127.0.0.1:8000',
};

export interface RepoSyncStatus {
  currentBranch: string;
  hasUpdates: boolean;
  localVersion?: string;
  remoteVersion?: string;
}

export interface VersionDetails {
  version: string;
  branch?: string;
  lastFetchedAt?: string;
  changelogSection?: string;
  changelogDiff?: string;
  source: 'local' | 'remote';
}

export interface FetchProgress {
  stage:
    | 'idle'
    | 'cloning'
    | 'checking'
    | 'reading_remote_version'
    | 'reading_remote_changelog'
    | 'backup'
    | 'pulling'
    | 'refreshing_local'
    | 'transferring'
    | 'done'
    | 'error';
  percent: number;
  label: string;
  result?: PullResult;
  receivedBytes?: number;
  totalObjects?: number;
  receivedObjects?: number;
}

export interface SystemInfo {
  uptimeDays: number;
  dbSizeTb: number;
  dbSizePercentage: number;
  cpuUsage: number;
  memUsageGb: number;
  memTotalGb: number;
  memUsagePercentage: number;
  diskFreeTb: number;
  diskTotalTb: number;
  diskUsagePercentage: number;
}

export interface DashboardData {
  status: RepoSyncStatus;
  local: VersionDetails;
  remote: VersionDetails;
}

export interface PullResult {
  updated: boolean;
  skipped: boolean;
  message: string;
  local: VersionDetails;
  remote: VersionDetails;
}

export async function getDefaultConfig(): Promise<GitConfig> {
  const isWin = await isWindowsHost();
  return {
    ...DEFAULT_GIT_CONFIG,
    localPath: isWin ? 'LearnSite' : '',
  };
}

export async function loadConfig(): Promise<GitConfig | null> {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CONFIG_KEY);
  if (!stored) return null;
  
  try {
    const isWin = await isWindowsHost();
    const config = JSON.parse(stored);
    
    // 如果存储的路径为空且在 Windows 上，应用默认路径
    if (!config.localPath && isWin) {
      config.localPath = 'LearnSite';
    }
    
    return { ...DEFAULT_GIT_CONFIG, ...config };
  } catch (err) {
    console.error('Failed to parse git config', err);
    return null;
  }
}

export async function saveConfig(config: GitConfig): Promise<void> {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function getDashboardData(config: GitConfig): Promise<DashboardData> {
  return invoke<DashboardData>('get_dashboard_data', { config });
}

export async function runSmartPull(config: GitConfig): Promise<void> {
  return invoke<void>('run_smart_pull', { config });
}

export async function listenPullProgress(handler: (progress: FetchProgress) => void): Promise<UnlistenFn> {
  return listen<FetchProgress>('pull-progress', (event) => handler(event.payload));
}

export async function cloneRepo(url: string, path: string, branch: string = 'main'): Promise<void> {
  await invoke<string>('git_clone', { url, path, branch });
}

export async function pullRepo(path: string, force: boolean = false): Promise<{ success: boolean; message: string }> {
  try {
    const result = await invoke<string>('git_pull', { path, force });
    return { success: true, message: result || 'Pull successful' };
  } catch (error: unknown) {
    return { success: false, message: error instanceof Error ? error.message : String(error) };
  }
}

export async function getRemoteStatus(
  path: string,
  branch?: string
): Promise<{
  hasUpdates: boolean;
  ahead: number;
  behind: number;
  branch: string;
  remote?: string;
  local_oid?: string;
  remote_oid?: string;
  lastCommitTime: string;
}> {
  try {
    const result = await invoke<{
      branch: string;
      remote: string;
      hasUpdates: boolean;
      ahead: number;
      behind: number;
      local_oid: string;
      remote_oid: string;
      lastCommitTime: string;
    }>("git_status", { path, branch });
    return result;
  } catch (error) {
    const msg = typeof error === 'string' ? error : String(error);
    const isExpected = msg.includes('空文件夹') || msg.includes('请先克隆') || msg.includes('不是有效') || msg.includes('路径不存在') || msg.includes('正在被其他操作');
    if (!isExpected) {
      console.warn("Git status check:", msg);
    }
    return {
      hasUpdates: false,
      ahead: 0,
      behind: 0,
      branch: branch || "main",
      lastCommitTime: "-",
    };
  }
}

export async function getBranches(path: string): Promise<string[]> {
  try {
    const result = await invoke<string[]>('git_branches', { path });
    return result.length > 0 ? result : ['main', 'master'];
  } catch {
    return ['main', 'master'];
  }
}

export async function backupRepo(sourcePath: string): Promise<string> {
  return await invoke<string>('git_backup', { sourcePath });
}

export async function startService(path: string): Promise<string> {
  return await invoke<string>('start_service', { path });
}

export async function stopService(): Promise<string> {
  return await invoke<string>('stop_service');
}

export async function listenServiceLog(handler: (log: string) => void): Promise<UnlistenFn> {
  return listen<string>('service-log', (event) => handler(event.payload));
}



export interface WebServiceInfo {
  studentCount: number;
  lessonCount: number;
  workCount: number;
  systemUptime: string;
  processStartTime: string;
  aspNetMemory: string;
  aspNetThreadCount: number;
  dbSize?: string;
}

/**
 * 从已经运行的web服务页面获取系统信息
 */
export async function getSystemInfo(url?: string): Promise<SystemInfo> {
  try {
    const targetUrl = url || 'http://127.0.0.1:8000';
    const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/sysinfo`);
    if (!res.ok) {
      throw new Error();
    }
    return await res.json();
  } catch (error) {
    throw new Error('读取不到信息,请检查web服务是否启动');
  }
}

/**
 * 从web服务获取详细的业务数据和运行时信息
 * 使用 Tauri 后端进行请求以绕过浏览器 CORS 限制
 * 返回 null 表示连接失败或服务未启动，由页面处理错误显示
 */
export async function getWebServiceInfo(url: string): Promise<WebServiceInfo | null> {
  const result = await invoke<WebServiceInfo | null>('get_web_service_info', { url });
  if (!result) {
    console.warn("Web Service Info fetch failed: 无法连接到 Web 服务，请检查服务是否启动");
  }
  return result;
}

export interface DbConnectionStatus {
  connected: boolean;
  server: string;
  database: string;
  provider: string;
  error?: string;
}

export async function getDbConnectionStatus(localPath: string): Promise<DbConnectionStatus> {
  try {
    return await invoke<DbConnectionStatus>('get_database_connection_status', { localPath });
  } catch (error) {
    return {
      connected: false,
      server: '未知',
      database: '未知',
      provider: 'SqlServer',
      error: String(error),
    };
  }
}

export async function executeWindowsInstall(): Promise<void> {
  throw new Error('Windows 一键安装功能已移除，请手动安装环境');
}

export async function listenInstallProgress(handler: (log: string) => void): Promise<UnlistenFn> {
  return () => {};
}

export async function isWindowsHost(): Promise<boolean> {
  return await invoke<boolean>('is_windows');
}

export async function initializeDatabase(): Promise<void> {
  throw new Error('数据库初始化功能已移除，请在 SQL Server Management Studio 中手动操作');
}

export async function startDbService(): Promise<string> {
  return await invoke('start_db_service');
}

export async function stopDbService(): Promise<string> {
  return await invoke('stop_db_service');
}
