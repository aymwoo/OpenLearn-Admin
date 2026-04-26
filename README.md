# OpenLearn Manager

一个基于 Tauri + Next.js 的桌面应用程序，用于管理 OpenLearn 网站的 Git 仓库同步与版本控制。

## 功能特性

- **Git 仓库管理**：支持克隆、拉取、强制覆盖本地仓库
- **版本同步**：实时显示本地与远端版本差异 (ahead/behind)
- **自动备份**：执行同步前自动备份本地修改
- **全局进度**：跨页面的任务进度指示器
- **系统服务**：集成 Node.js/pnpm 环境管理，支持一键启动本地 Web 服务
- **跨平台**：支持 Windows 与 Linux (含 NVIDIA 驱动兼容性处理)

## 技术栈

- **前端**：Next.js 16 + React 19 + TypeScript + Tailwind CSS
- **后端**：Tauri 2.x (Rust)
- **Git 集成**：libgit2 (via git2-rs)

## 开发环境

### 前置要求

- Node.js 18+
- pnpm 8+
- Rust 1.70+

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
# 启动 Tauri 开发服务器
pnpm tauri dev
```

### 构建生产版本

```bash
pnpm tauri build
```

## 项目结构

```
├── src/                    # Next.js 前端源码
│   ├── app/               # App Router 页面
│   ├── components/         # React 组件
│   └── lib/               # 工具函数与 Git API
├── src-tauri/             # Tauri/Rust 后端
│   ├── src/
│   │   └── lib.rs         # 主要后端逻辑
│   └── tauri.conf.json    # Tauri 配置
├── CHANGELOG.md           # 版本更新日志
└── package.json           # 前端依赖配置
```

## 配置说明

首次使用需在设置页面配置：

1. **仓库地址**：Gitee/GitHub 仓库的 HTTPS 或 SSH 地址
2. **本地路径**：本地仓库存放目录
3. **分支名称**：默认分支 (main/master)
4. **Web 服务**：本地 Web 服务的启动参数

## 许可证

MIT License