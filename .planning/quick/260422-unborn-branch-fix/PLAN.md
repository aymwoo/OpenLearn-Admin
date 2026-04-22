# Quick Task: 修复读取当前分支失败 (UnbornBranch)

## Problem
当 Git 仓库刚刚初始化（git init）或者克隆后处于 unborn 状态（无 commit）时，`repo.head()` 会返回 `UnbornBranch` 错误。目前的实现直接抛出该错误，导致应用无法正常显示。

## Goal
在 `get_head_branch` 中捕获 `UnbornBranch` 错误，并尝试通过读取 `HEAD` 引用的符号目标来获取分支名（例如 `master` 或 `main`）。

## Implementation
1. 修改 `src-tauri/src/lib.rs` 中的 `get_head_branch` 函数。
2. 使用 `match` 处理 `repo.head()`。
3. 如果错误码为 `git2::ErrorCode::UnbornBranch`，则查找 `HEAD` 引用。
4. 获取符号目标并去除 `refs/heads/` 前缀。

## Verification
- [x] 代码编译通过 (`cargo check`)
- [ ] (手动) 在新初始化的仓库上测试（由于当前环境限制，主要依靠静态检查和逻辑验证）
