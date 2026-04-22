# Plan: 260422-hnj-force-override

**Task:** 实现强制覆盖：备份冲突文件后用远端强制覆盖本地

**Description:** 当远端有更新但本地有冲突（无法 fast-forward）时，先备份冲突文件，然后用远端强制覆盖本地

## Tasks

### Task 1: 修改 fast_forward 函数支持强制覆盖

**Files:**
- `src-tauri/src/lib.rs` (第 454-519 行)

**Action:**
修改 `fast_forward` 函数：
1. 当 `force` 参数为 true 且无法 fast-forward 时，不返回错误
2. 先备份仓库到 `conflict-backup-时间戳` 目录
3. 然后使用 `force()` 和 `remove_untracked(true)` 强制覆盖本地文件
4. 记录日志说明备份位置

**Verify:**
运行 `cargo check` 确保代码编译通过

**Done:**
- `force=true` 且无法 fast-forward 时，备份并强制覆盖
- 备份路径格式：`仓库路径.conflict-backup-YYYY-MM-DDThh-mm-ss`
- 使用 `checkout_head` 强制覆盖本地文件