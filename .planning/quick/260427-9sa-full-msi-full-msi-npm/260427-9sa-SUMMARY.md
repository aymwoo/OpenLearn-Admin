---
phase: quick
plan: "01"
subsystem: infra
tags: [refactor, windows, nodejs, linux]
requires: []
provides:
  - "清理 Linux bundled Node.js 路径中的 msiexec 死代码"
  - "简化 install_node_env 结构"
affects: [node environment installation]
tech-stack:
  added: []
  patterns: ["Windows full/online MSI 安装统一通过 install_windows_node_and_verify + ensure_windows_node_ready 收尾"]
key-files:
  created: []
  modified: [src-tauri/src/lib.rs]
key-decisions:
  - "Linux 非 Windows bundled 路径移除 msiexec 调用，只保留文件复制逻辑"
patterns-established:
  - "Full: discover_windows_bundled_node_msi → install_windows_msi → ensure_windows_node_ready"
  - "Online: download MSI → install_windows_msi → ensure_windows_node_ready"
requirements-completed: []
duration: 3min
completed: 2026-04-27
---
