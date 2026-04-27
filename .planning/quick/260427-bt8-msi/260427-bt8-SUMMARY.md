---
phase: quick
plan: "01"
subsystem: infra
tags: [windows, nodejs, install, online]
requires: []
provides:
  - "在线版不再提示 bundled MSI 缺失，直接去下载"
affects: [node.js installation]
key-files:
  modified: [src-tauri/src/lib.rs]
duration: 5min
completed: 2026-04-27
---
