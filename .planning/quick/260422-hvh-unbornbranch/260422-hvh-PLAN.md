# Plan: 260422-hvh-unbornbranch

**Task:** 修复强制覆盖时的UnbornBranch错误

**Description:** 当使用强制覆盖模式更新时，如果本地分支不存在（UnbornBranch），会报错 "reference 'refs/heads/dev' not found"

## Tasks

### Task 1: 修改 fast_forward 函数的强制覆盖逻辑

**Files:**
- `src-tauri/src/lib.rs` (第 486-499 行)

**Action:**
修改强制覆盖模式下的分支创建逻辑：
1. 使用 match 表达式处理 find_reference 结果
2. 如果分支存在，更新目标提交
3. 如果分支不存在（UnbornBranch），使用 repo.reference() 创建分支
4. 然后设置 HEAD 并 checkout

**Verify:**
运行 `cargo check` 确保代码编译通过

**Done:**
- 使用 match 表达式正确处理 UnbornBranch 情况
- 如果分支不存在，使用 repo.reference() 创建分支
- 然后再设置 HEAD 和 checkout