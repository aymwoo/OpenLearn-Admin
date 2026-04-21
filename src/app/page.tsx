'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { getSystemInfo, type SystemInfo } from '@/lib/sys';
import {
  type DashboardData,
  type FetchProgress,
  type GitConfig,
  type RepoSyncStatus,
  type VersionDetails,
  getDashboardData,
  getRemoteStatus,
  listenPullProgress,
  loadConfig,
  runSmartPull,
} from '@/lib/git';

export default function Dashboard() {
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [status, setStatus] = useState<RepoSyncStatus | null>(null);
  const [localDetails, setLocalDetails] = useState<VersionDetails | null>(null);
  const [remoteDetails, setRemoteDetails] = useState<VersionDetails | null>(null);
  const [progress, setProgress] = useState<FetchProgress>({ stage: 'idle', percent: 0, label: '' });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [remoteStatus, setRemoteStatus] = useState<{ ahead: number; behind: number; lastCommitTime: string } | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);

  const applyDashboardData = (data: DashboardData) => {
    setStatus(data.status);
    setLocalDetails(data.local);
    setRemoteDetails(data.remote);
  };

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    const hydrate = async () => {
      const cfg = await loadConfig();
      if (!mounted || !cfg) {
        return;
      }

      setConfig(cfg);

      try {
        const data = await getDashboardData(cfg);
        if (!mounted) {
          return;
        }
        applyDashboardData(data);

        // Get ahead/behind/lastCommitTime
        const rs = await getRemoteStatus(cfg.localPath);
        if (mounted) {
          setRemoteStatus(rs);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("空文件夹") || errMsg.includes("请先克隆") || errMsg.includes("不是有效的 Git")) {
          if (mounted) {
            setStatus({
              currentBranch: cfg.branch,
              hasUpdates: false,
              localVersion: undefined,
              remoteVersion: undefined,
            });
            setMessage('本地仓库未初始化，请点击"System Update"自动克隆仓库');
            const rs = await getRemoteStatus(cfg.localPath);
            if (mounted) setRemoteStatus(rs);
          }
        } else if (mounted) {
          setStatus({
            currentBranch: cfg.branch,
            hasUpdates: false,
            localVersion: undefined,
            remoteVersion: undefined,
          });
          setMessage(errMsg);
          const rs = await getRemoteStatus(cfg.localPath);
          if (mounted) setRemoteStatus(rs);
        }
      }
    };

    hydrate();

    listenPullProgress((nextProgress) => {
      if (mounted) {
        setProgress(nextProgress);
      }
    }).then((dispose) => {
      unlisten = dispose;
    }).catch(() => {});

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchSysInfo = async () => {
      try {
        const info = await getSystemInfo();
        if (mounted) {
          setSysInfo(info);
        }
      } catch (err) {
        console.error('Failed to get system info:', err);
      }
    };

    fetchSysInfo();
    const interval = setInterval(fetchSysInfo, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return { value: 0, unit: 'B' };
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
      value: parseFloat((bytes / Math.pow(k, i)).toFixed(1)),
      unit: sizes[i]
    };
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    if (days > 0) return { value: days, unit: '天' };
    const hours = Math.floor(seconds % (3600 * 24) / 3600);
    if (hours > 0) return { value: hours, unit: '小时' };
    const minutes = Math.floor(seconds % 3600 / 60);
    return { value: minutes, unit: '分钟' };
  };


  const handlePull = async () => {
    if (!config) return;

    setLoading(true);
    setMessage('');

    try {
      const result = await runSmartPull(config);
      setMessage(result.message);
      setLocalDetails(result.local);
      setRemoteDetails(result.remote);
      setProgress({ stage: 'done', percent: 100, label: result.message });

      const data = await getDashboardData(config);
      applyDashboardData(data);

      const rs = await getRemoteStatus(config.localPath);
      setRemoteStatus(rs);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      setMessage(nextMessage);
      setProgress((current) => ({
        ...current,
        stage: 'error',
        label: nextMessage,
      }));

      const rs = await getRemoteStatus(config.localPath);
      setRemoteStatus(rs);
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Link href="/settings" className="text-primary hover:underline">请先配置仓库</Link>
      </div>
    );
  }

  // Derived state calculations
  const localVer = localDetails?.version ?? status?.localVersion ?? '-';
  const remoteVer = remoteDetails?.version ?? status?.remoteVersion ?? '-';
  const isUpToDate = !status?.hasUpdates;
  const uptime = sysInfo ? formatUptime(sysInfo.uptime) : null;

  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      {/* SideNavBar */}
      <nav className="h-screen w-64 fixed left-0 top-0 bg-[#f7f9fb] dark:bg-slate-950 flex flex-col p-4 space-y-6 border-r-0 z-20">
        <div className="flex items-center space-x-3 px-2 py-4">
          <div className="w-10 h-10 rounded-xl bg-primary-container flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-primary font-bold">memory</span>
          </div>
          <div>
            <h1 className="text-xl font-black text-[#004394] dark:text-blue-500 font-headline tracking-tight">OpenLearnsite</h1>
            <p className="text-xs text-on-surface-variant font-label">v4.2.1 Stable</p>
          </div>
        </div>
        
        <div className="flex-1 space-y-2">
          <Link href="/" className="flex items-center space-x-3 px-4 py-3 bg-[#ffffff] dark:bg-slate-800 text-[#004394] dark:text-blue-300 rounded-xl shadow-sm font-headline text-sm font-semibold active:translate-x-1 transition-transform">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>dashboard</span>
            <span>Dashboard</span>
          </Link>
          <Link href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1">
            <span className="material-symbols-outlined">folder_managed</span>
            <span>Repositories</span>
          </Link>
          <Link href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1">
            <span className="material-symbols-outlined">insights</span>
            <span>Metrics</span>
          </Link>
          <Link href="#" className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1">
            <span className="material-symbols-outlined">terminal</span>
            <span>Terminal</span>
          </Link>
        </div>

        <div className="space-y-4 pt-4 border-t border-surface-container-high before:content-[''] before:block before:w-full before:h-px before:bg-surface-container-high before:mb-4">
          <button onClick={handlePull} disabled={loading} className="w-full flex items-center justify-center space-x-2 bg-primary text-on-primary py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-primary-container transition-colors shadow-[0_12px_40px_rgba(0,67,148,0.08)] disabled:opacity-50">
            <span className="material-symbols-outlined text-sm">{loading ? 'sync' : 'update'}</span>
            <span>{loading ? 'Updating...' : 'System Update'}</span>
          </button>
          <div className="space-y-1">
            <Link href="#" className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold">
              <span className="material-symbols-outlined">help</span>
              <span>Support</span>
            </Link>
            <Link href="/settings" className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold">
              <span className="material-symbols-outlined">settings</span>
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex justify-between items-center w-full px-8 py-4 backdrop-blur-xl bg-[#f7f9fb]/85 dark:bg-slate-950/85 shadow-[0_12px_40px_rgba(0,67,148,0.08)] z-10 sticky top-0">
          <div className="flex items-center space-x-4">
            <h2 className="font-headline text-lg font-bold tracking-tight text-[#004394] dark:text-blue-400">系统概览</h2>
            <div className="flex items-center space-x-2 bg-surface-container-lowest px-3 py-1.5 rounded-full outline outline-1 outline-outline-variant/15">
              <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(1,90,193,0.5)] ${isUpToDate ? 'bg-[#34a853]' : 'bg-[#fbbc04]'}`}></div>
              <span className="text-xs font-semibold text-on-surface">{isUpToDate ? '系统正常' : '需要更新'}</span>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <button className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95">
                  <span className="material-symbols-outlined">database</span>
              </button>
              <button className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95">
                  <span className="material-symbols-outlined">cloud_done</span>
              </button>
              <button className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95">
                  <span className="material-symbols-outlined">settings</span>
              </button>
            </div>
            <div className="flex space-x-3">
              <button disabled={loading} className="px-5 py-2 bg-secondary-container text-on-secondary-container rounded-xl font-semibold text-sm hover:bg-surface-variant transition-colors disabled:opacity-50">
                Stop Service
              </button>
              <button onClick={handlePull} disabled={loading} className="px-5 py-2 bg-primary text-on-primary rounded-xl font-semibold text-sm hover:bg-primary-container transition-colors shadow-[0_4px_14px_rgba(0,67,148,0.3)] disabled:opacity-50">
                Start Service
              </button>
            </div>
            <div className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant">person</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
            <div className="col-span-1 md:col-span-3 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 text-on-primary relative overflow-hidden shadow-[0_12px_40px_rgba(0,67,148,0.08)]">
              <div className="relative z-10 flex justify-between items-center h-full">
                <div>
                  <p className="text-sm font-semibold opacity-80 mb-2">系统状态</p>
                  <h3 className="text-4xl md:text-5xl font-headline font-bold tracking-tight mb-2">
                    {progress.percent > 0 && progress.percent < 100 ? `${Math.round(progress.percent)}%` : (isUpToDate ? '100% 优化' : '发现新版本')}
                  </h3>
                  <p className="text-on-primary-container text-sm">{progress.label || (isUpToDate ? '所有核心服务正在最佳状态运行。' : '推荐执行系统更新以获取最新特性。')}</p>
                </div>
                <div className="relative w-32 h-32 flex items-center justify-center shrink-0 ml-4">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" fill="none" r="40" stroke="rgba(255,255,255,0.2)" strokeWidth="8"></circle>
                    <circle className="transition-all duration-1000 ease-out" cx="50" cy="50" fill="none" r="40" stroke="#ffffff" strokeDasharray="251.2" strokeDashoffset={251.2 - (251.2 * (progress.percent || (isUpToDate ? 100 : 0)) / 100)} strokeWidth="8"></circle>
                  </svg>
                  <span className="absolute text-2xl font-bold">{Math.round(progress.percent || (isUpToDate ? 100 : 0))}</span>
                </div>
              </div>
            </div>

            <div className="col-span-1 md:col-span-2 bg-surface-container-lowest rounded-xl p-6 flex flex-col justify-center space-y-4 shadow-sm outline outline-1 outline-outline-variant/15 overflow-hidden">
              <div className="min-w-0">
                <p className="text-xs text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">本地版本</p>
                <div className="flex items-baseline space-x-2 min-w-0">
                  <span className="text-xl xl:text-2xl font-bold text-on-surface font-headline truncate" title={localVer}>{localVer}</span>
                  <span className="text-xs text-surface-tint font-semibold shrink-0">稳定版</span>
                </div>
              </div>
              <div className="h-px w-full bg-surface-container-low shrink-0"></div>
              <div className="min-w-0">
                <p className="text-xs text-on-surface-variant font-semibold mb-1 uppercase tracking-wider">远程版本</p>
                <div className="flex items-baseline space-x-2 min-w-0">
                  <span className="text-xl xl:text-2xl font-bold text-on-surface font-headline truncate" title={remoteVer}>{remoteVer}</span>
                  {!isUpToDate && <span className="text-xs text-[#ba1a1a] font-semibold shrink-0">可用更新</span>}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-1 bg-surface-container-lowest rounded-xl p-6 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col h-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-headline font-bold text-primary text-lg">代码仓库状态</h3>
                <button onClick={handlePull} disabled={loading} className="text-surface-tint hover:bg-surface-container-low p-1.5 rounded-lg transition-colors">
                  <span className={`material-symbols-outlined text-xl ${loading ? 'animate-spin' : ''}`}>sync</span>
                </button>
              </div>
              <div className="flex-1 flex flex-col space-y-4">
                <div className="flex flex-col space-y-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary-container/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary text-4xl">code</span>
                    </div>
                    <div>
                      <h4 className="text-2xl font-bold text-on-surface tracking-tight overflow-hidden text-ellipsis whitespace-nowrap max-w-[150px]" title={config.localPath.split('/').pop()}>
                        {config.localPath.split('/').pop()}
                      </h4>
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-surface-tint"></span>
                        <p className="text-sm text-on-surface-variant font-semibold">Primary Repository</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-surface-container-low rounded-xl">
                      <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1">Current Branch</p>
                      <p className="text-sm font-bold text-primary flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">account_tree</span>
                        {config.branch}
                      </p>
                    </div>
                    <div className="p-3 bg-surface-container-low rounded-xl">
                      <p className="text-[10px] uppercase tracking-widest text-outline font-bold mb-1">Status</p>
                      <p className={`text-sm font-bold ${isUpToDate ? 'text-emerald-600' : 'text-[#ba1a1a]'} flex items-center gap-1`}>
                        <span className="material-symbols-outlined text-sm">{isUpToDate ? 'check_circle' : 'error'}</span>
                        {isUpToDate ? 'Up to date' : 'Updates'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-3 px-1">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">Ahead / Behind</span>
                      <span className="font-mono text-xs bg-surface-container-high px-2 py-1 rounded text-on-surface">
                        {remoteStatus ? `+${remoteStatus.ahead} / -${remoteStatus.behind}` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">Last Fetched</span>
                      <span className="text-on-surface font-semibold">{localDetails?.lastFetchedAt?.split(' ')[1] || '-'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-on-surface-variant">Build Pipeline</span>
                      <span className="text-surface-tint font-semibold flex items-center gap-1">
                        {loading ? (
                          <><span className="material-symbols-outlined text-sm animate-spin">sync</span> Running</>
                        ) : (
                          <><span className="material-symbols-outlined text-sm">pause_circle</span> Idle</>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                
                <button className="mt-4 w-full py-2 border border-outline-variant/30 rounded-xl text-sm font-semibold text-primary hover:bg-surface-container-low transition-colors">
                    查看所有仓库
                </button>
              </div>
            </div>

            <div className="xl:col-span-2 grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 col-span-2 lg:col-span-1 flex flex-col justify-center relative overflow-hidden group">
                <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                  <span className="material-symbols-outlined text-9xl text-emerald-500">schedule</span>
                </div>
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">系统正常运行时间</p>
                <h4 className="text-3xl font-headline font-bold text-on-surface">{uptime ? uptime.value : '-'} <span className="text-lg text-on-surface-variant font-semibold">{uptime ? uptime.unit : ''}</span></h4>
                <p className="text-xs text-on-surface-variant mt-2">自上次重启</p>
              </div>
              
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-amber-500 text-sm">database</span>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">数据库大小 (估算)</p>
                </div>
                <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                  {sysInfo ? formatBytes(sysInfo.diskTotal * 0.15).value : '-'} <span className="text-sm text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.diskTotal * 0.15).unit : ''}</span>
                </h4>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-amber-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${sysInfo ? Math.min(100, Math.max(0, 0.15 * 100)) : 0}%` }}></div>
                </div>
                <p className="text-xs text-on-surface-variant mt-2">按磁盘总容量的 15% 估算，仅供参考</p>
              </div>

              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-rose-500 text-sm">memory</span>
                  <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">CPU 使用率</p>
                </div>
                <div className="flex items-baseline space-x-1 mb-1">
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{sysInfo ? sysInfo.cpuUsage.toFixed(0) : '-'}%</h4>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${sysInfo ? Math.min(100, Math.max(0, sysInfo.cpuUsage)) : 0}%` }}></div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-symbols-outlined text-purple-500 text-sm">memory_alt</span>
                  <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">内存使用情况</p>
                </div>
                <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                  {sysInfo ? formatBytes(sysInfo.memoryUsed).value : '-'} <span className="text-sm text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.memoryUsed).unit : ''}</span>
                </h4>
                <p className="text-xs text-on-surface-variant mt-1">/ {sysInfo ? `${formatBytes(sysInfo.memoryTotal).value} ${formatBytes(sysInfo.memoryTotal).unit}` : '-'} 总计</p>
                <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                  <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${sysInfo && sysInfo.memoryTotal > 0 ? (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center col-span-2 lg:col-span-2">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="material-symbols-outlined text-cyan-500 text-sm">hard_drive</span>
                    <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">磁盘空间</p>
                  </div>
                  <p className="text-xs font-semibold text-on-surface-variant">{sysInfo ? `${formatBytes(sysInfo.diskTotal).value} ${formatBytes(sysInfo.diskTotal).unit}` : '-'} 总计</p>
                </div>
                <div className="flex items-end justify-between mb-2">
                  <h4 className="text-3xl font-headline font-bold text-on-surface">{sysInfo ? formatBytes(sysInfo.diskAvailable).value : '-'} <span className="text-base text-on-surface-variant font-semibold">{sysInfo ? formatBytes(sysInfo.diskAvailable).unit : ''} 可用</span></h4>
                  <span className="text-sm font-semibold text-on-surface">{sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal * 100).toFixed(0) : 0}% 已用</span>
                </div>
                <div className="w-full bg-surface-container-high rounded-full h-2 mt-1">
                  <div className="bg-cyan-500 h-2 rounded-full transition-all duration-500" style={{ width: `${sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal * 100) : 0}%` }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-inverse-surface rounded-xl p-4 shadow-sm h-64 flex flex-col font-mono text-sm relative overflow-hidden">
            <div className="flex items-center justify-between mb-3 border-b border-outline/30 pb-2">
              <div className="flex space-x-2">
                <div className="w-3 h-3 rounded-full bg-[#ba1a1a]"></div>
                <div className="w-3 h-3 rounded-full bg-[#fbbc04]"></div>
                <div className="w-3 h-3 rounded-full bg-[#34a853]"></div>
              </div>
              <p className="text-outline text-xs tracking-wider">SYSTEM_TERMINAL</p>
            </div>
            <div className="flex-1 overflow-y-auto text-outline-variant space-y-1">
              {message && <p><span className={message.includes('失败') || message.includes('error') ? 'text-[#ba1a1a]' : 'text-[#34a853]'}>[{message.includes('失败') || message.includes('error') ? 'ERROR' : 'SUCCESS'}]</span> {message}</p>}
              
              {remoteDetails?.changelogSection && (
                <div className="mt-2 text-surface-tint whitespace-pre-wrap text-xs border-l-2 border-surface-tint/30 pl-3">
                  {remoteDetails.changelogSection}
                </div>
              )}
              
              <p className="mt-4 text-on-primary">admin@lumina-os:~$ <span className="animate-pulse">_</span></p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
