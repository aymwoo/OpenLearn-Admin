"use client";

import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-[#f7f9fb] dark:bg-slate-950 text-on-surface">
      <nav className="h-16 flex items-center px-8 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-outline-variant/10 sticky top-0 z-50">
        <Link 
          href="/"
          className="flex items-center space-x-2 text-slate-600 dark:text-slate-400 hover:text-primary transition-colors group"
        >
          <span className="material-symbols-outlined group-active:-translate-x-1 transition-transform">arrow_back</span>
          <span className="font-semibold">返回仪表盘</span>
        </Link>
        <h1 className="flex-1 text-center font-headline font-bold text-lg">系统使用手册</h1>
      </nav>

      <main className="max-w-4xl mx-auto p-8 space-y-12">
        {/* Header Section */}
        <section className="text-center space-y-4">
          <div className="inline-flex p-4 bg-primary/10 rounded-3xl mb-4">
            <span className="material-symbols-outlined text-5xl text-primary">auto_stories</span>
          </div>
          <h2 className="text-4xl font-headline font-black tracking-tight">如何管理您的教学系统</h2>
          <p className="text-on-surface-variant max-w-xl mx-auto leading-relaxed">
            本指南旨在帮助老师们轻松管理 OpenLearnsite 系统，无需了解复杂的 Git 命令，即可完成日常维护与更新。
          </p>
        </section>

        {/* Section 1: Update Guide */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">1</div>
            <h3 className="text-2xl font-headline font-bold">系统更新说明</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-outline-variant/10 space-y-4">
              <div className="flex items-center space-x-3 text-orange-600 dark:text-orange-400">
                <span className="material-symbols-outlined">notification_important</span>
                <span className="font-bold">什么时候需要更新？</span>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                当您在仪表盘看到 <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">发现新版本</span> 或 <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">需要更新</span> 的提示时，意味着开发者发布了新的功能或修复。
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-outline-variant/10 space-y-4">
              <div className="flex items-center space-x-3 text-primary">
                <span className="material-symbols-outlined">touch_app</span>
                <span className="font-bold">如何进行更新？</span>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                只需点击仪表盘左侧醒目的蓝色 <span className="font-bold text-primary">圆形按钮</span>（或提示信息旁的按钮）。系统会自动完成文件的同步，您只需要等待进度条达到 100% 即可。
              </p>
            </div>
          </div>
        </section>

        {/* Section 2: Git Basics for Teachers */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">2</div>
            <h3 className="text-2xl font-headline font-bold">了解 Git 同步</h3>
          </div>

          <div className="bg-blue-50 dark:bg-blue-900/20 p-8 rounded-3xl space-y-6">
            <p className="text-on-surface-variant">
              Git 是我们用来存储和分发教学代码的工具。通过本后台，您不需要在命令行输入任何代码，只需点击按钮，系统就会：
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col items-center text-center space-y-2 p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl">
                <span className="material-symbols-outlined text-blue-500">cloud_download</span>
                <span className="text-sm font-bold">1. 下载</span>
                <span className="text-xs text-on-surface-variant">从远程服务器下载最新文件</span>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl">
                <span className="material-symbols-outlined text-blue-500">merge</span>
                <span className="text-sm font-bold">2. 合并</span>
                <span className="text-xs text-on-surface-variant">将新文件与您的本地配置合并</span>
              </div>
              <div className="flex flex-col items-center text-center space-y-2 p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl">
                <span className="material-symbols-outlined text-blue-500">check_circle</span>
                <span className="text-sm font-bold">3. 完成</span>
                <span className="text-xs text-on-surface-variant">自动生效，无需重启服务器</span>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: FAQ */}
        <section className="space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">?</div>
            <h3 className="text-2xl font-headline font-bold">常见问题</h3>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "更新过程中失败了怎么办？",
                a: "通常是因为网络连接不稳定。请确保您可以正常访问代码仓库，并再次尝试点击更新按钮。"
              },
              {
                q: "更新会丢失我的数据吗？",
                a: "不会。系统更新只涉及核心代码，您的数据库、上传的课件以及用户数据都是独立存储的，非常安全。"
              },
              {
                q: "“本地领先于远程”是什么意思？",
                a: "这通常意味着您在本地对代码做了一些修改，或者您正在使用的版本比官方发布的还要新。如果您没有手动修改过代码，通常可以忽略此提示。"
              }
            ].map((item, index) => (
              <div key={index} className="group p-6 bg-white dark:bg-slate-900 rounded-2xl border border-outline-variant/10 hover:border-primary/30 transition-all shadow-sm">
                <h4 className="font-bold mb-2 flex items-center">
                  <span className="text-primary mr-2">Q:</span>
                  {item.q}
                </h4>
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  <span className="text-emerald-500 mr-2 font-bold">A:</span>
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-outline-variant/10 text-center">
          <p className="text-xs text-on-surface-variant">
            OpenLearnsite 管理助手 &copy; 2026. 助力每一位教师轻松教学。
          </p>
        </footer>
      </main>
    </div>
  );
}
