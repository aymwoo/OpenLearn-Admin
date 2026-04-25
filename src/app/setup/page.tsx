'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  DEFAULT_GIT_CONFIG,
  type GitConfig,
  type FetchProgress,
  saveConfig,
  loadConfig,
  getDefaultConfig,
  getBranches,
  runSmartPull,
  listenPullProgress,
  checkLocalRepo,
} from '@/lib/git';

type Step = 'welcome' | 'remote' | 'local' | 'files' | 'service' | 'done';

interface StepInfo {
  title: string;
  description: string;
}

const STEP_INFO: Record<Step, StepInfo> = {
  welcome: {
    title: '欢迎使用 OpenLearn Manager',
    description: '让我们开始配置您的系统',
  },
  remote: {
    title: '配置远端仓库',
    description: '请输入远端 Git 仓库地址',
  },
  local: {
    title: '选择本地路径',
    description: '请选择仓库在本地存储的位置',
  },
  files: {
    title: '配置文件路径',
    description: '设置版本文件和更新日志的路径',
  },
  service: {
    title: '配置 Web 服务',
    description: '设置 Web 服务的地址（可选）',
  },
  done: {
    title: '同步仓库',
    description: '保存配置并同步远端仓库',
  },
};

const STEP_ORDER: Step[] = ['welcome', 'remote', 'local', 'files', 'service', 'done'];

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<GitConfig>(DEFAULT_GIT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<string[]>(['main', 'master']);
  const [localPathExists, setLocalPathExists] = useState(false);
  const [progress, setProgress] = useState<FetchProgress>({ stage: 'idle', percent: 0, label: '' });
  const [syncStarted, setSyncStarted] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    // 首先获取平台相关的默认配置
    getDefaultConfig().then(setConfig);
    
    // 然后尝试加载已保存的配置
    loadConfig().then((cfg) => {
      if (cfg) {
        setConfig(cfg);
      }
    });
  }, []);

  useEffect(() => {
    abortRef.current = false;
    return () => {
      abortRef.current = true;
    };
  }, []);

  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  const goToStep = (step: Step) => {
    setError('');
    setLoading(false);
    setCurrentStep(step);
  };

  const nextStep = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      goToStep(STEP_ORDER[nextIndex]);
    }
  };

  const prevStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEP_ORDER[prevIndex]);
    }
  };

  const handleCheckLocalPath = async () => {
    if (!config.localPath) {
      setError('请输入本地路径');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const exists = await checkLocalRepo(config.localPath);
      setLocalPathExists(exists);
      if (exists) {
        const branchList = await getBranches(config.localPath);
        setBranches(branchList);
        if (!config.branch || !branchList.includes(config.branch)) {
          setConfig((c) => ({ ...c, branch: branchList[0] || 'main' }));
        }
      }
    } catch (e) {
      console.error("Check local repo failed:", e);
      setLocalPathExists(false);
    } finally {
      setLoading(false);
    }
    nextStep();
  };

  // 监听 pull/clone 进度事件
  useEffect(() => {
    if (currentStep === 'done' && syncStarted) {
      const unlisten = listenPullProgress((p) => {
        setProgress({ stage: p.stage, percent: p.percent, label: p.label });

        if (p.stage === 'done' && p.result) {
          setSyncDone(true);
          setLoading(false);
        } else if (p.stage === 'error') {
          setError(p.label);
          setLoading(false);
        }
      });

      return () => {
        unlisten.then(fn => fn());
      };
    }
  }, [currentStep, syncStarted]);

  // 进入 done 步骤时：保存配置 → 触发后台 clone/pull
  const handleSaveAndSync = async () => {
    setLoading(true);
    setError('');
    try {
      await saveConfig(config);
      setSyncStarted(true);
      setProgress({ stage: 'cloning', percent: 5, label: '正在准备同步仓库...' });
      // runSmartPull 在 Rust 后端使用 thread::spawn 运行，不会阻塞
      runSmartPull(config).catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    router.push('/');
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {STEP_ORDER.map((step, index) => {
        const stepIndex = STEP_ORDER.indexOf(step);
        const isActive = step === currentStep;
        const isPast = STEP_ORDER.indexOf(currentStep) > stepIndex;

        return (
          <div key={step} className="flex items-center">
            {index > 0 && (
              <div
                className={`w-8 h-0.5 ${isPast ? 'bg-[#4d59a3]' : 'bg-gray-200'}`}
              />
            )}
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#4d59a3] text-white'
                  : isPast
                    ? 'bg-[#4d59a3] text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {stepIndex + 1}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderWelcome = () => (
    <div className="text-center">
      <h2 className="text-2xl font-bold text-[#2D3A82] mb-3">
        {STEP_INFO.welcome.title}
      </h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        这是您首次启动应用，需要进行一些基本配置。向导将引导您完成以下步骤：
      </p>
      <div className="space-y-3 text-left max-w-sm mx-auto mb-8">
        {[
          { icon: 'cloud', text: '配置远端 Git 仓库' },
          { icon: 'folder', text: '选择本地存储路径' },
          { icon: 'description', text: '设置文件路径' },
          { icon: 'language', text: '配置 Web 服务' },
        ].map((item, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <span className="material-symbols-outlined text-[#4d59a3]">{item.icon}</span>
            <span className="text-gray-700">{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );

  const renderRemote = () => (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          远端仓库地址
        </label>
        <input
          type="text"
          value={config.remoteUrl}
          onChange={(e) => setConfig({ ...config, remoteUrl: e.target.value })}
          placeholder="https://github.com/user/repo.git"
          className="w-full px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
        />
        <p className="mt-2 text-xs text-gray-500">
          支持 HTTPS 和 SSH 格式的 Git 仓库地址
        </p>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          分支名称
        </label>
        <input
          type="text"
          value={config.branch}
          onChange={(e) => setConfig({ ...config, branch: e.target.value })}
          placeholder="main"
          className="w-full px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
        />
        <p className="mt-2 text-xs text-gray-500">
          默认使用 main 分支，也可选择 master 或其他分支
        </p>
      </div>
    </div>
  );

  const renderLocal = () => (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          本地存储路径
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={config.localPath}
            onChange={(e) => setConfig({ ...config, localPath: e.target.value })}
            placeholder="/path/to/local/repo"
            className="flex-1 px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
          />
          <button
            type="button"
            onClick={async () => {
              const selected = await open({ directory: true });
              if (selected && typeof selected === 'string') {
                setConfig({ ...config, localPath: selected });
              }
            }}
            className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-200 transition-colors flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">folder_open</span>
            浏览
          </button>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          仓库将被克隆到此目录，或使用已有的本地仓库
        </p>
      </div>
      {localPathExists && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 text-green-700">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span className="text-sm font-medium">检测到有效的本地仓库</span>
          </div>
        </div>
      )}
    </div>
  );

  const renderFiles = () => (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          版本文件路径
        </label>
        <input
          type="text"
          value={config.versionFilePath}
          onChange={(e) => setConfig({ ...config, versionFilePath: e.target.value })}
          placeholder="release.log"
          className="w-full px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
        />
        <p className="mt-2 text-xs text-gray-500">
          用于读取当前版本号的文件
        </p>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          更新日志路径
        </label>
        <input
          type="text"
          value={config.changelogFilePath}
          onChange={(e) => setConfig({ ...config, changelogFilePath: e.target.value })}
          placeholder="CHANGELOG.md"
          className="w-full px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
        />
        <p className="mt-2 text-xs text-gray-500">
          用于读取版本更新日志的文件
        </p>
      </div>
    </div>
  );

  const renderService = () => (
    <div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Web 服务 URL
        </label>
        <input
          type="text"
          value={config.webServiceUrl || ''}
          onChange={(e) => setConfig({ ...config, webServiceUrl: e.target.value })}
          placeholder="http://127.0.0.1:8000"
          className="w-full px-4 py-3 bg-white rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#4d59a3] focus:border-transparent outline-none transition-all"
        />
        <p className="mt-2 text-xs text-gray-500">
          后端 Web 服务的地址，用于获取系统运行数据
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">强制覆盖本地冲突</span>
            <button
              type="button"
              onClick={() => setConfig({ ...config, forcePush: !config.forcePush })}
              className={`w-10 h-5 rounded-full transition-colors ${
                config.forcePush ? 'bg-[#4d59a3]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${
                  config.forcePush ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">当本地与远端冲突时，使用远端版本</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">拉取前备份</span>
            <button
              type="button"
              onClick={() => setConfig({ ...config, backupBeforePull: !config.backupBeforePull })}
              className={`w-10 h-5 rounded-full transition-colors ${
                config.backupBeforePull ? 'bg-[#4d59a3]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`block w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${
                  config.backupBeforePull ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-gray-500">在拉取更新前自动备份本地仓库</p>
        </div>
      </div>
    </div>
  );

  const renderDone = () => {
    // 同步完成
    if (syncDone) {
      return (
        <div className="text-center py-6">
          <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center shadow-lg">
            <span className="material-symbols-outlined text-white text-4xl">
              check_circle
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-3">
            配置完成
          </h2>
          <p className="text-gray-600 mb-8 max-w-md mx-auto">
            您的系统已经配置完成，仓库同步成功。
          </p>
          <div className="bg-gray-50 p-6 rounded-xl max-w-md mx-auto text-left">
            <h4 className="text-sm font-medium text-gray-700 mb-4">配置摘要</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">远端仓库</span>
                <span className="text-gray-700 truncate max-w-[200px]">{config.remoteUrl || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">本地路径</span>
                <span className="text-gray-700 truncate max-w-[200px]">{config.localPath || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">分支</span>
                <span className="text-gray-700">{config.branch}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Web 服务</span>
                <span className="text-gray-700">{config.webServiceUrl || '-'}</span>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 正在同步
    if (syncStarted) {
      return (
        <div className="text-center py-6">
          <div className="w-16 h-16 mx-auto mb-6 border-4 border-gray-200 border-t-[#4d59a3] rounded-full animate-spin" />
          <h3 className="text-lg font-semibold text-gray-800 mb-2">正在同步仓库</h3>
          <p className="text-sm text-gray-500 mb-6">配置已保存，正在从远端同步仓库数据...</p>

          {/* 进度条 */}
          <div className="max-w-md mx-auto mb-4">
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#4d59a3] to-[#6b74c4] h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(progress.percent, 5)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 truncate">
              {progress.label || '准备中...'}
            </p>
          </div>

          {/* 后台运行按钮 */}
          <button
            onClick={handleGoToDashboard}
            className="mt-4 px-6 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors flex items-center gap-2 mx-auto"
          >
            <span className="material-symbols-outlined text-sm">open_in_new</span>
            后台运行，进入主界面
          </button>
        </div>
      );
    }

    // 尚未开始同步：显示配置摘要 + 开始同步按钮
    return (
      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-[#4d59a3] to-[#6b74c4] rounded-2xl flex items-center justify-center shadow-lg">
          <span className="material-symbols-outlined text-white text-3xl">
            cloud_sync
          </span>
        </div>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          所有配置已就绪，点击下方按钮保存配置并开始同步仓库。
        </p>

        {/* 配置摘要 */}
        <div className="bg-gray-50 p-5 rounded-xl max-w-md mx-auto text-left mb-6">
          <h4 className="text-sm font-medium text-gray-700 mb-3">配置摘要</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">远端仓库</span>
              <span className="text-gray-700 truncate max-w-[220px]">{config.remoteUrl || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">本地路径</span>
              <span className="text-gray-700 truncate max-w-[220px]">{config.localPath || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">分支</span>
              <span className="text-gray-700">{config.branch}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">版本文件</span>
              <span className="text-gray-700">{config.versionFilePath || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">更新日志</span>
              <span className="text-gray-700">{config.changelogFilePath || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Web 服务</span>
              <span className="text-gray-700">{config.webServiceUrl || '-'}</span>
            </div>
          </div>
        </div>

        {localPathExists && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl max-w-md mx-auto">
            <div className="flex items-center gap-2 text-green-700 justify-center">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span className="text-sm font-medium">检测到已有本地仓库，将执行增量更新</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderContent = () => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcome();
      case 'remote':
        return renderRemote();
      case 'local':
        return renderLocal();
      case 'files':
        return renderFiles();
      case 'service':
        return renderService();
      case 'done':
        return renderDone();
      default:
        return null;
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 'remote':
        return true;
      case 'local':
        return !!config.localPath;
      case 'files':
        return !!config.versionFilePath && !!config.changelogFilePath;
      default:
        return true;
    }
  };

  const handleNext = async () => {
    switch (currentStep) {
      case 'welcome':
        nextStep();
        break;
      case 'remote':
        nextStep();
        break;
      case 'local':
        await handleCheckLocalPath();
        break;
      case 'files':
        nextStep();
        break;
      case 'service':
        nextStep();
        break;
      default:
        nextStep();
    }
  };

  const showBack = currentStep !== 'welcome' && currentStep !== 'done';
  const showNext = currentStep !== 'done';

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f6fafe] to-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
          {currentStep !== 'welcome' && currentStep !== 'done' && renderStepIndicator()}

          {currentStep !== 'welcome' && currentStep !== 'done' && (
            <div className="text-center mb-8">
              <h2 className="text-xl font-bold text-[#2D3A82]">
                {STEP_INFO[currentStep].title}
              </h2>
              <p className="text-gray-500 mt-1">{STEP_INFO[currentStep].description}</p>
            </div>
          )}

          {renderContent()}

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <div className="flex gap-2">
              {showBack && (
                <button
                  onClick={prevStep}
                  disabled={loading}
                  className="px-4 py-2.5 text-gray-600 hover:text-gray-800 font-medium transition-colors disabled:opacity-50"
                >
                  上一步
                </button>
              )}
              {currentStep !== 'done' && (
                <button
                  onClick={handleGoToDashboard}
                  disabled={loading}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-700 font-medium transition-colors disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">home</span>
                  返回首页
                </button>
              )}
            </div>

            <div className="flex gap-3">
              {showNext && (
                <button
                  onClick={handleNext}
                  disabled={loading || !canProceed()}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? '处理中...' : '下一步'}
                </button>
              )}
              {currentStep === 'done' && !syncStarted && (
                <button
                  onClick={handleSaveAndSync}
                  disabled={loading}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">cloud_sync</span>
                  保存并同步
                </button>
              )}
              {currentStep === 'done' && syncDone && (
                <button
                  onClick={handleGoToDashboard}
                  className="px-8 py-2.5 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
                >
                  进入控制台
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
