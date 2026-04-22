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

export async function runSmartPull(config: GitConfig): Promise<PullResult> {
  return invoke<PullResult>('run_smart_pull', { config });
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

export async function getRemoteStatus(path: string): Promise<{ hasUpdates: boolean; ahead: number; behind: number; branch: string; lastCommitTime: string }> {
  try {
    const result = await invoke<{ branch: string; hasUpdates: boolean; ahead: number; behind: number; lastCommitTime: string }>('git_status', { path });
    return result;
  } catch {
    return { hasUpdates: false, ahead: 0, behind: 0, branch: 'main', lastCommitTime: 'Unknown' };
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


/**
 * 从已经运行的web服务页面获取系统信息
 */
export async function getSystemInfo(url?: string): Promise<SystemInfo> {
  try {
    const targetUrl = url || 'http://127.0.0.1:8000';
    // If targetUrl does not have /api/sysinfo, append it, or we expect full url?
    // Let's assume the user enters the base url, so we append /api/sysinfo,
    // or if they enter full url we just use it. Let's assume it's base url.
    const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/sysinfo`);
    if (!res.ok) {
      throw new Error();
    }
    return await res.json();
  } catch (error) {
    throw new Error('读取不到信息,请检查web服务是否启动');
  }
}
