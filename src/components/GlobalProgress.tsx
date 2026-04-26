"use client";

import { useState, useEffect } from "react";
import { listenPullProgress, getSyncProgress, cancelSync, type FetchProgress } from "@/lib/git";

function formatTransferSize(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function GlobalProgress() {
  const [progress, setProgress] = useState<FetchProgress>({
    stage: "idle",
    percent: 0,
    label: "",
  });

  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelSync();
    } catch {
      // 忽略错误
    }
    setCancelling(false);
  };

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    // 获取初始进度
    getSyncProgress().then(p => {
      if (mounted && p.stage !== 'idle' && p.stage !== 'done' && p.stage !== 'error') {
        setProgress(p);
      }
    }).catch(() => {});

    // 监听进度变化
    listenPullProgress((nextProgress) => {
      if (mounted) {
        setProgress(nextProgress);
      }
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  if (progress.stage === 'idle' || progress.stage === 'done' || progress.stage === 'error') {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center space-x-3 px-4 py-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl border border-blue-100 dark:border-blue-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
        </span>
        <div className="flex flex-col">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">
              {progress.label || '正在同步'}
            </span>
            <span className="text-xs font-black text-blue-700 dark:text-blue-300 font-mono">
              {progress.percent}%
            </span>
          </div>
          {progress.receivedBytes != null && progress.receivedBytes > 0 && (
            <span className="text-[10px] text-blue-500 dark:text-blue-400 font-mono mt-0.5">
              {progress.totalObjects != null && progress.receivedObjects != null
                ? `${progress.receivedObjects}/${progress.totalObjects} 对象 `
                : ''}
              已接收 {formatTransferSize(progress.receivedBytes)}
            </span>
          )}
          <div className="w-32 h-1.5 bg-blue-100 dark:bg-blue-900 rounded-full mt-1.5 overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-500 ease-out shadow-[0_0_8px_rgba(59,130,246,0.5)]" 
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="ml-2 flex items-center justify-center w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="取消操作"
        >
          <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
