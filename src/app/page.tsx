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
  getDashboardData,
  getDbConnectionStatus,
  getRemoteStatus,
  getWebServiceInfo,
  listenPullProgress,
  loadConfig,
  startService,
  stopService,
  runSmartPull,
  type WebServiceInfo,
} from "@/lib/git";

export default function Dashboard() {
  const router = useRouter();
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [status, setStatus] = useState<RepoSyncStatus | null>(null);
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
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const [serviceRunning, setServiceRunning] = useState(false);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [webServiceInfo, setWebServiceInfo] = useState<WebServiceInfo | null>(
    null
  );
  const [wsConnectionError, setWsConnectionError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const configRef = useRef<GitConfig | null>(null);

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

      try {
        const data = await getDashboardData(cfg);
        if (!mounted) {
          return;
        }
        applyDashboardData(data);

        // Get ahead/behind/lastCommitTime (Background)
        getRemoteStatus(cfg.localPath, cfg.branch)
          .then((rs) => { if (mounted) setRemoteStatus(rs); })
          .catch(() => {});

        const info = await getSystemInfo();
        if (mounted) {
          setSysInfo(info);
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (
          errMsg.includes("空文件夹") ||
          errMsg.includes("请先克隆") ||
          errMsg.includes("不是有效的 Git")
        ) {
          if (mounted) {
            setStatus({
              currentBranch: cfg.branch,
              hasUpdates: false,
              localVersion: undefined,
              remoteVersion: undefined,
            });
            setMessage('本地仓库未初始化，请点击"System Update"自动克隆仓库');
            getRemoteStatus(cfg.localPath, cfg.branch)
              .then((rs) => { if (mounted) setRemoteStatus(rs); })
              .catch(() => {});
          }
        } else if (errMsg.includes("读取不到信息")) {
          if (mounted) {
            getRemoteStatus(cfg.localPath, cfg.branch)
              .then((rs) => { if (mounted) setRemoteStatus(rs); })
              .catch(() => {});
          }
        } else if (mounted) {
          setStatus({
            currentBranch: cfg.branch,
            hasUpdates: false,
            localVersion: undefined,
            remoteVersion: undefined,
          });
          setMessage(errMsg);
          getRemoteStatus(cfg.localPath, cfg.branch)
            .then((rs) => { if (mounted) setRemoteStatus(rs); })
            .catch(() => {});
        }
      }
    };

    hydrate();

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
          if (configRef.current) {
            getRemoteStatus(
              configRef.current.localPath,
              configRef.current.branch
            )
              .then((rs) => {
                if (mounted) setRemoteStatus(rs);
              })
              .catch(() => {});
          }
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
    };
  }, []);

  const handleStartService = async () => {
    setLoading(true);
    setMessage("Starting service...");
    try {
      const result = await startService(config?.localPath || "");
      setMessage(`Service started: ${result}`);
    } catch (err: any) {
      setMessage(`Failed to start service: ${err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStopService = async () => {
    setLoading(true);
    setMessage("Stopping service...");
    try {
      const result = await stopService();
      setMessage(`Service stopped: ${result}`);
    } catch (err: any) {
      setMessage(`Failed to stop service: ${err.toString()}`);
    } finally {
      setLoading(false);
    }
  };

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
      try {
        const info = await getWebServiceInfo(configRef.current.webServiceUrl);
        if (mounted) {
          if (info) {
            setWebServiceInfo(info);
            setWsConnectionError(null);
          } else {
            setWsConnectionError('服务暂时不可用');
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (mounted) {
          setWsConnectionError(errMsg);
        }
        console.error("Failed to get web service info:", err);
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

  useEffect(() => {
    if (!config?.localPath) return;
    
    getDbConnectionStatus(config.localPath)
      .then(setDbStatus)
      .catch(() => {});
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

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / (3600 * 24));
    if (days > 0) return { value: days, unit: "天" };
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    if (hours > 0) return { value: hours, unit: "小时" };
    const minutes = Math.floor((seconds % 3600) / 60);
    return { value: minutes, unit: "分钟" };
  };

  const handlePull = async () => {
    if (!config) return;

    setLoading(true);
    setMessage("");
    setProgress({ stage: "pulling", percent: 5, label: "开始更新..." });

    try {
      await runSmartPull(config);
      // 结果现在通过 listenPullProgress 异步处理
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

      // 异步获取 Git 状态，不阻塞主界面加载
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

  // Derived state calculations
  const localVer = localDetails?.version ?? status?.localVersion ?? "-";
  const remoteVer = remoteDetails?.version ?? status?.remoteVersion ?? "-";
  const isUpToDate = remoteStatus
    ? remoteStatus.behind === 0 &&
      (remoteStatus.ahead > 0 || localVer === remoteVer)
    : !status?.hasUpdates;
  const isAhead = remoteStatus ? remoteStatus.ahead > 0 : false;
  const uptime = sysInfo ? formatUptime(sysInfo.uptime) : null;

  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      {/* SideNavBar */}
      <nav className="h-screen w-64 fixed left-0 top-0 bg-[#f7f9fb] dark:bg-slate-950 flex flex-col p-4 space-y-6 border-r-0 z-20">
        <div className="flex items-center px-2 py-4">
          <div>
            <h1 className="text-xl font-black text-[#004394] dark:text-blue-500 font-headline tracking-tight">
              OpenLearnsite
            </h1>
            <p className="text-xs text-on-surface-variant font-label">
              v4.2.1 Stable
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
            <span>Dashboard</span>
          </Link>
          <Link
            href="#"
            className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1"
          >
            <span className="material-symbols-outlined">folder_managed</span>
            <span>Repositories</span>
          </Link>
          <Link
            href="#"
            className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1"
          >
            <span className="material-symbols-outlined">insights</span>
            <span>Metrics</span>
          </Link>
          <Link
            href="#"
            className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1"
          >
            <span className="material-symbols-outlined">terminal</span>
            <span>Terminal</span>
          </Link>
        </div>

        <div className="space-y-4 pt-4 border-t border-surface-container-high before:content-[''] before:block before:w-full before:h-px before:bg-surface-container-high before:mb-4">
          <button
            onClick={handlePull}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-primary text-on-primary py-2.5 px-4 rounded-xl font-semibold text-sm hover:bg-primary-container transition-colors shadow-[0_12px_40px_rgba(0,67,148,0.08)] disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {loading ? "sync" : "update"}
            </span>
            <span>{loading ? "Updating..." : "System Update"}</span>
          </button>
          <div className="space-y-1">
            <Link
              href="#"
              className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
            >
              <span className="material-symbols-outlined">help</span>
              <span>Support</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
            >
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
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-3">
              <button
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Database Status"
                title={dbStatus ? `数据库: ${dbStatus.server}/${dbStatus.database}` : "数据库状态"}
              >
                <span className={`material-symbols-outlined ${dbStatus?.connected ? 'text-emerald-500' : 'text-rose-500'}`} aria-hidden="true">
                  {dbStatus?.connected ? 'dns' : 'dns'}
                </span>
              </button>
              <button
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Web Service Status"
                title={wsConnectionError ? `Web服务: ${config?.webServiceUrl} (未连接)` : `Web服务: ${config?.webServiceUrl} (已连接)`}
              >
                <span className={`material-symbols-outlined ${wsConnectionError ? 'text-rose-500' : 'text-emerald-500'}`} aria-hidden="true">
                  {wsConnectionError ? 'cloud_off' : 'cloud_done'}
                </span>
              </button>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={handleStartService}
                disabled={loading}
                className="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700 transition-colors shadow-[0_4px_14px_rgba(16,185,129,0.3)] disabled:opacity-50 flex items-center space-x-1"
              >
                <span className="material-symbols-outlined text-sm">
                  play_arrow
                </span>
                <span>Start Service</span>
              </button>
              <button
                onClick={handleStopService}
                disabled={loading}
                className="px-5 py-2 bg-rose-600 text-white rounded-xl font-semibold text-sm hover:bg-rose-700 transition-colors shadow-[0_4px_14px_rgba(225,29,72,0.3)] disabled:opacity-50 flex items-center space-x-1"
              >
                <span className="material-symbols-outlined text-sm">stop</span>
                <span>Stop Service</span>
              </button>

              <button
                className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Sync Status"
                title="Sync Status"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  cloud_done
                </span>
              </button>
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

            <div className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden border border-outline-variant/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-on-surface-variant">
                person
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col space-y-6">
            {/* Row 1: System Status and Version */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className={`col-span-1 md:col-span-3 bg-gradient-to-br rounded-xl p-8 text-on-primary relative overflow-hidden transition-all duration-500 shadow-[0_12px_40px_rgba(0,67,148,0.08)] ${isUpToDate ? "from-primary to-primary-container" : "from-orange-500 to-orange-600"}`}>
                <div className="relative z-10 flex justify-between items-center h-full">
                  <div>
                    <p className="text-sm font-semibold opacity-80 mb-2">
                      系统状态表
                    </p>
                    <h3 className="text-4xl md:text-5xl font-headline font-bold tracking-tight mb-2">
                      {progress.percent > 0 && progress.percent < 100
                        ? `${Math.round(progress.percent)}%`
                        : isUpToDate
                          ? isAhead
                            ? "系统领先于远程"
                            : "系统已经是最新"
                          : "发现新版本"}
                    </h3>
                    <p className={`text-sm ${isUpToDate ? "text-on-primary-container" : "text-orange-50/90"}`}>
                      {progress.label ||
                        (isUpToDate
                          ? isAhead
                            ? `本地领先远程 ${remoteStatus?.ahead || 0} 个提交。`
                            : "所有核心服务正在最佳状态运行。"
                          : (remoteStatus?.behind || 0) > 0
                            ? `落后远程 ${remoteStatus?.behind} 个提交，建议更新。`
                            : "检测到远程有新版本，建议同步仓库。")}
                    </p>
                  </div>
                  <button
                    onClick={handlePull}
                    disabled={loading || isUpToDate}
                    className={`relative w-32 h-32 flex items-center justify-center shrink-0 ml-4 group transition-all rounded-full ${!isUpToDate && !loading ? "hover:scale-105 active:scale-95 cursor-pointer" : "cursor-default"}`}
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
                    <div className="z-10 flex flex-col items-center">
                      {loading ? (
                        <span className="text-4xl font-bold font-headline">
                          {Math.round(progress.percent)}%
                        </span>
                      ) : !isUpToDate ? (
                        <span
                          className="material-symbols-outlined text-6xl group-hover:scale-110 transition-transform"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          deployed_code_update
                        </span>
                      ) : (
                        <span
                          className="material-symbols-outlined text-6xl"
                          style={{ fontVariationSettings: "'FILL' 1" }}
                        >
                          check_circle
                        </span>
                      )}
                    </div>
                  </button>
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
                <div className="min-w-0">
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

            {/* Row 1.5: Web Service Business Info */}
            {wsConnectionError ? (
              <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline outline-1 outline-outline-variant/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-amber-500">warning</span>
                    <div>
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-400">无法连接到 Web 服务</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        服务地址: {config?.webServiceUrl || '未配置'} | 请检查服务是否启动，3秒后自动重试...
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => { 
                      setWsConnectionError(null); 
                      getWebServiceInfo(configRef.current?.webServiceUrl || '').then(info => {
                        if (info) setWebServiceInfo(info);
                        else setWsConnectionError('服务暂时不可用');
                      });
                    }}
                    className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-lg text-sm font-medium hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    重试
                  </button>
                </div>
              </div>
            ) : (
            <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] outline outline-1 outline-outline-variant/10">
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-blue-500">group</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">学生总数</p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{webServiceInfo?.studentCount ?? "-"}</h4>
                </div>
                
                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-indigo-500">menu_book</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">学案总数</p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{webServiceInfo?.lessonCount ?? "-"}</h4>
                </div>

                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-violet-500">art_track</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">作品数量</p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{webServiceInfo?.workCount ?? "-"}</h4>
                </div>

                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-emerald-500">timer</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">运行时间</p>
                  </div>
                  <h4 className="text-lg font-bold text-on-surface truncate" title={webServiceInfo?.systemUptime}>{webServiceInfo?.systemUptime ?? "-"}</h4>
                </div>

                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-amber-500">start</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">进程开始</p>
                  </div>
                  <h4 className="text-[13px] font-bold text-on-surface truncate leading-tight" title={webServiceInfo?.processStartTime}>{webServiceInfo?.processStartTime ?? "-"}</h4>
                </div>

                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-rose-500">memory</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">ASP.NET 内存</p>
                  </div>
                  <h4 className="text-xl font-bold text-on-surface truncate">{webServiceInfo?.aspNetMemory ?? "-"}</h4>
                </div>

                <div className="flex flex-col p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center space-x-2 mb-1.5">
                    <span className="material-symbols-outlined text-sm text-cyan-500">reorder</span>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">当前线程</p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface">{webServiceInfo?.aspNetThreadCount ?? "-"}</h4>
                </div>
              </div>
            </div>
            )}

            {/* Row 2: Metrics */}
            <div>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {/* Metric 1 */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center relative overflow-hidden group">
                  <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <span className="material-symbols-outlined text-9xl text-emerald-500">
                      schedule
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
                    系统正常运行时间
                  </p>
                  <h4 className="text-2xl font-headline font-bold text-on-surface truncate pr-4">
                    {uptime ? uptime.value : "-"}{" "}
                    <span className="text-base text-on-surface-variant font-semibold">
                      {uptime ? uptime.unit : ""}
                    </span>
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-2">
                    自上次重启
                  </p>
                </div>

                {/* Metric 2 */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="material-symbols-outlined text-amber-500 text-sm">
                      database
                    </span>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      数据库大小
                    </p>
                  </div>
                  <h4 className="text-2xl font-headline font-bold text-on-surface mb-1">
                    {sysInfo
                      ? formatBytes(sysInfo.diskTotal - sysInfo.diskAvailable)
                          .value
                      : "-"}{" "}
                    <span className="text-sm text-on-surface-variant font-semibold">
                      {sysInfo
                        ? formatBytes(sysInfo.diskTotal - sysInfo.diskAvailable)
                            .unit
                        : ""}
                    </span>
                  </h4>
                  <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full"
                      style={{
                        width: `${sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    按磁盘总容量的 15% 估算，仅供参考
                  </p>
                </div>

                {/* Metric 3 */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="material-symbols-outlined text-rose-500 text-sm">
                      memory
                    </span>
                    <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                      CPU 使用率
                    </p>
                  </div>
                  <div className="flex items-baseline space-x-1 mb-1">
                    <h4 className="text-2xl font-headline font-bold text-on-surface">
                      {sysInfo?.cpuUsage ?? 42}%
                    </h4>
                  </div>
                  <div className="w-full bg-surface-container-high rounded-full h-1.5 mt-2">
                    <div
                      className="bg-rose-500 h-1.5 rounded-full"
                      style={{ width: `${sysInfo?.cpuUsage ?? 42}%` }}
                    ></div>
                  </div>
                </div>

                {/* Metric 4 */}
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
                      className="bg-purple-500 h-1.5 rounded-full"
                      style={{
                        width: `${sysInfo && sysInfo.memoryTotal > 0 ? (sysInfo.memoryUsed / sysInfo.memoryTotal) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>

                {/* Metric 5 */}
                <div className="bg-surface-container-lowest rounded-xl p-5 shadow-sm outline outline-1 outline-outline-variant/15 flex flex-col justify-center col-span-1 lg:col-span-2 xl:col-span-1">
                  <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-cyan-500 text-sm">
                        hard_drive
                      </span>
                      <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                        磁盘空间
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-on-surface-variant">
                      {sysInfo
                        ? `${formatBytes(sysInfo.diskTotal).value} ${formatBytes(sysInfo.diskTotal).unit}`
                        : "-"}{" "}
                      总计
                    </p>
                  </div>
                  <div className="flex items-end justify-between mb-2">
                    <h4 className="text-3xl font-headline font-bold text-on-surface">
                      {sysInfo ? formatBytes(sysInfo.diskAvailable).value : "-"}{" "}
                      <span className="text-base text-on-surface-variant font-semibold">
                        {sysInfo ? formatBytes(sysInfo.diskAvailable).unit : ""}{" "}
                        可用
                      </span>
                    </h4>
                    <span className="text-sm font-semibold text-on-surface">
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
                  <div className="w-full bg-surface-container-high rounded-full h-2 mt-1">
                    <div
                      className="bg-cyan-500 h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${sysInfo && sysInfo.diskTotal > 0 ? ((sysInfo.diskTotal - sysInfo.diskAvailable) / sysInfo.diskTotal) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Row 3: Terminal */}
            <div className="bg-[#2b2b2b] dark:bg-black rounded-xl p-4 shadow-sm h-64 flex flex-col font-mono text-sm relative overflow-hidden">
              <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                </div>
                <div className="flex items-center space-x-2">
                  <p className="text-white/30 text-xs tracking-wider">
                    SYSTEM_TERMINAL
                  </p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto text-white/70 space-y-1 scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
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

                {remoteDetails?.changelogSection && (
                  <div className="mt-2 text-white/50 whitespace-pre-wrap text-xs border-l-2 border-white/20 pl-3">
                    {remoteDetails.changelogSection}
                  </div>
                )}

                <p className="mt-4 text-white">
                  user@lumina-os:~$ <span className="animate-pulse">_</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
