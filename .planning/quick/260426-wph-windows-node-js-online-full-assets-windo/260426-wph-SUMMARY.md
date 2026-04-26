---
phase: quick
plan: "01"
subsystem: windows-node-installer
tags:
  - windows
  - tauri
  - nodejs
  - release-workflow
dependency_graph:
  requires: []
  provides:
    - windows bundled node msi discovery
    - windows installer diagnostics
    - windows full bundle resource contract
  affects:
    - src-tauri/src/lib.rs
    - .github/workflows/release.yml
tech_stack:
  added_patterns:
    - runtime bundled MSI candidate scan under resource_dir
    - shared Windows msiexec diagnostic formatter
    - workflow single-source MSI asset contract
key_files:
  created: []
  modified:
    - src-tauri/src/lib.rs
    - .github/workflows/release.yml
decisions:
  - Windows full 包统一只扫描约定资源目录中的 .msi 文件，不在运行时代码中硬编码 MSI 版本名。
  - Windows online 与 bundled 安装共用同一套 msiexec 失败诊断格式，输出退出码、stdout、stderr。
  - Release workflow 以单一环境变量声明 full 包 MSI 文件名，并始终复制到 resources/nodejs。
metrics:
  completed_date: 2026-04-26
---

# Quick Task 260426-wph Summary

Windows 版本现在会优先从 bundle resources 发现并安装内置 Node.js MSI，同时在下载失败、资源缺失或 msiexec 执行失败时返回可诊断的中文错误。

## Completed Tasks

| Task | Result | Commit |
| --- | --- | --- |
| 1 | 为 Windows Node.js 安装增加统一的 bundled MSI 候选路径扫描，覆盖 `resource_dir/nodejs`、`resource_dir/resources/nodejs` 与 `resource_dir` | `dde4e1b` |
| 2 | 统一 Windows online/full 安装失败诊断，补充 HTTP 状态、下载 URL、目标路径、msiexec 退出码与 stdout/stderr | `65a83c9` |
| 3 | 收敛 Windows full 打包契约，workflow 先校验 `assets-windows` 中 MSI 存在，再复制到 `resources/nodejs` 并打包 | `8733117` |
| 4 | 修复 release workflow 顶层 `env` 缩进导致的 YAML 语法问题，并同步本次构建产生的 `Cargo.lock` 变更 | `a2dc0a0` |

## Verification

- `cargo check --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml --lib`
- `node -e "const fs=require('fs');const y=fs.readFileSync('.github/workflows/release.yml','utf8');if(!y.includes('assets-windows')||!y.includes('resources/nodejs'))process.exit(1);" && cargo check --manifest-path src-tauri/Cargo.toml`

## Decisions Made

1. Windows runtime 只按 `.msi` 扫描 bundle 资源目录，避免版本号硬编码导致扫描契约漂移。
2. bundled 与 online 安装都通过统一 helper 输出中文诊断，便于区分下载失败、资源缺失、安装器失败。
3. workflow 在复制前显式检查 MSI 是否存在，并清理 `resources/nodejs` 下旧 `.msi`，确保 full 包资源来源唯一。
4. 执行过程中发现 workflow 文件缩进回归会让 GitHub Actions 配置失效，因此补做一次单独代码提交修复 YAML 语法并一并纳入本次 quick task。

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: `.planning/quick/260426-wph-windows-node-js-online-full-assets-windo/260426-wph-SUMMARY.md`
- FOUND: `dde4e1b`
- FOUND: `65a83c9`
- FOUND: `8733117`
- FOUND: `a2dc0a0`
