# Plan: 260422-hbc-release-log

**Task:** 修复仓库缺少 release.log 文件错误处理逻辑

**Description:** 当本地仓库缺少 release.log 等文件时，按照用户要求的三种场景处理：
1. 本地目录是空的 → 直接 git clone 覆盖这个目录
2. 本地目录不存在 → 创建并 clone
3. 本地目录已经存在且是一个 git 仓库目录 → 尝试 git pull 强制覆盖，如果失败则备份并重新克隆

## Tasks

### Task 1: 修改 collect_dashboard_data 函数处理 MissingFile 和 ExistingRepo 状态

**Files:**
- `src-tauri/src/lib.rs` (第 633-680 行)

**Action:**
修改 `DirectoryState::MissingFile` 和 `DirectoryState::ExistingRepo` 的处理逻辑：
1. 如果是 `MissingFile` 或 `ExistingRepo` 状态，尝试先执行 `git pull` 恢复文件
2. 如果 `git pull` 失败，则备份目录并重新克隆
3. 如果 `git pull` 成功，记录日志并继续

**Verify:**
运行 `cargo check` 确保代码编译通过

**Done:**
- 修改后的代码已编译通过
- `DirectoryState::MissingFile` 和 `DirectoryState::ExistingRepo` 现在会尝试自动恢复
- 如果恢复失败，会备份并重新克隆