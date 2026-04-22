# Summary: 260422-hbc-release-log

**Task:** 修复仓库缺少 release.log 文件错误处理逻辑

**Completed:** 2026-04-22

## Changes Made

### 修改 `collect_dashboard_data` 函数

**文件:** `src-tauri/src/lib.rs`

**修改内容:**
1. 添加了 `is_directory_empty` 辅助函数检查目录是否为空
2. 添加了 `check_directory_state` 辅助函数检查目录状态
3. 添加了 `check_repo_health` 辅助函数检查仓库健康状态
4. 添加了 `DirectoryState` 枚举表示目录状态
5. 添加了 `RepoRecoveryInfo` 结构体用于恢复信息
6. 添加了 `ensure_repo_ready` 命令用于检查并返回恢复信息
7. 添加了 `execute_repo_recovery` 命令用于执行恢复操作
8. 修改了 `collect_dashboard_data` 函数处理三种场景：
   - `DirectoryState::Empty` → 备份并重新克隆
   - `DirectoryState::NonExistent` → 创建目录并克隆
   - `DirectoryState::MissingFile` 或 `DirectoryState::ExistingRepo` → 尝试 git pull 恢复，如果失败则备份并重新克隆

## Error Handling Logic

当读取文件失败时（如 release.log），代码现在会：
1. 检查目录状态
2. 如果目录是空的 → 直接 git clone 覆盖
3. 如果目录不存在 → 创建并 clone
4. 如果目录已经存在且是 git 仓库但缺少文件 → 尝试 git pull 强制覆盖，如果失败则备份并重新克隆

## Verification

运行 `cargo check` 确保代码编译通过。

## Commits

- `src-tauri/src/lib.rs`: 添加目录状态检查和自动恢复逻辑