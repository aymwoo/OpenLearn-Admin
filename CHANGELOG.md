# 更新日志

所有对本项目的显著更改都将记录在此文件中。

## [0.2.17] - 2026-04-27

### 修复
- **在线版安装提示修正**：移除在线版 Node.js 安装时误报 "包内缺少 MSI" 的错误提示，在线版直接走下载逻辑。

## [0.2.16] - 2026-04-27

### 修复
- **版本号同步**：修正 `tauri.conf.json`、`Cargo.toml`、`Cargo.lock` 版本号与发布 tag 不一致的问题。
- **Release workflow 完善**：修复 Windows online 构建产物未上传、Linux 构建目标错误、job 重名等问题。

## [0.2.15] - 2026-04-27

### 修复
- **同步进度闪结束**：修复更新时进度到 20% 闪回 0% 且无提示的问题。现在同步完成/失败后展示结果 3 秒 + 页面 toast 通知。

## [0.2.14] - 2026-04-27

### 优化
- **Linux bundled 路径清理**：移除 `install_node_env` 中 Linux 非 Windows 分支的 msiexec 死代码，简化安装逻辑结构。

## [0.2.13] - 2026-04-27

### 变更
- **移除 assets-windows 目录**：Node.js MSI 现在直接存放在 `src-tauri/resources/nodejs` 作为 bundle 资产，构建时无需复制步骤。
- **Release workflow 简化**：Windows full 打包前置步骤从"复制 MSI"改为"校验 MSI 存在"，契约从 `assets-windows -> resources/nodejs` 简化为 `resources/nodejs` 直接包含。

## [0.2.12] - 2026-04-27

### 修复
- **Windows Node.js 安装收口**：梳理并固化 Windows online/full Node.js MSI 安装链路，统一使用 npm readiness gate 作为安装成功判据，避免分支漂移。
- **Gitee HTTPS 认证修复**（同上版本）：修复了使用 Gitee HTTPS 地址克隆时出现的 "too many redirects or authentication replays" 错误。

### 优化
- **Windows full bundle 契约强化**：补足回归测试锁住 `resources/nodejs` 扫描目录、多个 `.msi` 选择规则与 node/npm/pnpm 路径拼装，确保后续改动不会导致 regression。
- **构建诊断优化**：当 release workflow 缺失 `assets-windows` 下的 MSI 时，直接提示 `assets-windows -> resources/nodejs` 契约路径，便于快速定位构建配置问题。

## [0.2.6] - 2026-04-26

### 修复
- **Gitee HTTPS 认证修复**：修复了使用 Gitee HTTPS 地址克隆时出现的 "too many redirects or authentication replays" 错误，通过统一 Git 凭据处理逻辑和错误提示来解决此问题。
- **Git 错误提示优化**：将底层 libgit2 错误（如重定向/认证重放）统一转换为中文可执行提示，便于用户理解操作失败原因。

### 优化
- **Git 认证逻辑复用**：抽取共享的远端认证回调，clone、fetch、status 操作现在复用同一套认证策略，避免重复代码。
- **测试覆盖**：增加了 Git 认证错误映射的回归测试。

## [0.2.5] - 2026-04-26

### 修复
- **Linux 图形兼容性修复**：针对 Linux 环境（尤其是 NVIDIA 驱动）添加了 `WEBKIT_DISABLE_DMABUF_RENDERER=1` 环境变量，解决了启动时可能出现的 `Failed to create GBM buffer` 错误。

## [0.2.4] - 2026-04-25


### 修复
- **Tauri 配置修复**：移除了 `tauri.conf.json` 中导致反序列化失败的空插件配置（`dialog`, `log`），解决了程序启动时的 `invalid type: map, expected unit` 错误。

## [0.2.3] - 2026-04-25


### 修复
- **Tauri 配置修复**：纠正了 `tauri.conf.json` 中 `shell` 插件的配置格式，解决了 Tauri 2.x 下 `plugins.shell` 反序列化失败导致的程序无法启动问题。

## [0.2.2] - 2026-04-25


### 修复
- **构建环境修复**：修复了生产环境构建时 `@tauri-apps/plugin-shell` 模块缺失导致的编译失败问题。
- **插件权限配置**：补全了 Tauri 2.x 的 `shell` 和 `dialog` 插件权限，确保应用在打包后能够正常打开浏览器。

## [0.2.1] - 2026-04-25


### 新增
- **全局并发锁保护**：引入了后端原子锁机制，防止多个 Git 同步任务（克隆、拉取）同时运行导致的仓库冲突。
- **全局进度指示器**：进度条现在会在所有页面顶部常驻，支持在不同页面间跳转时自动找回并恢复当前的后台任务进度。
- **Web.config 自动恢复**：增加了本地配置文件保护选项，在执行同步或覆盖操作前自动暂存 `web.config`，并在操作完成后强制恢复，保护本地自定义设置。

### 优化
- **状态同步机制**：后端 `AppState` 现在具备进度快照缓存，确保前端在任何时刻挂载都能获取到最新的任务状态。
- **代码健壮性**：重构了 Rust 后端的类型推导和错误处理，解决了 `Mutex` 锁错误处理中的类型歧义。

### 修复
- 修复了从设置页面返回首页后，正在进行的抓取进度丢失的问题。
- 修复了 `getRemoteStatus` 返回类型不匹配导致的 TypeScript 编译错误。
- 修复了 `is_port_occupied` 指令在重构过程中意外丢失的问题。

## [0.2.0] - 2026-04-25

### 新增
- 实现了 Node.js 和 pnpm 的便携式环境管理，支持自动检测并安装到本地 `tools` 目录。
- 增加了 NPM 镜像源切换功能（官方、淘宝、腾讯云）。
- 增加了服务端口占用检测逻辑，在启动 dev 服务前提供预警提示。
- 增加了“打开服务”按钮，直接在默认浏览器中访问 Web 服务。

### 优化
- **仪表盘 UI 重构**：
    - 精简了顶部状态栏，移除了冗余的数据库连接状态图标。
    - 将 **CPU 使用率**、**内存使用情况** 和 **磁盘空间** 作为核心资源卡片并排展示。
    - 找回了带进度条的 CPU 监控视图，提升了视觉反馈。
- **后端架构升级**：
    - 将所有 Git 指令和项目任务改为异步执行，防止 Windows 环境下 UI 线程阻塞导致停止响应。
    - 引入了 `ProcessManager` 状态管理，确保服务进程的生命周期可控（支持一键停止）。
    - 补全了 Rust 端的结构体定义和类型暗示，解决了编译时的类型推导歧义。

### 修复
- 修复了在 Windows 系统下回到主页面停止响应的问题。
- 修复了恢复代码时可能导致的 JSX 标签嵌套错误和导入缺失问题。
- 修复了 Tauri 指令名冲突导致的编译失败。

## [0.1.0] - 2026-04-20
- 初始版本发布，包含基础的 Git 仓库同步和版本信息查看功能。
