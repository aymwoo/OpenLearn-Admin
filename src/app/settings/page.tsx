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
        <h1 className="text-2xl font-semibold text-[#2D3A82] mb-8 tracking-tight">系统设置</h1>

        <div className="mb-6">
          <label htmlFor="remoteUrl" className="block text-sm text-[#566167] mb-2">远端仓库地址</label>
          <input
            id="remoteUrl"
            type="text"
            value={config.remoteUrl}
            onChange={e => setConfig({ ...config, remoteUrl: e.target.value })}
            placeholder="https://github.com/user/repo.git"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="localPath" className="block text-sm text-[#566167] mb-2">本地路径</label>
          <input
            id="localPath"
            type="text"
            value={config.localPath}
            onChange={e => setConfig({ ...config, localPath: e.target.value })}
            placeholder="/path/to/local/repo"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="branch" className="block text-sm text-[#566167] mb-2">分支</label>
          <input
            id="branch"
            type="text"
            value={config.branch}
            onChange={e => setConfig({ ...config, branch: e.target.value })}
            placeholder="main 或 master"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
          {branches.length > 0 && (
            <p className="mt-2 text-xs text-[#888]">
              可选: {branches.join(', ')}
            </p>
          )}
        </div>

        <div className="mb-6">
          <label htmlFor="versionFilePath" className="block text-sm text-[#566167] mb-2">版本文件路径</label>
          <input
            id="versionFilePath"
            type="text"
            value={config.versionFilePath}
            onChange={e => setConfig({ ...config, versionFilePath: e.target.value })}
            placeholder="release.log"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="changelogFilePath" className="block text-sm text-[#566167] mb-2">更新日志路径</label>
          <input
            id="changelogFilePath"
            type="text"
            value={config.changelogFilePath}
            onChange={e => setConfig({ ...config, changelogFilePath: e.target.value })}
            placeholder="CHANGELOG.md"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="webServiceUrl" className="block text-sm text-[#566167] mb-2">Web 服务 URL</label>
          <input
            id="webServiceUrl"
            type="text"
            value={config.webServiceUrl || ''}
            onChange={e => setConfig({ ...config, webServiceUrl: e.target.value })}
            placeholder="http://127.0.0.1:8000"
            className="w-full px-4 py-2 bg-white rounded-md border focus:ring-1 focus:ring-[#4d59a3]"
          />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <span className="text-sm text-[#566167]">强制用远端覆盖本地冲突</span>
          <button
            type="button"
            onClick={() => setConfig({ ...config, forcePush: !config.forcePush })}
            className={`w-12 h-6 rounded-full transition-colors ${config.forcePush ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.forcePush ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <div className="mb-8 flex items-center justify-between">
          <span className="text-sm text-[#566167]">拉取前备份</span>
          <button
            type="button"
            onClick={() => setConfig({ ...config, backupBeforePull: !config.backupBeforePull })}
            className={`w-12 h-6 rounded-full transition-colors ${config.backupBeforePull ? 'bg-[#4d59a3]' : 'bg-[#e7eff5]'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${config.backupBeforePull ? 'translate-x-6' : 'translate-x-0.5'}`} />
          </button>
        </div>

        <button
          onClick={handleSave}
          disabled={loading}
          className="w-full py-3 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? '保存中...' : '保存配置'}
        </button>

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

        <div className="mt-8 text-center">
          <Link href="/" className="text-sm text-[#4d59a3] hover:underline">返回 Dashboard</Link>
        </div>
      </div>
    </main>
  );
}
