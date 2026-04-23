'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { DEFAULT_GIT_CONFIG, type GitConfig, loadConfig, saveConfig, getBranches, getRemoteStatus, cloneRepo } from '@/lib/git';

export default function Settings() {
  const [config, setConfig] = useState<GitConfig>(DEFAULT_GIT_CONFIG);
  const [branches, setBranches] = useState<string[]>(['main', 'master']);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [message, setMessage] = useState('');
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);

  useEffect(() => {
    loadConfig().then(cfg => {
      if (cfg) {
        setConfig({ ...DEFAULT_GIT_CONFIG, ...cfg });
        if (cfg.localPath) {
          getBranches(cfg.localPath).then(setBranches).catch(() => {});
        }
      }
    });
  }, []);

  const handleClone = async () => {
    if (!config.remoteUrl || !config.localPath) {
      setMessage('请先填写远端仓库地址和本地路径');
      return;
    }
    setCloning(true);
    setMessage('');
    try {
      await cloneRepo(config.remoteUrl, config.localPath, config.branch || 'main');
      const branches = await getBranches(config.localPath);
      setBranches(branches);
      setMessage('仓库克隆成功');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    setCloning(false);
    setShowCloneConfirm(false);
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      // 总是保存配置，无论 Git 仓库状态如何
      await saveConfig(config);
      
      // 然后检查 Git 仓库状态以决定是否显示克隆提示
      if (!config.localPath) {
        if (config.remoteUrl && config.branch) {
          setShowCloneConfirm(true);
        } else {
          setMessage('配置已保存 (提醒：未设置本地路径)');
        }
      } else {
        try {
          await getRemoteStatus(config.localPath);
          setMessage('配置已保存');
        } catch {
          if (config.remoteUrl && config.branch) {
            setShowCloneConfirm(true);
          } else {
            setMessage('配置已保存 (提醒：本地路径不是有效的 Git 仓库)');
          }
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen overflow-hidden text-on-surface">
      {/* SideNavBar */}
      <nav className="h-screen w-64 fixed left-0 top-0 bg-[#f7f9fb] dark:bg-slate-950 flex flex-col p-4 space-y-6 border-r-0 z-20">
        <div className="flex items-center px-2 py-4">
          <div>
            <h1 className="text-xl font-black text-[#004394] dark:text-blue-500 font-headline tracking-tight">
              OpenLearnsite Manager
            </h1>
            <p className="text-xs text-on-surface-variant font-label">
              管理助手
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-2">
          <Link
            href="/"
            className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold active:translate-x-1"
          >
            <span className="material-symbols-outlined">dashboard</span>
            <span>仪表盘</span>
          </Link>
          <Link
            href="/settings"
            className="flex items-center space-x-3 px-4 py-3 bg-[#ffffff] dark:bg-slate-800 text-[#004394] dark:text-blue-300 rounded-xl shadow-sm font-headline text-sm font-semibold active:translate-x-1 transition-transform"
          >
            <span 
              className="material-symbols-outlined"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              settings
            </span>
            <span>系统设置</span>
          </Link>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex justify-between items-center w-full px-8 py-4 backdrop-blur-xl bg-[#f7f9fb]/85 dark:bg-slate-950/85 shadow-[0_12px_40px_rgba(0,67,148,0.08)] z-10 sticky top-0">
          <div className="flex items-center space-x-4">
            <h2 className="font-headline text-lg font-bold tracking-tight text-[#004394] dark:text-blue-400">
              系统设置
            </h2>
          </div>
          <div className="flex items-center space-x-6">
            <div className="flex space-x-3">
              <Link
                href="/settings"
                className="flex items-center justify-center p-2.5 bg-[#ffffff] dark:bg-slate-800 text-[#004394] dark:text-blue-300 rounded-xl shadow-sm transition-all duration-200 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Settings"
                title="Settings"
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                  settings
                </span>
              </Link>
              <Link
                href="/help"
                className="flex items-center justify-center p-2.5 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Help"
                title="Help"
              >
                <span className="material-symbols-outlined text-2xl" aria-hidden="true">
                  help
                </span>
              </Link>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl mx-auto pb-20">
            <h1 className="text-3xl font-bold text-[#2D3A82] mb-10 tracking-tight">系统设置</h1>

            <div className="mb-6">
              <label htmlFor="remoteUrl" className="block text-base font-medium text-[#566167] mb-2">远端仓库地址</label>
              <input
                id="remoteUrl"
                type="text"
                value={config.remoteUrl}
                onChange={e => setConfig({ ...config, remoteUrl: e.target.value })}
                placeholder="https://github.com/user/repo.git"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="localPath" className="block text-base font-medium text-[#566167] mb-2">本地路径</label>
              <input
                id="localPath"
                type="text"
                value={config.localPath}
                onChange={e => setConfig({ ...config, localPath: e.target.value })}
                placeholder="/path/to/local/repo"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="branch" className="block text-base font-medium text-[#566167] mb-2">分支</label>
              <input
                id="branch"
                type="text"
                value={config.branch}
                onChange={e => setConfig({ ...config, branch: e.target.value })}
                placeholder="main 或 master"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
              {branches.length > 0 && (
                <p className="mt-2 text-sm text-[#888]">
                  可选: {branches.join(', ')}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="versionFilePath" className="block text-base font-medium text-[#566167] mb-2">版本文件路径</label>
              <input
                id="versionFilePath"
                type="text"
                value={config.versionFilePath}
                onChange={e => setConfig({ ...config, versionFilePath: e.target.value })}
                placeholder="release.log"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="changelogFilePath" className="block text-base font-medium text-[#566167] mb-2">更新日志路径</label>
              <input
                id="changelogFilePath"
                type="text"
                value={config.changelogFilePath}
                onChange={e => setConfig({ ...config, changelogFilePath: e.target.value })}
                placeholder="CHANGELOG.md"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="webServiceUrl" className="block text-base font-medium text-[#566167] mb-2">Web 服务 URL</label>
              <input
                id="webServiceUrl"
                type="text"
                value={config.webServiceUrl || ''}
                onChange={e => setConfig({ ...config, webServiceUrl: e.target.value })}
                placeholder="http://127.0.0.1:8000"
                className="w-full px-4 py-3 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3] text-base"
              />
            </div>

            <div className="mb-6 flex items-center justify-between">
              <span id="force-push-label" className="text-base text-[#566167]">强制用远端覆盖本地冲突</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.forcePush}
                aria-labelledby="force-push-label"
                onClick={() => setConfig({ ...config, forcePush: !config.forcePush })}
                className={`w-12 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d59a3] focus-visible:ring-offset-2 ${config.forcePush ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.forcePush ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <span id="backup-before-pull-label" className="text-base text-[#566167]">拉取前备份</span>
              <button
                type="button"
                role="switch"
                aria-checked={config.backupBeforePull}
                aria-labelledby="backup-before-pull-label"
                onClick={() => setConfig({ ...config, backupBeforePull: !config.backupBeforePull })}
                className={`w-12 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d59a3] focus-visible:ring-offset-2 ${config.backupBeforePull ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.backupBeforePull ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="flex gap-4">
              <Link 
                href="/" 
                className="flex-1 py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-center transition-all border border-slate-200 text-base shadow-sm active:scale-95"
              >
                返回仪表盘
              </Link>
              <button
                onClick={handleSave}
                disabled={loading}
                className="flex-[2] py-4 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-xl font-bold text-base disabled:opacity-50 shadow-md transition-all active:scale-[0.98]"
              >
                {loading ? '保存中...' : '保存配置'}
              </button>
            </div>

            {showCloneConfirm && (
              <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800 mb-3">
                  本地路径为空，是否从远端克隆仓库？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClone}
                    disabled={cloning}
                    className="flex-1 py-2 bg-amber-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {cloning ? '克隆中...' : '确认克隆'}
                  </button>
                  <button
                    onClick={() => setShowCloneConfirm(false)}
                    className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-md text-sm font-medium"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {message && (
              <p className={`mt-4 text-sm ${message.includes('已保存') ? 'text-[#006d4a]' : 'text-[#a8364b]'}`}>
                {message}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
