---
phase: quick
plan: "01"
subsystem: infra
tags: [release, windows, msi, workflow]
requires: []
provides:
  - "移除 assets-windows 目录，MSI 直接存放于 src-tauri/resources/nodejs"
  - "Release workflow 从 copy 步骤简化为 verify 步骤"
affects: [release workflow, windows packaging]
tech-stack:
  added: []
  patterns: ["Windows full MSI 资产直接从 resources/nodejs 读取，无中间复制"]
key-files:
  created: []
  modified:
    - .github/workflows/release.yml
    - src-tauri/src/lib.rs
    - package.json
    - CHANGELOG.md
  deleted:
    - src-tauri/assets-windows/node-v24.15.0-x64.msi
key-decisions:
  - "assets-windows 已移除，MSI 直接存放在 resources/nodejs"
  - "release workflow 校验步骤替换了复制步骤"
patterns-established:
  - "Full bundle MSI 契约: resources/nodejs 直接包含 *.msi 文件"
requirements-completed: []
duration: 5min
completed: 2026-04-27
---

# Phase quick Plan 01: 移除 assets-windows, MSI 直接存放于 resources/nodejs

**assets-windows 目录已移除，Node.js MSI 直接存放在 src-tauri/resources/nodejs 作为 bundle 资产，release workflow 从复制步骤简化为校验步骤。**

## Performance

- **Duration:** 5 min
- **Tasks:** 1 (all changes in single commit)
- **Files modified:** 5

## Accomplishments

- 删除 `src-tauri/assets-windows/node-v24.15.0-x64.msi`
- Release workflow 中 Copy step 改为 Verify step
- Rust 错误文案从 `assets-windows` 迁移到 `resources/nodejs`
- 测试断言同步更新
- 版本 bump 到 2.0.13

## Task Commits

1. **Task 1: 移除 assets-windows，简化发布流程** - `6bba50f`

## Verification

- `cargo check --manifest-path src-tauri/Cargo.toml` - passed
- `cargo test --manifest-path src-tauri/Cargo.toml --lib` - 19 passed, 0 failed

## Self-Check: PASSED

- Found commit: `6bba50f`
- Tag: `v0.2.13`
- Tag pushed to origin
