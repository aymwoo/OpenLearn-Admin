# State

**Project:** OpenLearn-Admin
**Started:** 2026-04-21

---

### Last activity

2026-04-27 - Completed quick task 260427-9na: 移除 assets-windows，Node.js MSI 直接存放于 resources/nodejs，发布 v0.2.13

---

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260423-pil-webconfig | 根据本地路径根目录的webconfig中的数据库连接字符串获取数据库连接信息,展示数据库连接状态在顶部区域 | 2026-04-23 | 61942c7 | [260423-pil-webconfig](./quick/260423-pil-webconfig/) |
| 260423-pdn- | 无法连接到服务器的时候进行提示处理 | 2026-04-23 | 0c1c782 | [260423-pdn-](./quick/260423-pdn-/) |
| 260423-opd-pull-git-pull | 在克隆或者pull的时候,我希望能有像真正git命令一样的进度展示,比如已pull数据的百分比 | 2026-04-23 | a9e31fc | [260423-opd-pull-git-pull](./quick/260423-opd-pull-git-pull/) |
| 260423-n3s-1-2-https-gitee-com-nylon26-openlearnsit | 本地仓库的路径支持两种方式的设置,1是通过弹出的文件选择框进入输入,2是手动输入路径,默认的远程仓库地址设置为https://gitee.com/nylon26/openlearnsite.git | 2026-04-23 | d1bf87d | [260423-n3s-1-2-https-gitee-com-nylon26-openlearnsit](./quick/260423-n3s-1-2-https-gitee-com-nylon26-openlearnsit/) |
| 260422-i24-update-progress | 添加更新开始时的进度显示 | 2026-04-22 | d50b46d | [260422-i24-update-progress](./quick/260422-i24-update-progress/) |
| 260422-hvh-unbornbranch | 修复强制覆盖时的UnbornBranch错误 | 2026-04-22 | 28ebae3 | [260422-hvh-unbornbranch](./quick/260422-hvh-unbornbranch/) |
| 260422-hnj-force-override | 实现强制覆盖：备份冲突文件后用远端强制覆盖本地 | 2026-04-22 | 8e9b33a | [260422-hnj-force-override](./quick/260422-hnj-force-override/) |
| 260422-hbc-release-log | 修复仓库缺少 release.log 文件错误处理逻辑 | 2026-04-22 | 37d2eb0 | [260422-hbc-release-log](./quick/260422-hbc-release-log/) |
| 260422-unborn-branch-fix | 修复读取当前分支失败 (UnbornBranch) | 2026-04-22 | 4192794 | [260422-unborn-branch-fix](./quick/260422-unborn-branch-fix/) |
| 260421-v2i | 使用merge_analysis改进ahead/behind计算 | 2026-04-21 | 8ffd7e8 | [260421-v2i-merge-analysis-ahead-behind](./quick/260421-v2i-merge-analysis-ahead-behind/) |
| 260421-uxn | 修复ahead behind计算不准确问题 | 2026-04-21 | 9103747 | [260421-uxn-ahead-behind](./quick/260421-uxn-ahead-behind/) |
| 260421-ub0 | 添加ahead behind lastCommitTime显示 | 2026-04-21 | b6ec63f | [260421-ub0-ahead-behind-lastcommittime](./quick/260421-ub0-ahead-behind-lastcommittime/) |
| 260421-u72 | 添加git分支比较显示领先落后提交数等信息 | 2026-04-21 | e4502a1 | [260421-u72-git](./quick/260421-u72-git/) |
| 260421-tsv | 只显示changelog差异并加大字体 | 2026-04-21 | 6639cb2 | [260421-tsv-changelog](./quick/260421-tsv-changelog/) |
| 260421-rnc | 添加版本日志折叠效果 | 2026-04-21 | 0c049e9 | [260421-rnc-changelog](./quick/260421-rnc-changelog/) |
| 260421-rjo-clone | 添加 get_dashboard_data 自动克隆逻辑 | 2026-04-21 | 241e134 | [260421-rjo-clone](./quick/260421-rjo-clone/) |
| 260421-r1p | 修复 GBM buffer 错误 | 2026-04-21 | d8adcd6 | [260421-r1p-gbm-buffer](./quick/260421-r1p-gbm-buffer/) || 260421-platform-services | Implement cross-platform start/stop service commands | 2026-04-21 | HEAD | [260421-platform-services](./quick/260421-platform-services/) |
| 260425-b6e | 修复 Tauri Rust 构建错误：移除 run 的错误 command 标注，恢复 is_windows 命令与 thread 导入，确保 release workflow 可构建 | 2026-04-25 | 8b039db | [260425-b6e-tauri-rust-run-command-is-windows-thread](./quick/260425-b6e-tauri-rust-run-command-is-windows-thread/) |
| 260426-ihi | 修复 Rust git2 在 Gitee HTTPS 克隆时报 too many redirects or authentication replays | 2026-04-26 | 26b243e | [260426-ihi-rust-git2-gitee-https-too-many-redirects](./quick/260426-ihi-rust-git2-gitee-https-too-many-redirects/) |
| 260426-wph | 修复 Windows 打包应用中的 Node.js 安装逻辑，确保 online 版本安装失败时给出可诊断错误，full 版本将 assets-windows 中的 Node.js MSI 正确打入安装包并可从 resource_dir 检测到 | 2026-04-26 | a2dc0a0 | [260426-wph-windows-node-js-online-full-assets-windo](./quick/260426-wph-windows-node-js-online-full-assets-windo/) |
| 260427-07s | 修复 Windows online/full Node.js MSI 安装链路，统一程序内 npm/pnpm 命中刚安装的 Windows Node 目录，并固化 assets-windows → resources/nodejs 的 full bundle 契约 | 2026-04-27 | 92bbf98 | [260427-07s-windows-online-full-node-js-online-msi-p](./quick/260427-07s-windows-online-full-node-js-online-msi-p/) |
| 260427-8mm | 梳理并固化 Windows online/full Node.js MSI 安装链路，统一安装后 npm readiness 收尾、补足 bundled MSI 回归测试，并明确 assets-windows 到 resources/nodejs 的 full bundle 契约提示 | 2026-04-26 | 9f78612 | [260427-8mm-windows-full-msi-path-npm-full-assets-wi](./quick/260427-8mm-windows-full-msi-path-npm-full-assets-wi/) |
| 260427-9na | 移除 assets-windows，Node.js MSI 直接存放于 resources/nodejs，发布 v0.2.13 | 2026-04-27 | 6bba50f | [260427-9na-assets-windows-resources-nodejs-msi-0-2-](./quick/260427-9na-assets-windows-resources-nodejs-msi-0-2-/) |
