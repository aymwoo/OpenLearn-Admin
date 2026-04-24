'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { getSystemInfo, type SystemInfo } from '@/lib/sys';
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
} from '@/lib/git';

const FeatureCard = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
  <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm border border-outline-variant/10 hover:shadow-md transition-shadow">
    <div className="flex items-center space-x-3 mb-4">
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-primary">{icon}</span>
      </div>
      <h3 className="text-lg font-headline font-bold text-on-surface">{title}</h3>
    </div>
    <div className="text-on-surface-variant leading-relaxed">
      {children}
    </div>
  </div>
);

const StepItem = ({ number, title, description }: { number: number; title: string; description: string }) => (
  <div className="flex gap-4 group">
    <div className="flex flex-col items-center">
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-headline font-bold text-lg group-hover:bg-primary group-hover:text-on-primary transition-colors">
        {number}
      </div>
      <div className="w-px h-full bg-outline-variant/30 mt-2"></div>
    </div>
    <div className="pb-8">
      <h4 className="font-headline font-semibold text-on-surface mb-1">{title}</h4>
      <p className="text-on-surface-variant text-sm leading-relaxed">{description}</p>
    </div>
  </div>
);

const StatusIndicator = ({ color, label, description }: { color: 'green' | 'red' | 'amber'; label: string; description: string }) => (
  <div className="flex items-center space-x-3 p-3 bg-surface-container-lowest rounded-xl">
    <div className={`w-3 h-3 rounded-full ${color === 'green' ? 'bg-emerald-500' : color === 'red' ? 'bg-rose-500' : 'bg-amber-500'} shadow-sm`}></div>
    <div>
      <p className="font-headline font-semibold text-on-surface text-sm">{label}</p>
      <p className="text-on-surface-variant text-xs">{description}</p>
    </div>
  </div>
);

