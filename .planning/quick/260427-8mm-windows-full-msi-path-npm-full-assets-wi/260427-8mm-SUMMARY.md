---
phase: quick
plan: "01"
subsystem: infra
tags: [windows, tauri, rust, nodejs, npm, workflow, msi]
requires: []
provides:
  - "Windows full 安装优先命中 resources/nodejs 内置 MSI，再执行统一的 npm readiness 校验"
  - "Windows bundled MSI 扫描目录、选择规则与 node/npm/pnpm 路径拼装拥有回归测试保护"
  - "release workflow 缺少 full MSI 时直接提示 assets-windows 到 resources/nodejs 契约"
affects: [windows packaging, node environment, release workflow]
tech-stack:
  added: []
  patterns: ["Windows online/full MSI 安装共用 post-install npm readiness gate", "Windows full bundle 只认 assets-windows -> resources/nodejs 单一路径契约"]
key-files:
  created: []
  modified: [src-tauri/src/lib.rs, .github/workflows/release.yml]
key-decisions:
  - "把 Windows online/full 安装收口到同一个 install + readiness helper，避免两条链路各自漂移。"
  - "full 版未命中包内 MSI 时，错误文案直接指向 assets-windows -> resources/nodejs 构建契约。"
  - "用纯单元测试锁住 bundled MSI 扫描与 Windows 命令路径契约，不依赖真实 Windows 安装环境。"
patterns-established:
  - "Bundled MSI discovery contract: resource_dir/nodejs 与 resource_dir/resources/nodejs"
  - "Windows readiness contract: 安装成功必须等于当前应用进程内 npm.cmd 可调用"
requirements-completed: []
duration: 11min
completed: 2026-04-27
---

# Phase quick Plan 01: Windows full MSI 路径与 npm 就绪总结

**Windows online/full Node.js MSI 安装现在共享同一个 npm readiness 收尾，full 包缺少内置 MSI 时会直接指向 assets-windows 到 resources/nodejs 契约，并由单元测试锁住扫描与命令路径规则。**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-26T22:09:30Z
- **Completed:** 2026-04-26T22:20:26Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- 收口 `install_node_env` 的 Windows 分支，让 bundled MSI 安装与 online 下载都走同一个安装后 npm readiness gate。
- 为 `discover_windows_bundled_node_msi`、扫描目录契约和 Windows node/npm/pnpm 路径 helper 增加回归测试。
- 强化 full bundle 构建侧诊断，让 CI 与运行时都围绕 `assets-windows -> resources/nodejs` 同一契约报错。

## Task Commits

Each task was committed atomically:

1. **Task 1: 收口 Windows online/full 安装后的 readiness 校验** - `36cf257` (fix)
2. **Task 2: 锁定 Windows bundled MSI 与命令路径回归测试** - `7e66c64` (test)
3. **Task 3: 明确 Windows full bundle 构建契约提示** - `9f78612` (chore)

**Plan metadata:** Not committed per task constraints.

## Files Created/Modified

- `src-tauri/src/lib.rs` - 收口 Windows MSI 安装后的 readiness helper，补充 full 缺包错误文案，并新增 bundled MSI 与命令路径测试。
- `.github/workflows/release.yml` - 在 Windows full 构建前缺少 MSI 时直接提示 `assets-windows -> resources/nodejs` 契约。

## Decisions Made

- Windows bundled 与 online 两条 MSI 安装链路都必须在返回成功前完成同一套程序内 `npm.cmd -v` 校验。
- full 包运行时仍然只按 `.msi` 扫描，不重新硬编码具体 MSI 文件名。
- full 包缺少 MSI 的错误必须显式区分“包内没有 MSI”和“安装后 npm 不可用”两类问题。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `cargo` 过程中短暂等待 package cache/build directory 锁；重试后验证正常完成，无需改代码。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Windows full 安装链路的资源目录、运行时扫描与构建期校验已经对齐，可直接继续做真实 Windows 打包验证。
- 若后续有人改动 bundled MSI 扫描目录或 Windows 命令路径拼装，现有单元测试会直接报错。

## Self-Check: PASSED

- Found file: `src-tauri/src/lib.rs`
- Found file: `.github/workflows/release.yml`
- Found commit: `36cf257`
- Found commit: `7e66c64`
- Found commit: `9f78612`
