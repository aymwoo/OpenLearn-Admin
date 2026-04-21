import { invoke } from '@tauri-apps/api/core';

export interface SystemInfo {
  uptime: number;
  cpuUsage: number;
  memoryTotal: number;
  memoryUsed: number;
  diskTotal: number;
  diskAvailable: number;
}

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>('get_system_info');
}
