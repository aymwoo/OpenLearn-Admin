---
phase: quick
plan: "01"
subsystem: src-tauri/src/lib.rs
tags: [git, merge-analysis, ahead-behind]
dependency_graph:
  requires: []
  provides: [git_status改进]
  affects: [git操作]
tech_stack:
  - git2 merge_analysis API
  - Rust revwalk
key_files:
  created: []
  modified:
    - src-tauri/src/lib.rs
decisions:
  - "使用 merge_analysis.is_up_to_date() 判断已更新状态"
  - "使用 merge_analysis.is_fast_forward() + count_commits_between 计算 behind"
  - "保留 graph_ahead_behind 作为 fallback 用于普通 merge 场景"
metrics:
  duration: "~5分钟"
  completed: "2026-04-21"
---

# Quick 260421-v2i: 使用 merge_analysis 改进 ahead/behind 计算

## One-liner

使用 merge_analysis 替代 graph_ahead_behind 优化分支ahead/behind计算，提供更可靠的边界情况处理

## Summary

修改 `git_status` 函数，使用 `merge_analysis` 进行分支关系分析:

1. **添加 `count_commits_between` 函数** - 计算两提交间的提交数量，使用 revwalk 遍历器
2. **改进 ahead/behind 计算** - 根据 merge_analysis 结果选择最优计算方式:
   - `is_up_to_date()` → ahead=0, behind=0
   - `is_fast_forward()` → behind = count_commits_between(本地HEAD, 远端)
   - 保留 graph_ahead_behind 作为 fallback
3. **边界情况处理** - 正确处理远端引用不存在等情况

## Changes

| File | Change |
|------|--------|
| src-tauri/src/lib.rs | 添加 count_commits_between 函数，修改 git_status 使用 merge_analysis |

## Commits

- `8ffd7e8`: fix(260421-v2i): 使用merge_analysis改进ahead/behind计算

## Verification

- [x] cargo build 成功
- [x] 无编译警告

## Deviations from Plan

**None** - plan executed exactly as written.

## Known Stubs

None