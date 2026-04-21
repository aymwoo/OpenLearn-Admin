'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  type DashboardData,
  type FetchProgress,
  type GitConfig,
  type RepoSyncStatus,
  type VersionDetails,
  getDashboardData,
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
      } catch (error) {
        if (mounted) {
          setStatus({
            currentBranch: cfg.branch,
            hasUpdates: false,
            localVersion: undefined,
            remoteVersion: undefined,
          });
          setMessage(error instanceof Error ? error.message : '读取仓库信息失败');
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
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      setMessage(nextMessage);
      setProgress((current) => ({
        ...current,
        stage: 'error',
        label: nextMessage,
      }));
    } finally {
      setLoading(false);
    }
  };

  if (!config) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6fafe]">
        <Link href="/settings" className="text-[#4d59a3]">请先配置仓库</Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6fafe] p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-semibold text-[#2D3A82] mb-8 tracking-tight">Dashboard</h1>

        <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm text-[#566167]">仓库状态</span>
            {status && (
              <span className={`flex items-center gap-2 ${status.hasUpdates ? 'text-[#f97386]' : 'text-[#006d4a]'}`}>
                <span className={`w-2 h-2 rounded-full ${status.hasUpdates ? 'bg-[#f97386]' : 'bg-[#006d4a]'}`} />
                {status.hasUpdates ? '检测到新版本' : '已同步'}
              </span>
            )}
          </div>
          <div className="text-sm text-[#566167]">
            <p>远端: {config.remoteUrl}</p>
            <p>本地: {config.localPath}</p>
            <p>分支: {status?.currentBranch ?? config.branch}</p>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-2 mb-6">
          <article className="bg-white rounded-xl p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7a86a8] mb-2">本地当前版本</p>
            <h2 className="text-2xl font-semibold text-[#2D3A82]">{localDetails?.version ?? status?.localVersion ?? '-'}</h2>
            <p className="mt-2 text-sm text-[#566167]">分支：{localDetails?.branch ?? status?.currentBranch ?? '-'}</p>
            <p className="text-sm text-[#566167]">最近抓取：{localDetails?.lastFetchedAt ?? '-'}</p>
          </article>
          <article className="bg-white rounded-xl p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-[#7a86a8] mb-2">远端最新版本</p>
            <h2 className="text-2xl font-semibold text-[#2D3A82]">{remoteDetails?.version ?? status?.remoteVersion ?? '-'}</h2>
            <p className="mt-2 text-sm text-[#566167]">分支：{remoteDetails?.branch ?? config.branch}</p>
          </article>
        </section>

        <div className="bg-white rounded-xl p-6 mb-6 shadow-sm">
          <button
            onClick={handlePull}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? '抓取中...' : '一键抓取'}
          </button>

          <div className="mt-4 h-2 rounded-full bg-[#e7eff5] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#4d59a3] to-[#6f7fe0] transition-[width] duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <p className="mt-3 text-sm text-[#566167]">{progress.label || '待命'}</p>

          {message && (
            <p className={`mt-4 text-sm ${message.includes('最新版本') || message.includes('成功') ? 'text-[#006d4a]' : 'text-[#a8364b]'}`}>
              {message}
            </p>
          )}
        </div>

        <section className="grid gap-4 md:grid-cols-2 mb-8">
          <article className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-[#2D3A82] mb-3">本地当前版本日志</h3>
            <pre className="whitespace-pre-wrap text-sm text-[#566167] font-sans">{localDetails?.changelogSection ?? '暂无日志'}</pre>
          </article>
          <article className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-base font-semibold text-[#2D3A82] mb-3">远端最新版本日志</h3>
            <pre className="whitespace-pre-wrap text-sm text-[#566167] font-sans">{remoteDetails?.changelogSection ?? '暂无日志'}</pre>
          </article>
        </section>

        <div className="text-center">
          <Link href="/settings" className="text-sm text-[#4d59a3] hover:underline">系统设置</Link>
        </div>
      </div>
    </main>
  );
}
