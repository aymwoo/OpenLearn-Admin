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
}

const CONFIG_KEY = 'git-updater-config';

export const DEFAULT_GIT_CONFIG: GitConfig = {
  remoteUrl: '',
  localPath: 'C:\\inetpub\\wwwroot',
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
    | 'checking'
    | 'reading_remote_version'
    | 'reading_remote_changelog'
    | 'backup'
    | 'pulling'
    | 'refreshing_local'
    | 'done'
    | 'error';
  percent: number;
  label: string;
  result?: PullResult;
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

export async function loadConfig(): Promise<GitConfig | null> {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(CONFIG_KEY);
  return stored ? { ...DEFAULT_GIT_CONFIG, ...JSON.parse(stored) } : null;
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
    console.error("Git status check failed:", error);
    return {
      hasUpdates: false,
      ahead: 0,
      behind: 0,
      branch: branch || "main",
      lastCommitTime: "Error",
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
  courses: number;
  students: number;
  works: number;
  uptime: string;
  startTime: string;
  memoryMB: string;
  dbSize: string;
}

/**
 * 从已经运行的web服务页面获取系统信息
 */
export async function getWebServiceSystemInfo(url?: string): Promise<SystemInfo> {
  if (!url) {
    throw new Error('未提供 Web 服务 URL');
  }
  const targetUrl = `${url.replace(/\/$/, '')}/api/sysinfo`;
  try {
    const res = await fetch(targetUrl);
    if (!res.ok) {
      throw new Error(`HTTP 错误: ${res.status}`);
    }
    return await res.json();
  } catch (error) {
    throw new Error(`无法从 ${targetUrl} 读取信息: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * 从web服务获取详细的业务数据和运行时信息
 * 使用 Tauri 后端进行请求以绕过浏览器 CORS 限制
 */
export async function getWebServiceInfo(url: string): Promise<WebServiceInfo> {
  try {
    return await invoke<WebServiceInfo>('get_web_service_info', { url });
  } catch (error) {
    console.error("Web Service Info fetch failed:", error);
    throw new Error(String(error) || '无法连接到 Web 服务，请检查 URL 是否正确。');
  }
}