export default function DocsPage() {
  const [config, setConfig] = useState<GitConfig | null>(null);
  const [status, setStatus] = useState<RepoSyncStatus | null>(null);
  const [localDetails, setLocalDetails] = useState<VersionDetails | null>(null);
  const [remoteDetails, setRemoteDetails] = useState<VersionDetails | null>(null);
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [webServiceInfo, setWebServiceInfo] = useState<WebServiceInfo | null>(null);
  const [dbStatus, setDbStatus] = useState<DbConnectionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const configRef = useRef<GitConfig | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    let mounted = true;

    const hydrate = async () => {
      const cfg = await loadConfig();
      if (!mounted) return;
      if (!cfg) return;
      setConfig(cfg);
    };

    hydrate();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <nav className="w-64 flex flex-col h-full bg-surface-container-lowest border-r border-outline-variant/15">
        <div className="p-6 border-b border-surface-container-high">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-on-primary text-lg">school</span>
            </div>
            <h1 className="text-xl font-headline font-bold tracking-tight text-[#004394] dark:text-blue-400">
              OpenLearn Manager
            </h1>
          </div>
        </div>

        <div className="flex-1 py-4 overflow-y-auto">
          <Link
            href="/"
            className="flex items-center space-x-3 px-4 py-3 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
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

        <div className="space-y-1 p-4 border-t border-surface-container-high">
          <Link
            href="/docs"
            className="flex items-center space-x-3 px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-[#004394] hover:bg-[#f2f4f6] dark:hover:bg-slate-800 rounded-xl transition-all font-headline text-sm font-semibold"
          >
            <span className="material-symbols-outlined">help</span>
            <span>文档</span>
          </Link>
        </div>
      </nav>

      <main className="flex-1 ml-64 flex flex-col h-screen overflow-hidden bg-background">
        <header className="flex justify-between items-center w-full px-8 py-4 backdrop-blur-xl bg-[#f7f9fb]/85 dark:bg-slate-950/85 shadow-[0_12px_40px_rgba(0,67,148,0.08)] z-10 sticky top-0">
          <div className="flex items-center space-x-4">
            <h2 className="font-headline text-lg font-bold tracking-tight text-[#004394] dark:text-blue-400">
              文档中心
            </h2>
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
                title="Web服务"
              >
                <span className="material-symbols-outlined text-emerald-500" aria-hidden="true">
                  cloud_done
                </span>
              </button>
            </div>
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
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-headline font-bold tracking-tight text-[#004394] dark:text-blue-400">
                OpenLearn Manager
              </h1>
              <p className="text-xl text-on-surface-variant max-w-2xl mx-auto">
                现代化的一站式管理系统，简化 OpenLearn Manager 平台的运维工作
              </p>
            </div>

            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-2xl p-8 border border-primary/20">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-primary text-2xl">info</span>
                </div>
                <div>
                  <h2 className="font-headline font-bold text-on-surface text-lg mb-2">系统概述</h2>
                  <p className="text-on-surface-variant leading-relaxed">
                    OpenLearn Manager 是一款专为教育平台设计的桌面管理工具，帮助管理员轻松完成版本更新监控、数据库连接管理、Web 服务状态跟踪以及系统配置管理等核心运维任务。通过直观的可视化界面，即使是非技术背景的管理员也能快速上手，实现对 OpenLearn Manager 系统的全面掌控。
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">apps</span>
                核心功能
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FeatureCard icon="sync" title="智能版本同步">
                  <p className="mb-3">自动检测本地与远程仓库的版本差异，支持一键拉取最新代码。系统会显示 ahead/behind 状态，直观呈现本地与远程的提交差异。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>自动对比本地与远程版本号</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>智能增量更新，减少网络传输</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>实时显示更新进度</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="monitoring" title="实时状态监控">
                  <p className="mb-3">24/7 全天候监控系统运行状态，包括数据库连接、Web 服务健康度、资源使用情况等关键指标。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>数据库连接状态实时监测</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>CPU、内存、磁盘使用率</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>自动告警通知</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="database" title="数���库管理">
                  <p className="mb-3">便捷的数据库连接管理，支持 SQL Server 等主流数据库，提供连接状态查看和配置同步功能。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>一键同步数据库配置</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>连接信息加密存储</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>支持多种数据库类型</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="tune" title="灵活配置管理">
                  <p className="mb-3">可视化配置界面，支持修改 Git 仓库地址、本地路径、Web 服务地址等核心参数，无需手动编辑配置文件。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>引导式配置向导</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>配置参数即时生效</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>配置备份与恢复</span>
                    </li>
                  </ul>
                </FeatureCard>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">rocket_launch</span>
                快速开始
              </h2>
              <div className="bg-surface-container-lowest rounded-2xl p-8 border border-outline-variant/10">
                <div className="max-w-2xl">
                  <StepItem 
                    number={1} 
                    title="首次启动" 
                    description="启动应用程序后，如果未检测到配置文件，系统将自动跳转到配置向导页面。您也可以随时通过「系统设置」页面中的「重新运行配置向导」按钮手动唤起。"
                  />
                  <StepItem 
                    number={2} 
                    title="配置 Git 仓库" 
                    description="在配置向导中输入远程 Git 仓库地址（默认为 https://gitee.com/nylon26/openlearnsite.git），选择要跟踪的分支（默认为 main 分支）。"
                  />
                  <StepItem 
                    number={3} 
                    title="设置本地路径" 
                    description="选择本地存储路径，用于存放从远程仓库克隆的代码。您可以使用文件选择器或手动输入路径。建议使用不含中文和空格的路径。"
                  />
                  <StepItem 
                    number={4} 
                    title="配置版本信息" 
                    description="设置版本文件和更新日志的路径，用于读取当前版本号和变更记录。默认使用 release.log 和 CHANGELOG.md。"
                  />
                  <StepItem 
                    number={5} 
                    title="配置 Web 服务（可选）" 
                    description="如果您需要监控 Web 服务状态，请输入服务地址。系统会定期检测服务可用性并获取运行数据。"
                  />
                  <StepItem 
                    number={6} 
                    title="完成初始化" 
                    description="确认配置信息后点击完成。系统将自动克隆仓库（如果是首次使用），并在仪表盘页面显示系统状态。"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">dashboard</span>
                仪表盘说明
              </h2>
              
              <div className="space-y-6">
                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">状态指示器</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatusIndicator color="green" label="系统正常" description="所有服务运行正常，版本已是最新" />
                    <StatusIndicator color="amber" label="需要更新" description="检测到远程有新版本可用" />
                    <StatusIndicator color="red" label="连接异常" description="数据库或服务连接失败" />
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">顶部状态栏图标</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <span className="material-symbols-outlined text-emerald-500">dns</span>
                        <div>
                          <p className="font-headline font-semibold text-on-surface">数据库状态</p>
                          <p className="text-sm text-on-surface-variant">绿色表示已连接，红色表示未连接。鼠标悬停可查看连接详情（服务器/数据库名）</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <span className="material-symbols-outlined text-emerald-500">cloud_done</span>
                        <div>
                          <p className="font-headline font-semibold text-on-surface">Web 服务状态</p>
                          <p className="text-sm text-on-surface-variant">绿色表示服务正常运行，可响应请求。系统每 5 秒自动检测一次</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">Web 服务信息卡片</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-blue-500 text-sm">group</span>
                        <p className="text-xs font-semibold text-slate-500">学生总数</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">系统中注册的学生用户数量</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-indigo-500 text-sm">menu_book</span>
                        <p className="text-xs font-semibold text-slate-500">学案总数</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">平台上创建的学案模板数量</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-violet-500 text-sm">art_track</span>
                        <p className="text-xs font-semibold text-slate-500">作品数量</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">学生提交的各类作品总数</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-emerald-500 text-sm">timer</span>
                        <p className="text-xs font-semibold text-slate-500">运行时间</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">Web 服务自上次启动以来的运行时长</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-rose-500 text-sm">memory</span>
                        <p className="text-xs font-semibold text-slate-500">内存使用</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">ASP.NET 运行时的内存占用（MB）</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-cyan-500 text-sm">reorder</span>
                        <p className="text-xs font-semibold text-slate-500">线程数</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">当前活跃的工作线程数量</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-violet-500 text-sm">storage</span>
                        <p className="text-xs font-semibold text-slate-500">数据库大小</p>
                      </div>
                      <p className="font-headline font-bold text-on-surface">SQL Server 数据库文件大小</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">terminal</span>
                系统终端
              </h2>
              <div className="bg-[#2b2b2b] rounded-2xl p-6 border border-white/10">
                <div className="flex items-center space-x-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                  <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                  <span className="text-white/50 text-sm ml-2">SYSTEM_TERMINAL</span>
                </div>
                <p className="text-white/70 leading-relaxed mb-4">
                  系统终端显示实时的操作日志和状态消息。日志会根据内容类型自动着色：
                </p>
                <div className="space-y-2 font-mono text-sm">
                  <p><span className="text-emerald-400">绿色文字</span> <span className="text-white/70">- 成功操作或系统正常信息</span></p>
                  <p><span className="text-amber-400">黄色文字</span> <span className="text-white/70">- 警告信息或需要注意的事项</span></p>
                  <p><span className="text-rose-400">红色文字</span> <span className="text-white/70">- 错误信息或操作失败</span></p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">settings</span>
                系统设置
              </h2>
              <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                <p className="text-on-surface-variant leading-relaxed mb-6">
                  通过「系统设置」页面，您可以随时修改以下配置：
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-sm">code</span>
                      <p className="font-headline font-semibold text-on-surface">Git 仓库配置</p>
                    </div>
                    <p className="text-sm text-on-surface-variant">修改远程仓库地址、分支名称等</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-sm">folder</span>
                      <p className="font-headline font-semibold text-on-surface">存储路径配置</p>
                    </div>
                    <p className="text-sm text-on-surface-variant">更改本地代码存放路径</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-sm">language</span>
                      <p className="font-headline font-semibold text-on-surface">Web 服务地址</p>
                    </div>
                    <p className="text-sm text-on-surface-variant">配置 Web 服务的访问地址和端口</p>
                  </div>
                  <div className="bg-surface-container-low rounded-xl p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <span className="material-symbols-outlined text-primary text-sm">restart_alt</span>
                      <p className="font-headline font-semibold text-on-surface">重新运行向导</p>
                    </div>
                    <p className="text-sm text-on-surface-variant">清除现有配置，重新开始设置流程</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">code</span>
                默认配置
              </h2>
              <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between py-3 border-b border-outline-variant/10">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-primary">cloud</span>
                      <span className="font-headline font-semibold text-on-surface">远程仓库</span>
                    </div>
                    <code className="bg-surface-container-low px-3 py-1 rounded-lg text-sm text-primary">
                      https://gitee.com/nylon26/openlearnsite.git
                    </code>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-outline-variant/10">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-primary">account_tree</span>
                      <span className="font-headline font-semibold text-on-surface">默认分支</span>
                    </div>
                    <code className="bg-surface-container-low px-3 py-1 rounded-lg text-sm text-primary">
                      main
                    </code>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-outline-variant/10">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-primary">description</span>
                      <span className="font-headline font-semibold text-on-surface">版本文件</span>
                    </div>
                    <code className="bg-surface-container-low px-3 py-1 rounded-lg text-sm text-primary">
                      release.log
                    </code>
                  </div>
                  <div className="flex items-center justify-between py-3">
                    <div className="flex items-center space-x-3">
                      <span className="material-symbols-outlined text-primary">history</span>
                      <span className="font-headline font-semibold text-on-surface">更新日志</span>
                    </div>
                    <code className="bg-surface-container-low px-3 py-1 rounded-lg text-sm text-primary">
                      CHANGELOG.md
                    </code>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-r from-emerald-500/10 via-primary/10 to-violet-500/10 rounded-2xl p-8 border border-primary/20">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-primary text-3xl">handshake</span>
                </div>
                <h2 className="text-2xl font-headline font-bold text-on-surface">需要帮助？</h2>
                <p className="text-on-surface-variant max-w-lg mx-auto">
                  如果您在使用过程中遇到任何问题，请通过以下方式获取支持：
                </p>
                <div className="flex items-center justify-center space-x-6">
                  <a href="https://gitee.com/nylon26/openlearnsite" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-primary hover:underline">
                    <span className="material-symbols-outlined">link</span>
                    <span>访问 Gitee 仓库</span>
                  </a>
                  <a href="https://github.com/nylon26/openlearnsite" target="_blank" rel="noopener noreferrer" className="flex items-center space-x-2 text-primary hover:underline">
                    <span className="material-symbols-outlined">link</span>
                    <span>访问 GitHub 仓库</span>
                  </a>
                </div>
              </div>
            </div>

            <footer className="text-center py-8 text-on-surface-variant text-sm">
              <p>OpenLearn Manager v4.2.1 · Built with Next.js · © 2024 OpenLearn Manager Team</p>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}