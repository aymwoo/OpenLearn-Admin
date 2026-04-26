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
            <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
            <button
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-[#f2f4f6] dark:hover:bg-slate-800 transition-all duration-200 rounded-xl active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Sync Repository"
              title="手动同步"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                refresh
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
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="text-center space-y-3">
              <h1 className="text-4xl font-headline font-bold tracking-tight text-[#004394] dark:text-blue-400">
                OpenLearn Manager
              </h1>
              <p className="text-xl text-on-surface-variant max-w-2xl mx-auto">
                面向 OpenLearn 教育平台的一站式运维管理工具
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
                    OpenLearn Manager 是一款专为 OpenLearn 开源学习平台设计的桌面管理工具，基于 Tauri 2 + Next.js 构建，为管理员提供版本同步、服务运维、资源监控、环境管理等一站式管理能力。通过直观的可视化界面和实时数据面板，帮助管理员高效掌握系统运行状态，简化日常运维工作。
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
                  <p className="mb-3">自动检测本地与远程仓库的版本差异，支持一键拉取最新代码。展示本地与远程的版本号、ahead/behind 提交数以及对应用户头像。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>自动对比本地与远程版本号（含稳定版/测试版标签）</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>一键 Smart Pull 增量同步，圆形进度环实时显示</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>CHANGELOG 弹窗查看版本变更记录</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="terminal" title="项目运维管理">
                  <p className="mb-3">在仪表盘上直接启动、停止和重启开发服务器，管理项目依赖和构建流程，所有操作日志实时输出到终端面板。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>启动 / 停止 / 重启开发服务（pnpm dev）</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>依赖安装（pnpm install）与生产构建（pnpm build）</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>端口占用检测与一键打开浏览器</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="monitoring" title="系统资源监控">
                  <p className="mb-3">每 2 秒自动采集系统资源指标，通过进度条可视化呈现 CPU、内存和磁盘使用情况，支持系统运行时间显示。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>CPU 使用率实时采集与进度条展示</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>已用内存 / 总内存与磁盘可用空间监控</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>系统运行时长、数据库连接状态实时检测</span>
                    </li>
                  </ul>
                </FeatureCard>

                <FeatureCard icon="dns" title="Web 服务业务监控">
                  <p className="mb-3">每 5 秒轮询 Web 服务端点，获取业务数据并展示在仪表盘卡片中，帮助管理员掌握平台运营概况。</p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>学生总数、学案总数、作品数量统计</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>ASP.NET 服务运行时长、内存占用、线程数</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                      <span>SQL Server 数据库大小与连接状态</span>
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
                    description="启动应用程序后，如果未检测到配置文件，系统将自动跳转到配置向导页面（/setup）。您也可以随时通过「系统设置」页面中的「重新运行配置向导」按钮手动唤起。"
                  />
                  <StepItem 
                    number={2} 
                    title="配置 Git 仓库" 
                    description="在配置向导中输入远程 Git 仓库地址（默认为 https://gitee.com/nylon26/openlearnsite.git），选择要跟踪的分支（默认为 main 分支）。"
                  />
                  <StepItem 
                    number={3} 
                    title="设置本地路径" 
                    description="通过文件选择器或手动输入本地存储路径。首次使用且本地为空目录时，系统会自动克隆远程仓库。建议使用不含中文和空格的路径。"
                  />
                  <StepItem 
                    number={4} 
                    title="配置版本文件" 
                    description="设置版本文件和更新日志的相对路径，用于读取版本号（如 v2.0.1）和变更记录。默认使用 release.log 和 CHANGELOG.md。"
                  />
                  <StepItem 
                    number={5} 
                    title="配置 Web 服务（可选）" 
                    description="输入 ASP.NET Web 服务的访问地址（如 http://127.0.0.1:8000），系统将定期检测服务可用性并获取学生数、学案数等业务数据。"
                  />
                  <StepItem 
                    number={6} 
                    title="完成初始化" 
                    description="确认配置后点击保存。系统将自动克隆仓库（如果是首次使用），并跳转到仪表盘页面展示所有系统状态与数据。"
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
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">系统版本状态</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-4">
                    仪表盘顶部大卡片根据本地与远程的版本差异展示三种状态：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatusIndicator color="green" label="系统已经是最新" description="本地版本与远程版本一致，无需更新" />
                    <StatusIndicator color="amber" label="发现新版本" description="远程有新版本可用，建议点击同步" />
                    <StatusIndicator color="red" label="连接异常" description="无法连接远程仓库或 Web 服务" />
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">顶部状态栏</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <span className="material-symbols-outlined text-primary">dns</span>
                        <div>
                          <p className="font-headline font-semibold text-on-surface">数据库状态</p>
                          <p className="text-sm text-on-surface-variant">绿色表示数据库已连接，红色表示未连接。悬停可查看服务器/数据库名称</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <span className="material-symbols-outlined text-emerald-500">cloud_done</span>
                        <div>
                          <p className="font-headline font-semibold text-on-surface">Web 服务状态</p>
                          <p className="text-sm text-on-surface-variant">绿色表示服务正常运行，灰色表示未配置/未连接</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <span className="material-symbols-outlined text-blue-500">refresh</span>
                        <div>
                          <p className="font-headline font-semibold text-on-surface">手动同步</p>
                          <p className="text-sm text-on-surface-variant">点击立即从远程仓库拉取最新版本</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">Web 服务数据卡片</h3>
                  <p className="text-on-surface-variant text-sm mb-4">Web 服务连接正常时，仪表盘底部会展示以下业务数据卡片：</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { icon: 'group', color: 'text-blue-500', label: '学生总数', desc: '系统中注册的学生用户数量' },
                      { icon: 'menu_book', color: 'text-indigo-500', label: '学案总数', desc: '平台上创建的学案模板数量' },
                      { icon: 'art_track', color: 'text-violet-500', label: '作品数量', desc: '学生提交的各类作品总数' },
                      { icon: 'timer', color: 'text-emerald-500', label: '运行时间', desc: 'Web 服务自上次启动以来的运行时长' },
                      { icon: 'memory', color: 'text-rose-500', label: 'ASP.NET 内存', desc: 'ASP.NET 运行时的内存占用（MB）' },
                      { icon: 'reorder', color: 'text-cyan-500', label: '线程数', desc: '当前活跃的工作线程数量' },
                      { icon: 'storage', color: 'text-violet-500', label: '数据库大小', desc: 'SQL Server 数据库文件大小' },
                    ].map(item => (
                      <div key={item.label} className="bg-surface-container-low rounded-xl p-4">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`material-symbols-outlined ${item.color} text-sm`}>{item.icon}</span>
                          <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                        </div>
                        <p className="font-headline font-bold text-on-surface text-sm">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">terminal</span>
                项目运维管理
              </h2>
              
              <div className="space-y-6">
                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">开发服务控制</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-4">
                    仪表盘的「项目运维管理」区域提供了完整的开发服务生命周期控制：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-emerald-500 text-sm">play_arrow</span>
                        <p className="font-headline font-semibold text-on-surface">启动开发服务</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">执行 pnpm dev 启动 Next.js 开发服务器。启动前自动检测端口占用，如被占用将弹出确认对话框。</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-rose-500 text-sm">stop</span>
                        <p className="font-headline font-semibold text-on-surface">停止服务</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">安全终止正在运行的开发服务进程。</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-amber-500 text-sm">restart_alt</span>
                        <p className="font-headline font-semibold text-on-surface">安装依赖</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">执行 pnpm install 安装项目所需的 NPM 依赖包。</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-blue-500 text-sm">build</span>
                        <p className="font-headline font-semibold text-on-surface">执行构建</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">执行 pnpm build 进行生产环境构建。</p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#2b2b2b] rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center space-x-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                    <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                    <span className="text-white/50 text-sm ml-2">TERMINAL_OUTPUT</span>
                  </div>
                  <p className="text-white/70 leading-relaxed mb-4">
                    所有项目操作的输出（启动、构建、同步等）会实时显示在可折叠的终端面板中，日志根据内容自动着色：
                  </p>
                  <div className="space-y-2 font-mono text-sm">
                    <p><span className="text-blue-400">&gt;&gt;&gt;</span> <span className="text-white/70">- 命令执行输出前缀</span></p>
                    <p><span className="text-rose-400">红色文字</span> <span className="text-white/70">- 错误信息 [ERROR] 前缀</span></p>
                    <p><span className="text-white/50">灰色文字</span> <span className="text-white/70">- 普通日志消息</span></p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">settings</span>
                系统设置
              </h2>
              <div className="space-y-6">
                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">Git 仓库配置</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-4">
                    通过「系统设置 → Git 仓库」标签页，可配置以下参数：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-primary text-sm">cloud</span>
                        <p className="font-headline font-semibold text-on-surface">远程仓库地址</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">OpenLearn 平台的 Git 仓库 URL</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-primary text-sm">folder</span>
                        <p className="font-headline font-semibold text-on-surface">本地路径</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">本地代码存放目录，支持文件选择器浏览</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-primary text-sm">account_tree</span>
                        <p className="font-headline font-semibold text-on-surface">分支与版本文件</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">跟踪分支、release.log 和 CHANGELOG.md 路径</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-primary text-sm">language</span>
                        <p className="font-headline font-semibold text-on-surface">Web 服务地址</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">ASP.NET 服务的访问 URL 和端口</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-on-surface-variant"><strong>高级选项开关：</strong></p>
                    <ul className="text-sm text-on-surface-variant space-y-1 list-disc list-inside">
                      <li>强制用远端覆盖本地冲突</li>
                      <li>拉取前自动备份当前版本</li>
                      <li>自动恢复 web.config 不被远程覆盖</li>
                    </ul>
                  </div>
                </div>

                <div className="bg-surface-container-lowest rounded-2xl p-6 border border-outline-variant/10">
                  <h3 className="font-headline font-bold text-on-surface text-lg mb-4">Node.js 环境管理</h3>
                  <p className="text-on-surface-variant leading-relaxed mb-4">
                    通过「系统设置 → Node.js 环境」标签页，可管理开发环境：
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-emerald-500 text-sm">check_circle</span>
                        <p className="font-headline font-semibold text-on-surface">Node.js 版本</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">检测当前安装的 Node.js 版本，未安装时提供一键安装按钮</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-blue-500 text-sm">package</span>
                        <p className="font-headline font-semibold text-on-surface">pnpm 版本</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">检测 pnpm 版本，支持一键安装（需 Node.js 已安装）</p>
                    </div>
                    <div className="bg-surface-container-low rounded-xl p-4">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="material-symbols-outlined text-violet-500 text-sm">cloud_sync</span>
                        <p className="font-headline font-semibold text-on-surface">NPM 镜像源</p>
                      </div>
                      <p className="text-sm text-on-surface-variant">一键切换：官方源 / 淘宝镜像 / 腾讯云镜像</p>
                    </div>
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

            <div>
              <h2 className="text-2xl font-headline font-bold text-on-surface mb-6 flex items-center">
                <span className="material-symbols-outlined text-primary mr-3">shield_with_heart</span>
                稳健性与安全性
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FeatureCard icon="lock" title="全局并发保护">
                  <p>系统内置了基于 Rust 原子的全局锁机制。当有一个 Git 任务（如克隆或同步）正在运行时，系统会自动拦截并排斥其他冲突请求，确保仓库数据的一致性，防止多线程操作导致的代码损坏。</p>
                </FeatureCard>
                <FeatureCard icon="settings_backup_restore" title="配置自动保护">
                  <p>在执行版本更新或覆盖操作时，系统会自动检测并暂存本地的 <code>web.config</code> 文件。任务完成后，系统会强制将其恢复，确保本地自定义连接字符串和服务器设置不被远程版本覆盖。</p>
                </FeatureCard>
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
              <p>OpenLearn Manager v2.0.1 · Built with Next.js & Tauri · © 2026 OpenLearn Manager Team</p>
            </footer>
          </div>
        </div>
      </main>
    </div>
  );
}
