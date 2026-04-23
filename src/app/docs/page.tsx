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
              OpenLearn
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
              文档
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
          <div className="prose dark:prose-invert max-w-none">
            <h1>OpenLearn Admin 使用文档</h1>
            
            <h2>概述</h2>
            <p>OpenLearn Admin 是一个桌面管理工具，用于管理 OpenLearn 系统的版本更新和配置。</p>
            
            <h2>主要功能</h2>
            <ul>
              <li><strong>版本管理</strong> - 查看本地和远程版本号</li>
              <li><strong>状态监控</strong> - 监控数据库和 Web 服务连接状态</li>
              <li><strong>配置管理</strong> - 通过设置页面或配置向导管理仓库配置</li>
              <li><strong>服务控制</strong> - 启动/停止 Web 服务</li>
            </ul>
            
            <h2>首次使用</h2>
            <ol>
              <li>首次启动应用时，会自动进入配置向导</li>
              <li>配置远端 Git 仓库地址</li>
              <li>选择本地存储路径（可使用文件选择器或手动输入）</li>
              <li>配置版本文件和更新日志路径</li>
              <li>配置 Web 服务地址（可选）</li>
            </ol>
            
            <h2>顶部状态栏</h2>
            <ul>
              <li>☁️ <strong>数据库状态</strong> - 绿色表示已连接，红色表示未连接，鼠标悬停可查看连接信息</li>
              <li>☁️ <strong>Web 服务状态</strong> - 绿色表示已连接，红色表示未连接</li>
            </ul>
            
            <h2>Web 服务卡片</h2>
            <p>显示 Web 服务的实时数据���</p>
            <ul>
              <li>学生总数 - 当前学生数量</li>
              <li>学案总数 - 当前学案数量</li>
              <li>作品数量 - 当前作品数量</li>
              <li>运行时间 - 服务运行时长和开始时间</li>
              <li>内存 - ASP.NET 内存使用量</li>
              <li>线程数 - 当前线程数</li>
              <li>数据库 - 数据库大小</li>
            </ul>
            
            <h2>配置向导</h2>
            <p>如果需要重新配置系统，可以通过设置页面的"重新运行配置向导"按钮唤起。</p>
            
            <h2>快捷操作</h2>
            <ul>
              <li><strong>Start Service</strong> - 启动 Web 服务</li>
              <li><strong>Stop Service</strong> - 停止 Web 服务</li>
              <li><strong>Settings</strong> - 打开设置页面</li>
            </ul>
            
            <h2>默认配置</h2>
            <ul>
              <li>远程仓库: <code>https://gitee.com/nylon26/openlearnsite.git</code></li>
              <li>版本文件: <code>release.log</code></li>
              <li>更新日志: <code>CHANGELOG.md</code></li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}