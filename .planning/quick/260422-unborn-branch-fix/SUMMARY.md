---
status: complete
---

# Summary: 修复读取当前分支失败 (UnbornBranch)

## Changes
- 修改了 `src-tauri/src/lib.rs` 中的 `get_head_branch` 函数，增加了对 `UnbornBranch` 错误的处理。
- 当处于 unborn 状态时，现在会尝试从 `HEAD` 符号引用中提取预期的分支名，而不是直接报错。

## Impact
提升了应用对新初始化 Git 仓库的兼容性，避免了因无提交记录而导致的崩溃或报错。
