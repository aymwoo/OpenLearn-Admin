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
  getRemoteStatus,
  getBranches,
  runSmartPull,
  listenPullProgress,
} from '@/lib/git';

type Step = 'welcome' | 'remote' | 'local' | 'clone' | 'files' | 'service' | 'done';

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
  clone: {
    title: '克隆仓库',
    description: '正在从远端克隆仓库到本地',
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
    title: '配置完成',
    description: '您的系统已经准备就绪',
  },
};

const STEP_ORDER: Step[] = ['welcome', 'remote', 'local', 'clone', 'files', 'service', 'done'];

export default function SetupWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>('welcome');
  const [config, setConfig] = useState<GitConfig>(DEFAULT_GIT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cloneProgress, setCloneProgress] = useState('');
  const [branches, setBranches] = useState<string[]>(['main', 'master']);
  const [skipClone, setSkipClone] = useState(false);
  const [localPathExists, setLocalPathExists] = useState(false);
  const [progress, setProgress] = useState<FetchProgress>({ stage: 'idle', percent: 0, label: '' });
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
      const status = await getRemoteStatus(config.localPath, config.branch);
      if (status.branch) {
        setLocalPathExists(true);
        const branchList = await getBranches(config.localPath);
        setBranches(branchList);
        if (!config.branch || !branchList.includes(config.branch)) {
          setConfig((c) => ({ ...c, branch: branchList[0] || 'main' }));
        }
        nextStep();
      }
    } catch {
      setLocalPathExists(false);
      if (config.remoteUrl) {
        nextStep();
      } else {
        setError('本地路径无效且未配置远端仓库地址，无法继续');
      }
    } finally {
      setLoading(false);
    }
  };

useEffect(() => {
    if (currentStep === 'clone') {
      const unlisten = listenPullProgress((progress) => {
        setCloneProgress(progress.label);
        setProgress({ stage: progress.stage, percent: progress.percent, label: progress.label });
        
        if (progress.stage === 'done' && progress.result) {
          setTimeout(() => nextStep(), 500);
        } else if (progress.stage === 'error') {
          setError(progress.label);
          setLoading(false);
        }
      });
      
      return () => {
        unlisten.then(fn => fn());
      };
    }
  }, [currentStep]);

  useEffect(() => {
    if (currentStep === 'clone' && !loading) {
      const doClone = async () => {
        setLoading(true);
        setError('');
        setCloneProgress('正在准备克隆...');
        try {
          await runSmartPull(config);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      };
      doClone();
    }
  }, [currentStep]);

  const handleSkipClone = () => {
    setSkipClone(true);
    nextStep();
  };

  const handleSaveAndFinish = async () => {
    setLoading(true);
    try {
      await saveConfig(config);
      nextStep();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoToDashboard = () => {
    router.push('/');
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {STEP_ORDER.filter((s) => s !== 'clone' || !skipClone).map((step, index) => {
        const stepIndex = STEP_ORDER.indexOf(step);
        const isActive = step === currentStep;
        const isPast = STEP_ORDER.indexOf(currentStep) > stepIndex;
        const adjustedIndex = skipClone && stepIndex > STEP_ORDER.indexOf('clone')
          ? stepIndex - 1
          : stepIndex;

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
              {adjustedIndex + 1}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderWelcome = () => (
    <div className="text-center">
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#4d59a3] to-[#404d96] rounded-2xl flex items-center justify-center shadow-lg">
        <span className="material-symbols-outlined text-white text-4xl">
          settings_suggest
        </span>
      </div>
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
            className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-200 transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d59a3] focus-visible:ring-offset-1"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">folder_open</span>
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

  const renderClone = () => (
    <div className="text-center py-8">
      {loading ? (
        <>
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-gray-200 border-t-[#4d59a3] rounded-full animate-spin" />
          <p className="text-gray-600">{cloneProgress || '正在克隆仓库...'}</p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 mx-auto mb-4 bg-amber-100 rounded-full flex items-center justify-center">
            <span className="material-symbols-outlined text-amber-600 text-3xl">
              cloud_download
            </span>
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            准备克隆仓库
          </h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            本地路径无效或为空，需要从远端克隆仓库。
          </p>
          <div className="bg-gray-50 p-4 rounded-lg mb-6 text-left">
            <p className="text-xs text-gray-500 mb-1">远端地址</p>
            <p className="text-sm text-gray-700 truncate">{config.remoteUrl}</p>
            <p className="text-xs text-gray-500 mt-2 mb-1">本地路径</p>
            <p className="text-sm text-gray-700 truncate">{config.localPath}</p>
            <p className="text-xs text-gray-500 mt-2 mb-1">分支</p>
            <p className="text-sm text-gray-700">{config.branch}</p>
          </div>
        </>
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
              role="switch"
              aria-checked={config.forcePush}
              aria-label="强制用远端覆盖本地冲突"
              onClick={() => setConfig({ ...config, forcePush: !config.forcePush })}
              className={`w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d59a3] focus-visible:ring-offset-2 ${
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
              role="switch"
              aria-checked={config.backupBeforePull}
              aria-label="拉取前备份"
              onClick={() => setConfig({ ...config, backupBeforePull: !config.backupBeforePull })}
              className={`w-10 h-5 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4d59a3] focus-visible:ring-offset-2 ${
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

  const renderDone = () => (
    <div className="text-center py-8">
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-green-400 to-green-500 rounded-full flex items-center justify-center shadow-lg">
        <span className="material-symbols-outlined text-white text-4xl">
          check_circle
        </span>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-3">
        {STEP_INFO.done.title}
      </h2>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        您的系统已经配置完成，现在可以开始使用了。
      </p>
      <div className="bg-gray-50 p-6 rounded-lg max-w-md mx-auto text-left">
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

  const renderContent = () => {
    switch (currentStep) {
      case 'welcome':
        return renderWelcome();
      case 'remote':
        return renderRemote();
      case 'local':
        return renderLocal();
      case 'clone':
        return renderClone();
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
      case 'clone':
        break;
      case 'files':
        nextStep();
        break;
      case 'service':
        await handleSaveAndFinish();
        break;
      default:
        nextStep();
    }
  };

  const showBack = currentStep !== 'welcome' && currentStep !== 'done' && currentStep !== 'clone';
  const showNext = currentStep !== 'done';
  const showSkip = currentStep === 'clone' && !loading;

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f6fafe] to-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl p-8">
          {currentStep !== 'welcome' && currentStep !== 'done' && renderStepIndicator()}

          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-[#2D3A82]">
              {STEP_INFO[currentStep].title}
            </h2>
            <p className="text-gray-500 mt-1">{STEP_INFO[currentStep].description}</p>
          </div>

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
              {showSkip && (
                <button
                  onClick={handleSkipClone}
                  disabled={loading}
                  className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  跳过
                </button>
              )}
              {showNext && (
                <button
                  onClick={handleNext}
                  disabled={loading || !canProceed()}
                  className="px-6 py-2.5 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {loading ? '处理中...' : currentStep === 'service' ? '完成配置' : '下一步'}
                </button>
              )}
              {currentStep === 'done' && (
                <button
                  onClick={handleGoToDashboard}
                  className="px-8 py-2.5 bg-gradient-to-r from-[#4d59a3] to-[#404d96] text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
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
