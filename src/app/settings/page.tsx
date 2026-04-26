'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { DEFAULT_GIT_CONFIG, type GitConfig, loadConfig, saveConfig, getBranches, getRemoteStatus, cloneRepo, checkNodeEnv, type NodeEnvStatus, setNpmRegistry, installNodeEnv, installPnpm, listenEnvInstallProgress } from '@/lib/git';

type TabId = 'git' | 'nodejs';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'git', label: 'Git 仓库', icon: 'folder' },
  { id: 'nodejs', label: 'Node.js 环境', icon: 'terminal' },
];

export default function Settings() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('git');
  const [config, setConfig] = useState<GitConfig>(DEFAULT_GIT_CONFIG);
  const [branches, setBranches] = useState<string[]>(['main', 'master']);
  const [loading, setLoading] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [message, setMessage] = useState('');
  const [showCloneConfirm, setShowCloneConfirm] = useState(false);
  const [nodeEnv, setNodeEnv] = useState<NodeEnvStatus | null>(null);
  const [nodeLoading, setNodeLoading] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [installStatus, setInstallStatus] = useState('');

  useEffect(() => {
    loadConfig().then(cfg => {
      if (cfg) {
        setConfig({ ...DEFAULT_GIT_CONFIG, ...cfg });
        if (cfg.localPath) {
          getBranches(cfg.localPath).then(setBranches).catch(() => {});
        }
      }
    });
    refreshNodeEnv();

    const unlisten = listenEnvInstallProgress((msg) => {
      setInstallStatus(msg);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const refreshNodeEnv = async () => {
    setNodeLoading(true);
    try {
      const status = await checkNodeEnv();
      setNodeEnv(status);
    } catch (err) {
      console.error('Failed to check node env:', err);
    }
    setNodeLoading(false);
  };

  const handleSetRegistry = async (url: string) => {
    setRegistryLoading(true);
    try {
      await setNpmRegistry(url);
      await refreshNodeEnv();
      setMessage('镜像源切换成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
    setRegistryLoading(false);
  };

  const handleInstallNode = async () => {
    setNodeLoading(true);
    setInstallStatus('正在准备安装...');
    try {
      await installNodeEnv();
      await refreshNodeEnv();
      setMessage('Node.js 安装成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
    setNodeLoading(false);
    setInstallStatus('');
  };

  const handleInstallPnpm = async () => {
    setNodeLoading(true);
    setInstallStatus('正在准备安装...');
    try {
      await installPnpm();
      await refreshNodeEnv();
      setMessage('pnpm 安装成功');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
    setNodeLoading(false);
    setInstallStatus('');
  };

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

  const checkAndSave = async () => {
    if (!config.localPath) {
      if (!config.remoteUrl || !config.branch) {
        return '请填写完整信息';
      }
      return 'needs-clone';
    }
    try {
      await getRemoteStatus(config.localPath);
      await saveConfig(config);
      return 'saved';
    } catch {
      if (!config.remoteUrl || !config.branch) {
        return 'invalid-path';
      }
      return 'needs-clone';
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await checkAndSave();
      if (result === 'saved') {
        sessionStorage.setItem('settings_updated', 'true');
        setMessage('配置已保存');
      } else if (result === 'needs-clone') {
        setShowCloneConfirm(true);
      } else {
        setMessage(result);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-[#f6fafe] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-semibold text-[#2D3A82] mb-6 tracking-tight">系统设置</h1>

        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-t-lg transition-colors -mb-[1px] ${
                activeTab === tab.id
                  ? 'bg-white text-[#4d59a3] border border-gray-200 border-b-white'
                  : 'text-[#888] hover:text-[#566167] hover:bg-gray-50'
              }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'git' && (
          <div>
            <div className="mb-6">
              <label htmlFor="remoteUrl" className="block text-base text-[#566167] mb-2">远端仓库地址</label>
              <input
                id="remoteUrl"
                type="text"
                value={config.remoteUrl}
                onChange={e => setConfig({ ...config, remoteUrl: e.target.value })}
                placeholder="https://github.com/user/repo.git"
                className="w-full px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="localPath" className="block text-base text-[#566167] mb-2">本地路径</label>
              <div className="flex gap-2">
                <input
                  id="localPath"
                  type="text"
                  value={config.localPath}
                  onChange={e => setConfig({ ...config, localPath: e.target.value })}
                  placeholder="/path/to/local/repo"
                  className="flex-1 px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const selected = await open({ directory: true });
                    if (selected && typeof selected === 'string') {
                      setConfig({ ...config, localPath: selected });
                    }
                  }}
                  className="px-4 py-3 bg-gray-100 text-gray-700 rounded-md border hover:bg-gray-200 transition-colors flex items-center gap-2 text-base"
                >
                  <span className="material-symbols-outlined text-base">folder_open</span>
                  浏览
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="branch" className="block text-base text-[#566167] mb-2">分支</label>
              <input
                id="branch"
                type="text"
                value={config.branch}
                onChange={e => setConfig({ ...config, branch: e.target.value })}
                placeholder="main 或 master"
                className="w-full px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
              />
              {branches.length > 0 && (
                <p className="mt-2 text-sm text-[#888]">
                  可选: {branches.join(', ')}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="versionFilePath" className="block text-base text-[#566167] mb-2">版本文件路径</label>
              <input
                id="versionFilePath"
                type="text"
                value={config.versionFilePath}
                onChange={e => setConfig({ ...config, versionFilePath: e.target.value })}
                placeholder="release.log"
                className="w-full px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="changelogFilePath" className="block text-base text-[#566167] mb-2">更新日志路径</label>
              <input
                id="changelogFilePath"
                type="text"
                value={config.changelogFilePath}
                onChange={e => setConfig({ ...config, changelogFilePath: e.target.value })}
                placeholder="CHANGELOG.md"
                className="w-full px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
              />
            </div>

            <div className="mb-6">
              <label htmlFor="webServiceUrl" className="block text-base text-[#566167] mb-2">Web 服务 URL</label>
              <input
                id="webServiceUrl"
                type="text"
                value={config.webServiceUrl || ''}
                onChange={e => setConfig({ ...config, webServiceUrl: e.target.value })}
                placeholder="http://127.0.0.1:8000"
                className="w-full px-4 py-3 text-base bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
              />
            </div>

            <div className="mb-6 flex items-center justify-between">
              <span className="text-base text-[#566167]">强制用远端覆盖本地冲突</span>
              <button
                type="button"
                onClick={() => setConfig({ ...config, forcePush: !config.forcePush })}
                className={`w-12 h-6 rounded-full transition-colors ${config.forcePush ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
              >
                <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.forcePush ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <span className="text-base text-[#566167]">拉取前备份</span>
              <button
                type="button"
                onClick={() => setConfig({ ...config, backupBeforePull: !config.backupBeforePull })}
                className={`w-14 h-7 rounded-full transition-colors ${config.backupBeforePull ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
              >
                <span className={`block w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform ${config.backupBeforePull ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="mb-8 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-base text-[#566167]">自动恢复 web.config</span>
                <span className="text-xs text-[#888] mt-1">更新后自动恢复本地的 web.config 文件</span>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, autoRestoreWebConfig: !config.autoRestoreWebConfig })}
                className={`w-14 h-7 rounded-full transition-colors ${config.autoRestoreWebConfig ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
              >
                <span className={`block w-6 h-6 bg-white rounded-full shadow-sm transform transition-transform ${config.autoRestoreWebConfig ? 'translate-x-7' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {showCloneConfirm && (
              <div className="mb-8 p-5 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-base text-amber-800 mb-3">
                  本地路径为空，是否从远端克隆仓库？
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleClone}
                    disabled={cloning}
                    className="flex-1 py-3 bg-amber-600 text-white rounded-md font-medium disabled:opacity-50"
                  >
                    {cloning ? '克隆中...' : '确认克隆'}
                  </button>
                  <button
                    onClick={() => setShowCloneConfirm(false)}
                    className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-md font-medium"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'nodejs' && (
          <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={refreshNodeEnv}
                disabled={nodeLoading}
                className={`p-2 rounded-md hover:bg-gray-100 transition-colors ${nodeLoading ? 'animate-spin' : ''}`}
              >
                <span className="material-symbols-outlined text-gray-400">refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-500 uppercase">Node.js 版本</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${nodeEnv?.nodeVersion ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {nodeEnv?.nodeVersion ? '已安装' : '未安装'}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-gray-800">
                  {nodeEnv?.nodeVersion || '--'}
                </div>
                {!nodeEnv?.nodeVersion && (
                  <button
                    onClick={handleInstallNode}
                    disabled={nodeLoading}
                    className="mt-3 w-full py-2 bg-emerald-600 text-white rounded-md text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {nodeLoading ? (installStatus || '正在安装...') : '一键安装 Node.js'}
                  </button>
                )}
              </div>

              <div className="p-4 bg-white rounded-lg border border-gray-200">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-500 uppercase">pnpm 版本</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${nodeEnv?.pnpmVersion ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {nodeEnv?.pnpmVersion ? '已安装' : '未安装'}
                  </span>
                </div>
                <div className="text-xl font-bold font-mono text-gray-800">
                  {nodeEnv?.pnpmVersion || '--'}
                </div>
                {!nodeEnv?.pnpmVersion && nodeEnv?.nodeVersion && (
                  <button
                    onClick={handleInstallPnpm}
                    disabled={nodeLoading}
                    className="mt-3 w-full py-2 bg-gray-700 text-white rounded-md text-sm font-bold hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {nodeLoading ? (installStatus || '正在安装...') : '安装 pnpm'}
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-600 text-sm">language</span>
                  <span className="text-sm font-medium text-blue-800">当前镜像源</span>
                </div>
                <span className="text-xs font-mono text-blue-600 break-all ml-4">
                  {nodeEnv?.registry}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleSetRegistry('https://registry.npmjs.org/')}
                  disabled={registryLoading}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded text-xs font-medium hover:border-blue-400 transition-all disabled:opacity-50"
                >
                  NPM 官方源
                </button>
                <button
                  onClick={() => handleSetRegistry('https://registry.npmmirror.com/')}
                  disabled={registryLoading}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded text-xs font-medium hover:border-blue-400 transition-all disabled:opacity-50"
                >
                  淘宝镜像
                </button>
                <button
                  onClick={() => handleSetRegistry('https://mirrors.cloud.tencent.com/npm/')}
                  disabled={registryLoading}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded text-xs font-medium hover:border-blue-400 transition-all disabled:opacity-50"
                >
                  腾讯云镜像
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <Link
            href="/"
            className="flex-1 py-3 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">dashboard</span>
            返回仪表盘
          </Link>

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 py-3 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">save</span>
            {loading ? '保存中...' : '保存配置'}
          </button>

          <button
            onClick={() => router.push('/setup')}
            className="flex-1 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">settings_suggest</span>
            重新运行向导
          </button>
        </div>

        {message && (
          <p className={`mt-4 text-base ${message.includes('已保存') ? 'text-[#006d4a]' : 'text-[#a8364b]'}`}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
