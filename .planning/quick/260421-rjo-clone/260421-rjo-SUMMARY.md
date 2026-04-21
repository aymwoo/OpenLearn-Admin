---
phase: 260421-rjo-clone
plan: "01"
type: execute
wave: 1
subsystem: src-tauri
tags: [git, auto-clone, dashboard]
dependency_graph:
  requires: []
  provides:
    - RJO-01: get_dashboard_data auto-clone capability
  affects:
    - collect_dashboard_data function
tech_stack:
  added: []
  patterns:
    - "Auto-clone fallback when local path invalid"
key_files:
  created: []
  modified:
    - src-tauri/src/lib.rs
decisions:
  - "Auto-clone triggered only when remote_url is configured"
  - "Existing non-git directories are backed up before clone"
key_links:
  - from: collect_dashboard_data
    to: git_clone
    via: RepoBuilder.clone()
    pattern: "git2::build::RepoBuilder"
---

# Phase 260421-rjo-clone Plan 01: 自动克隆仓库 Summary

One-liner: **添加本地路径不存在时自动克隆远程仓库的逻辑到 get_dashboard_data 命令**

## Task Results

| # | Task | Status | Commit | Verified |
|---|------|--------|--------|-----------|
| 1 | 添加自动克隆逻辑到 get_dashboard_data | ✅ Complete | 241e134 | cargo check + cargo test --lib passed |

## Implementation

### Task 1: 添加自动克隆逻辑到 get_dashboard_data

**Files modified:** `src-tauri/src/lib.rs`

**Change:** Modified `collect_dashboard_data` function to auto-clone when local path doesn't exist or is not a valid git repo:

1. Check if path exists and is a valid git repo
2. If not valid, check if `config.remote_url` has a value
3. If remote_url is empty, return error: "本地仓库路径不存在且未配置 remote_url"
4. If remote_url exists, backup existing non-git directory if needed
5. Use `git2::build::RepoBuilder` with proper branch and fetch options
6. Clone and continue with the rest of the logic

This follows the same pattern as `run_smart_pull` (lines 626-634).

## Verification

- ✅ `cargo check --lib` compiles without errors
- ✅ `cargo test --lib` passes 7 tests
- ✅ Auto-clone only triggers when remote_url is non-empty
- ✅ Maintains original error when remote_url is empty

## Deviations from Plan

**None** - plan executed exactly as written.

## Auth Gates

**None** - no authentication required.

## Self-Check: PASSED

- ✅ Files exist: src-tauri/src/lib.rs
- ✅ Commit exists: 241e134
- ✅ All verification commands pass