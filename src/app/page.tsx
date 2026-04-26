"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { getSystemInfo, type SystemInfo } from "@/lib/sys";
import {
  type DashboardData,
  type DbConnectionStatus,
  type FetchProgress,
  type GitConfig,
  type RepoSyncStatus,
  type VersionDetails,
  type WebServiceInfo,
  getDashboardData,
  getRemoteStatus,
  getWebServiceInfo,
  fetchWebServiceBusinessInfo,
  getSyncProgress,
  listenPullProgress,
  loadConfig,
  runSmartPull,
  isWindowsHost,
  runProjectTask,
  stopProjectTask,
  listenServiceLog,
  isPortOccupied,
  checkNodeEnv,
} from "@/lib/git";
import { open as openUrl } from '@tauri-apps/plugin-shell';

export default function Dashboard() {
  const router = useRouter();
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [status, setStatus] = useState<RepoSyncStatus | null>(null);
  const [showChangelog, setShowChangelog] = useState(false);
  const [localDetails, setLocalDetails] = useState<VersionDetails | null>(null);
  const [remoteDetails, setRemoteDetails] = useState<VersionDetails | null>(
    null,
  );
  const [progress, setProgress] = useState<FetchProgress>({
    stage: "idle",
    percent: 0,
    label: "",
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [remoteStatus, setRemoteStatus] = useState<{
    ahead: number;
    behind: number;
    lastCommitTime: string;
  } | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [isWebServiceAccessible, setIsWebServiceAccessible] = useState(false);
  const [wsConnectionError, setWsConnectionError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const [webServiceInfo, setWebServiceInfo] = useState<WebServiceInfo | null>(null);
  const [isWindows, setIsWindows] = useState(false);
  const [runningTask, setRunningTask] = useState<string | null>(null);
  const [isDevActive, setIsDevActive] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [terminalCollapsed, setTerminalCollapsed] = useState(false);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<GitConfig | null>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

const applyDashboardData = (data: DashboardData) => {
    setStatus(data.status);
    setLocalDetails(data.local);
    setRemoteDetails(data.remote);
  };

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    isWindowsHost().then(win => {
      if (mounted) setIsWindows(win);
    });

    const hydrate = async () => {
      const cfg = await loadConfig();
      if (!mounted) {
        return;
      }

      if (!cfg) {
        router.push('/setup');
        return;
      }

      setConfig(cfg);

      if (typeof window !== 'undefined' && sessionStorage.getItem('settings_updated') === 'true') {
        sessionStorage.removeItem('settings_updated');
        setShowUpdatePrompt(true);
      } else {
        getDashboardData(cfg)
          .then((data) => {
            if (!mounted) return;
            applyDashboardData(data);
            getRemoteStatus(cfg.localPath, cfg.branch)
              .then((rs) => { if (mounted) setRemoteStatus(rs); })
              .catch(() => {});
          })
          .catch((error) => {
            if (!mounted) return;
            const errMsg = error instanceof Error ? error.message : String(error);
            setStatus({
              currentBranch: cfg.branch,
              hasUpdates: false,
              localVersion: undefined,
              remoteVersion: undefined,
            });
            if (
              errMsg.includes("空文件夹") ||
              errMsg.includes("请先克隆") ||
              errMsg.includes("不是有效的 Git") ||
              errMsg.includes("路径不存在")
            ) {
              setMessage('本地仓库未初始化，请前往设置页面重新配置并同步');
            } else {
              setMessage(errMsg);
            }
          });
      }
      getSyncProgress().then(p => {
        if (mounted && p.stage !== 'idle' && p.stage !== 'done' && p.stage !== 'error') {
          setProgress(p);
          setLoading(true);
        }
      }).catch(() => {});
    };

    hydrate();

    const unlistenLog = listenServiceLog((log) => {
      setTerminalLogs(prev => [...prev.slice(-100), log]);
    });

    listenPullProgress((nextProgress) => {
      if (mounted) {
        setProgress(nextProgress);

        if (nextProgress.stage === "done" && nextProgress.result) {
          const res = nextProgress.result;
          setMessage(res.message);
          setLocalDetails(res.local);
          setRemoteDetails(res.remote);
          setStatus({
            currentBranch: configRef.current?.branch || "main",
            hasUpdates: res.local.version !== res.remote.version,
            localVersion: res.local.version,
            remoteVersion: res.remote.version,
          });
          setLoading(false);
          hydrate();
        } else if (nextProgress.stage === "error") {
          setMessage(nextProgress.label);
          setLoading(false);
        }
      }
    })
      .then((dispose) => {
        unlisten = dispose;
      })
      .catch(() => {});

    return () => {
      mounted = false;
      unlisten?.();
      unlistenLog.then(fn => fn());
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
        console.error("Failed to get system info:", err);
      }
    };

    fetchSysInfo();
    const interval = setInterval(fetchSysInfo, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    let interval: any;

    const fetchWSInfo = async () => {
      if (!configRef.current?.webServiceUrl) return;
      const accessible = await getWebServiceInfo(configRef.current.webServiceUrl);
      if (mounted) {
        setIsWebServiceAccessible(accessible);
        if (!accessible) {
          setWsConnectionError('服务暂时不可用，请检查服务是否启动');
          setWebServiceInfo(null);
        } else {
          setWsConnectionError(null);
          fetchWebServiceBusinessInfo(configRef.current.webServiceUrl).then(info => {
            if (mounted) setWebServiceInfo(info);
          });
        }
      }
    };

    if (config) {
      fetchWSInfo();
      interval = setInterval(fetchWSInfo, 5000);
    }

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [config]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return { value: 0, unit: "B" };
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return {
      value: parseFloat((bytes / Math.pow(k, i)).toFixed(1)),
      unit: sizes[i],
    };
  };



  const handlePull = async () => {
    if (!config) {
      setMessage("系统配置未加载，请先完成基本设置。");
      return;
    }

    setLoading(true);
    setMessage("");
    setProgress({ stage: "pulling", percent: 0, label: "准备同步...", status: "pending" });

    try {
      await runSmartPull(config);
    } catch (error) {
      const nextMessage =
        error instanceof Error ? error.message : String(error);
      setMessage(nextMessage);
      setProgress((current) => ({
        ...current,
        stage: "error",
        label: nextMessage,
      }));
      setLoading(false);
    }
  };

  const handleProjectTask = async (task: string) => {
    if (!config?.localPath) return;

    if (task === 'dev' && config.webServiceUrl) {
      try {
        const url = new URL(config.webServiceUrl);
        const port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
        const occupied = await isPortOccupied(port);
        if (occupied) {
          setTerminalLogs(prev => [...prev, `[WARNING] 端口 ${port} 已被占用！服务可能无法在预期端口启动。`]);
          const confirmStart = window.confirm(`警告：端口 ${port} 已被占用，可能是其他服务正在运行。是否仍要尝试启动？`);
          if (!confirmStart) {
            setTerminalLogs(prev => [...prev, '>>> 操作已取消']);
            return;
          }
        }
      } catch (e) {
        console.error('端口解析失败', e);
      }
    }

    setRunningTask(task);
    try {
      if (task === 'stop') {
        await stopProjectTask('dev');
        setIsDevActive(false);
        setTerminalLogs(prev => [...prev, '>>> 服务已手动停止']);
      } else {
        const result = await runProjectTask(task, config.localPath);
        if (task === 'dev') setIsDevActive(true);
        setTerminalLogs(prev => [...prev, `>>> 开始执行: ${task}`, result]);
      }
    } catch (err) {
      setTerminalLogs(prev => [...prev, `[ERROR] ${err}`]);
    }
    setRunningTask(null);
  };

  const handleOpenBrowser = async () => {
    if (config?.webServiceUrl) {
      try {
        await openUrl(config.webServiceUrl);
      } catch (err) {
        setTerminalLogs(prev => [...prev, `[ERROR] 无法打开浏览器: ${err}`]);
      }
    }
  };

  const refreshData = async () => {
    if (!config) return;
    setLoading(true);
    try {
      const result = await getDashboardData(config);
      setLocalDetails(result.local);
      setRemoteDetails(result.remote);
      setStatus({
        currentBranch: config.branch,
        hasUpdates: result.local.version !== result.remote.version,
        localVersion: result.local.version,
        remoteVersion: result.remote.version,
      });

      getRemoteStatus(config.localPath, config.branch)
        .then((rs) => setRemoteStatus(rs))
        .catch((err) => console.error("后台获取 Git 状态失败:", err));
    } catch (error) {
      console.error("刷新数据失败:", error);
    } finally {
      setLoading(false);
    }
  };
  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Link href="/settings" className="text-primary hover:underline">
          请先配置仓库
        </Link>
      </div>
    );
  }

  const localVer = localDetails?.version ?? status?.localVersion ?? "-";
  const remoteVer = remoteDetails?.version ?? status?.remoteVersion ?? "-";
  const isUpToDate = remoteStatus
    ? remoteStatus.behind === 0 &&
      (remoteStatus.ahead > 0 || localVer === remoteVer)
    : status?.hasUpdates === false && !!status?.localVersion;
  const isAhead = remoteStatus ? remoteStatus.ahead > 0 : false;
  const isUninitialized = message.includes("未初始化") || message.includes("请先克隆");
  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      <nav className="h-screen w-64 fixed left-0 top-0 bg-[#f7f9fb] dark:bg-slate-950 flex flex-col p-4 space-y-6 border-r-0 z-20">
        <div className="flex items-center px-2 py-4">
          <div>
            <h1 className="text-xl font-black text-[#004394] dark:text-blue-500 font-headline tracking-tight">
              OpenLearn Manager
            </h1>
            <p className="text-xs text-on-surface-variant font-label">
              v1.0.0 Stable
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <Link
            href="/"
            className="flex items-center space-x-3 px-4 py-3 bg-[#ffffff] dark:bg-slate-800 text-[#004394] dark:text-blue-300 rounded-xl shadow-sm font-headline text-sm font-semibold active:translate-x-1 transition-transform"
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              dashboard
            </span>
            <span>仪表盘</span>
          </Link>
        </div>

        <div className="space-y-4 pt-4 border-t border-surface-container-high before:content-[''] before:block before:w-full before:h-px before:bg-surface-container-high before:mb-4">
          <div className="space-y-1">
            <Link
              href="/docs"
              className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
            >
              <span className="material-symbols-outlined">help</span>
              <span>文档</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
            >
<span className="material-symbols-outlined">settings</span>
            <span>系统设置</span>
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex justify-between items-center w-full px-8 py-4 backdrop-blur-xl bg-[#f7f9fb]/85 dark:bg-slate-950/85 shadow-[0_12px_40px_rgba(0,67,148,0.08)] z-10 sticky top-0">
          <div className="flex items-center space-x-4">
            <h2 className="font-headline text-lg font-bold tracking-tight text-[#004394] dark:text-blue-400">
              系统概览
            </h2>
            <div className="flex items-center space-x-2 bg-surface-container-lowest px-3 py-1.5 rounded-full outline outline-1 outline-outline-variant/15">
              <div
                className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(1,90,193,0.5)] ${isUpToDate ? "bg-[#34a853]" : "bg-[#fbbc04]"}`}
              ></div>
              <span className="text-xs font-semibold text-on-surface">
                {isUpToDate
                  ? isAhead
                    ? "本地领先"
                    : "系统正常"
                  : "需要更新"}
              </span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-6">

              <div className="flex items-center">
                <div className="flex items-center justify-center px-3">
                  <span className={`material-symbols-outlined text-lg ${wsConnectionError ? 'text-rose-500' : 'text-blue-500'}`}>
                    language
                  </span>
                </div>
                <div className="flex items-center px-2">
                  <span className={`text-xs font-medium ${wsConnectionError ? 'text-rose-600' : 'text-blue-600'}`}>
                    {wsConnectionError ? '未连接' : '运行中'}
                  </span>
                </div>
              </div>

              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

              <button
                onClick={handlePull}
                disabled={loading}
                className={`flex items-center justify-center p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${loading ? "animate-spin text-primary" : ""}`}
                aria-label="Sync Repository"
                title="立即同步仓库"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {loading ? "sync" : "refresh"}
                </span>
              </button>

             <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>

             <Link
                href="/settings"
                className="flex items-center justify-center p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Settings"
                title="Settings"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  settings
                </span>
              </Link>
            </div>
          </div>
        </header>

        {showUpdatePrompt && (
          <div className="mx-8 mt-4 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-600 text-2xl">warning</span>
              <div>
                <p className="text-sm font-bold text-amber-800">设置已发生改变</p>
                <p className="text-xs text-amber-600 mt-0.5">是否需要立即从远端拉取最新更新？</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setShowUpdatePrompt(false); handlePull(); }}
                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors"
              >
                立即更新
              </button>
              <button
                onClick={() => { setShowUpdatePrompt(false); refreshData(); }}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                稍后再说
              </button>
              <button
                onClick={() => { setShowUpdatePrompt(false); refreshData(); }}
                className="p-2 hover:bg-amber-100 rounded-lg transition-colors text-amber-500"
                title="关闭"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className={`col-span-1 md:col-span-3 bg-gradient-to-br rounded-xl p-8 text-on-primary relative overflow-hidden transition-all duration-500 shadow-[0_12px_40px_rgba(0,67,148,0.08)] ${isUpToDate ? "from-primary to-primary-container" : "from-orange-500 to-orange-600"}`}>
                <div className="relative z-10 flex justify-between items-center h-full">
                  <div>
                    <p className="text-sm font-semibold opacity-80 mb-2">
                      系统状态表
                    </p>
                    <h3 className="text-4xl md:text-5xl font-headline font-bold tracking-tight mb-2">
                      {loading
                        ? `${Math.round(progress.percent)}%`
                        : isUninitialized
                          ? "本地仓库未初始化"
                          : isUpToDate
                            ? isAhead
                              ? "系统领先于远程"
                              : "系统已经是最新"
                            : "发现新版本"}
                    </h3>
                    <p className={`text-sm ${isUpToDate ? "text-on-primary-container" : "text-orange-50/90"}`}>
                      {loading
                        ? (progress.label || "正在同步...")
                        : (isUpToDate
                          ? isAhead
                            ? `本地领先远程 ${remoteStatus?.ahead || 0} 个提交。`
                            : "所有核心服务正在最佳状态运行。"
                          : (remoteStatus?.behind || 0) > 0
                            ? `落后远程 ${remoteStatus?.behind} 个提交，建议更新。`
                            : "检测到远程有新版本，建议同步仓库。")}
                    </p>

                    {loading && (
                      <div className="mt-6 w-full max-w-xs animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex justify-between items-center mb-1.5 px-0.5">
                          <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                            {progress.stage === 'cloning' ? 'Cloning' : 'Syncing'}
                          </span>
                          <span className="text-[10px] font-bold font-mono">
                            {Math.round(progress.percent)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden backdrop-blur-sm shadow-inner relative">
                          <div
                            className="h-full bg-white transition-all duration-700 ease-out shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                            style={{ width: `${progress.percent}%` }}
                          />
              </div>
              </div>
                    )}
                  </div>

                  <div
                    onClick={!loading && !isUninitialized && !isUpToDate ? handlePull : undefined}
                    className={`relative w-32 h-32 flex items-center justify-center shrink-0 ml-4 transition-all rounded-full ${!isUpToDate && !loading && !isUninitialized ? "hover:scale-105 active:scale-95 cursor-pointer shadow-lg shadow-orange-500/20" : "cursor-default opacity-90"}`}
                  >
                    <svg
                      className="w-full h-full transform -rotate-90 absolute top-0 left-0"
                      viewBox="0 0 100 100"
                    >
                      <circle
                        cx="50"
                        cy="50"
                        fill="none"
                        r="40"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="8"
                      ></circle>
                      <circle
                        className="transition-all duration-500 ease-out"
                        cx="50"
                        cy="50"
                        fill="none"
                        r="40"
                        stroke="#ffffff"
                        strokeDasharray="251.2"
                        strokeDashoffset={
                          251.2 -
                          (251.2 *
                            (progress.percent || (isUpToDate ? 100 : 0))) /
                            100
                        }
                        strokeWidth="8"
                      ></circle>
                    </svg>
                    <div className="z-10 flex flex-col items-center pointer-events-none">
                      {loading ? (
                        <span className="text-4xl font-bold font-headline">
                          {Math.round(progress.percent)}%
                        </span>
                      ) : isUninitialized ? (
                        <div className="pointer-events-auto">
                          <Link href="/settings" className="flex flex-col items-center group">
                            <span
                              className="material-symbols-outlined text-6xl group-hover:scale-110 transition-transform"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              settings
                            </span>
                            <span className="text-xs font-bold mt-1 opacity-80">前往设置</span>
                          </Link>
                        </div>
                      ) : !isUpToDate ? (
                        <div className="flex flex-col items-center">
                          <span
                            className="material-symbols-outlined text-6xl group-hover:scale-110 transition-transform"
                            style={{ fontVariationSettings: "'FILL' 1" }}
                          >
                            deployed_code_update
                          </span>
                        </div>
                      ) : (
                        <span
                          className="material-symbols-outlined text-6xl"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-1 md:col-span-2 bg-surface-container-lowest rounded-xl p-6 flex flex-col justify-center space-y-4 shadow-sm outline outline-1 outline-outline-variant/15 overflow-hidden">
                <div className="min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-on-surface-variant font-semibold tracking-wider">
                        本地版本
                      </p>
                      <span
                        className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-sm ${localVer.toLowerCase().match(/(beta|rc|alpha)/) ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30" : "text-primary bg-primary/10"}`}
                      >
                        {localVer.toLowerCase().match(/(beta|rc|alpha)/)
                          ? "测试版"
                          : "稳定版"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-2 min-w-0">
                    <span
                      className="text-xl xl:text-2xl font-bold text-on-surface font-headline truncate"
                      title={localVer}
                    >
                      {localVer}
                    </span>
                  </div>
                </div>
                <div className="h-px w-full bg-surface-container-low shrink-0"></div>
                <div 
                  className="min-w-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 -m-2 rounded-xl transition-all group"
                  onClick={() => setShowChangelog(true)}
                  title="点击查看更新日志"
                >
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center space-x-2">
                      <p className="text-sm text-on-surface-variant font-semibold tracking-wider">
                        远程版本
                      </p>
                      <span
                        className={`text-[12px] font-semibold px-1.5 py-0.5 rounded-sm ${remoteVer.toLowerCase().match(/(beta|rc|alpha)/) ? "text-amber-600 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30" : "text-primary bg-primary/10"}`}
                      >
                        {remoteVer.toLowerCase().match(/(beta|rc|alpha)/)
                          ? "测试版"
                          : "稳定版"}
                      </span>
                      {remoteStatus && (
                        <div className="flex items-center space-x-1.5 ml-1 bg-slate-100/50 dark:bg-slate-800/50 px-1.5 py-0.5 rounded-full">
                          <span
                            className={`flex items-center ${remoteStatus.ahead > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}
                          >
                            <span className="material-symbols-outlined text-[5px] mr-0.5">north</span>
                            <span className="text-[13px] font-bold tabular-nums">{remoteStatus.ahead}</span>
                          </span>
                          <span
                            className={`flex items-center ${remoteStatus.behind > 0 ? "text-amber-600 dark:text-amber-400" : "text-slate-400"}`}
                          >
                            <span className="material-symbols-outlined text-[5px] mr-0.5">south</span>
                            <span className="text-[13px] font-bold tabular-nums">{remoteStatus.behind}</span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline space-x-2 min-w-0">
                    <span
                      className="text-xl xl:text-2xl font-bold text-on-surface font-headline truncate"
                      title={remoteVer}
                    >
                      {remoteVer}
                    </span>
                    {!isUpToDate && (
                      <span className="text-xs text-amber-600 font-semibold shrink-0">
                        可用更新
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Row 1.2: Project Lifecycle Management */}
              <div className="bg-surface-container-lowest rounded-xl p-8 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col space-y-6">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-primary">rocket_launch</span>
                    </div>
                    <div>
                      <h2 className="text-xl font-bold font-headline text-on-surface">项目运维管理</h2>
                      <div className="flex items-center space-x-2 mt-1">
                        <div className={`w-2 h-2 rounded-full ${isDevActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                        <p className="text-sm text-on-surface-variant font-medium">
                          {isDevActive ? '开发服务运行中' : '服务未启动'}
                        </p>
                        {wsConnectionError && (
                          <button
                            onClick={() => {
                              setWsConnectionError(null);
                              const url = configRef.current?.webServiceUrl || '';
                              getWebServiceInfo(url).then(accessible => {
                                setIsWebServiceAccessible(accessible);
                                if (!accessible) {
                                  setWsConnectionError('服务暂时不可用');
                                  setWebServiceInfo(null);
                                } else {
                                  fetchWebServiceBusinessInfo(url).then(info => {
                                    setWebServiceInfo(info);
                                  });
                                }
                              });
                            }}
                            className="hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded transition-colors text-amber-600 dark:text-amber-400 shrink-0 leading-none p-1"
                            title="重试"
                          >
                            <span className="material-symbols-outlined inline-flex items-center" style={{ fontSize: '18px' }}>refresh</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-1">
                    <button 
                      onClick={handleOpenBrowser}
                      disabled={!config?.webServiceUrl}
                      className="p-2 hover:bg-surface-container-low rounded-xl transition-colors text-on-surface-variant disabled:opacity-50"
                      title="访问服务"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                    </button>
                    <button 
                      onClick={() => setTerminalLogs([])}
                      className="p-2 hover:bg-surface-container-low rounded-xl transition-colors text-on-surface-variant"
                      title="清空日志"
                    >
                      <span className="material-symbols-outlined">delete_sweep</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button 
                    onClick={() => handleProjectTask('install')}
                    disabled={!!runningTask}
                    className="flex flex-col items-center justify-center p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/10 hover:border-primary transition-all group disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary mb-2">package_2</span>
                    <span className="text-xs font-bold text-on-surface">安装依赖</span>
                  </button>
                  
                  {!isDevActive ? (
                    <button 
                      onClick={() => handleProjectTask('dev')}
                      disabled={!!runningTask}
                      className="flex flex-col items-center justify-center p-4 bg-primary/5 rounded-2xl border border-primary/10 hover:bg-primary/10 transition-all group disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-primary mb-2">play_arrow</span>
                      <span className="text-xs font-bold text-primary">启动服务</span>
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleProjectTask('stop')}
                      disabled={!!runningTask}
                      className="flex flex-col items-center justify-center p-4 bg-rose-500/5 rounded-2xl border border-rose-500/10 hover:bg-rose-500/10 transition-all group disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-rose-600 mb-2 animate-pulse">stop</span>
                      <span className="text-xs font-bold text-rose-600">停止服务</span>
                    </button>
                  )}

                  <button 
                    onClick={() => handleProjectTask('build')}
                    disabled={!!runningTask}
                    className="flex flex-col items-center justify-center p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/10 hover:border-primary transition-all group disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary mb-2">build_circle</span>
                    <span className="text-xs font-bold text-on-surface">执行构建</span>
                  </button>

                  <button 
                    onClick={() => handleProjectTask('dev')}
                    disabled={!isDevActive || !!runningTask}
                    className="flex flex-col items-center justify-center p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/10 hover:border-primary transition-all group disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary mb-2">restart_alt</span>
                    <span className="text-xs font-bold text-on-surface">重启服务</span>
                  </button>

                </div>

              {/* Console Output */}
              <div className="bg-[#0f172a] rounded-xl border border-slate-800">
                <button
                  onClick={() => setTerminalCollapsed(!terminalCollapsed)}
                  className="w-full flex items-center justify-between p-4 hover:bg-white/5 rounded-t-xl transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <div className="flex space-x-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]"></div>
                      <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f]"></div>
                    </div>
                    <span className="text-slate-500 text-[10px] font-bold tracking-widest uppercase ml-2">Terminal Output</span>
                    <span className="text-slate-600 text-[10px] ml-1">({terminalLogs.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {runningTask && (
                      <span className="text-[10px] text-primary animate-pulse font-bold uppercase">Executing {runningTask}...</span>
                    )}
                    <span className={`material-symbols-outlined text-slate-500 text-sm transition-transform ${terminalCollapsed ? 'rotate-180' : ''}`}>
                      expand_less
                    </span>
                  </div>
                </button>
                {!terminalCollapsed && (
                  <div className="px-5 pb-5 pt-0 font-mono text-sm flex flex-col h-[300px]">
                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar scroll-smooth">
                      {terminalLogs.length === 0 ? (
                        <p className="text-slate-600 italic text-xs">Waiting for task signals...</p>
                      ) : (
                        terminalLogs.map((log, i) => (
                          <p key={i} className={`break-all leading-relaxed text-[13px] ${
                            log.startsWith('>>>') ? 'text-blue-400 font-bold' : 
                            log.startsWith('[ERROR]') || log.startsWith('[ERR]') ? 'text-rose-400' : 
                            'text-slate-300'
                          }`}>
                            <span className="opacity-20 mr-2 select-none">{i + 1}</span>
                            {log}
                          </p>
                        ))
                      )}
                      <div ref={terminalEndRef} />
                    </div>
                  </div>
                )}
              </div>

            
            </div>

            {/* Row 2: Resource Metrics */}
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Metric: CPU Usage */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <span className="material-symbols-outlined text-9xl text-rose-500">
                      monitoring
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="material-symbols-outlined text-rose-500 text-sm">
                      settings_input_component
                    </span>
                    <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                      CPU 使用率
                    </p>
                  </div>
                  <h4 className="text-3xl font-headline font-bold text-on-surface">
                    {sysInfo?.cpuUsage ?? "--"}%
                  </h4>
                  <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-4">
                    <div
                      className="bg-rose-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${sysInfo?.cpuUsage ?? 0}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    实时处理器负载
                  </p>
                </div>

                {/* Metric: Memory Usage */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="material-symbols-outlined text-purple-500 text-sm">
                      memory_alt
                    </span>
                    <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
                      内存使用情况
                    </p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                    {sysInfo ? formatBytes(sysInfo.memoryUsed).value : "-"}{" "}
                    <span className="text-sm text-on-surface-variant font-semibold">
                      {sysInfo ? formatBytes(sysInfo.memoryUsed).unit : ""}
                    </span>
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-1">
                    /{" "}
                    {sysInfo
                      ? `${formatBytes(sysInfo.memoryTotal).value} ${formatBytes(sysInfo.memoryTotal).unit}`
                      : "-"}{" "}
                    总计
                  </p>
                  <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${sysInfo && sysInfo.memoryTotal > 0 ? (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Metric: Disk Space */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-cyan-500 text-sm">
                        hard_drive
                      </span>
                      <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                        磁盘空间
                      </p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <h4 className="text-2xl font-headline font-bold text-on-surface">
                      {sysInfo ? formatBytes(sysInfo.diskAvailable).value : "-"}{" "}
                      <span className="text-sm text-on-surface-variant font-semibold">
                        {sysInfo ? formatBytes(sysInfo.diskAvailable).unit : ""}{" "}
                        可用
                      </span>
                    </h4>
                    <span className="text-xs font-semibold text-on-surface-variant">
                      {sysInfo && sysInfo.diskTotal > 0
                        ? (
                            ((sysInfo.diskTotal - sysInfo.diskAvailable) /
                              sysInfo.diskTotal) *
                            100
                          ).toFixed(0)
                        : 0}
                      % 已用
                    </span>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-1">
                    <div
                      className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                      style={{
                        width: `${sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    总计 {sysInfo ? `${formatBytes(sysInfo.diskTotal).value} ${formatBytes(sysInfo.diskTotal).unit}` : "-"}
                  </p>
                </div>
              </div>
            </div>
            
            {/* Row 3: Terminal */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm h-64 flex flex-col font-mono text-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                </div>
                <div className="flex items-center space-x-2">
<p className="text-slate-400 text-xs tracking-wider">
                     CHANGELOG
                   </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto text-slate-600 space-y-1 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent p-2">
                {terminalLogs.length > 0 ? (
                  terminalLogs.map((log, i) => (
                    <p key={i} className="leading-relaxed">
                      <span className="text-slate-400 mr-2">[{new Date().toLocaleTimeString()}]</span>
                      <span className={
                        log.toLowerCase().includes("error") || log.includes("错误") 
                          ? "text-rose-600" 
                          : log.toLowerCase().includes("warn") || log.includes("警告")
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }>
                        {log}
                      </span>
                    </p>
                  ))
                ) : localDetails?.changelogSection ? (
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs">本地版本 {localDetails?.version} 最近更新：</p>
                    <pre className="text-slate-700 whitespace-pre-wrap font-mono text-sm leading-relaxed">{localDetails.changelogSection}</pre>
                    {message && (
                      <p className="mt-2 pt-2 border-t border-slate-200">
                        <span
                          className={
                            message.includes("失败") || message.includes("error")
                              ? "text-rose-600"
                              : "text-amber-600"
                          }
                        >
                          {message}
                        </span>
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    {message && (
                      <p>
                        <span
                          className={
                            message.includes("失败") || message.includes("error")
                              ? "text-[#ff5f56]"
                              : "text-[#27c93f]"
                          }
                        >
                          [
                          {message.includes("失败") || message.includes("error")
                            ? "ERROR"
                            : "SUCCESS"}
                          ]
                        </span>{" "}
                        {message}
                      </p>
                    )}

                  </>
                )}

                <p className="mt-4 text-white">
                  user@lumina-os:~$ <span className="animate-pulse">_</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Changelog Modal */}
      {showChangelog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <div className="flex justify-between items-center p-6 border-b dark:border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">history_edu</span>
                </div>
                <div>
                  <h3 className="text-xl font-bold font-headline text-[#004394] dark:text-blue-400">版本更新日志</h3>
                  <p className="text-sm text-slate-500 mt-0.5">远程版本: {remoteVer}</p>
                </div>
              </div>
              <button 
                onClick={() => setShowChangelog(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-8 max-h-[60vh] overflow-y-auto">
              {remoteDetails?.changelogSection ? (
                <div className="space-y-4">
                  <pre className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-mono leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                    {remoteDetails.changelogSection}
                  </pre>
                  {remoteDetails.changelogDiff && (
                    <div className="mt-4">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">新增内容</p>
                      <pre className="text-sm text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap font-mono leading-relaxed bg-emerald-50/50 dark:bg-emerald-900/20 p-6 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                        {remoteDetails.changelogDiff}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-20">event_note</span>
                  <p>暂无更新日志信息</p>
                </div>
              )}
            </div>
            <div className="p-6 bg-slate-50 dark:bg-slate-800/30 flex justify-end">
              <button 
                onClick={() => setShowChangelog(false)}
                className="px-8 py-2.5 bg-[#004394] text-white rounded-xl font-semibold shadow-lg shadow-blue-900/20 hover:scale-105 active:scale-95 transition-all"
              >
                我知道了
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
