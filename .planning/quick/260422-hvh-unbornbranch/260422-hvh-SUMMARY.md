# Summary: 260422-hvh-unbornbranch

**Task:** 修复强制覆盖时的UnbornBranch错误

**Completed:** 2026-04-22

## Changes Made

### 修改 `fast_forward` 函数的强制覆盖逻辑

**文件:** `src-tauri/src/lib.rs`

**问题:**
当使用强制覆盖模式更新时，如果本地分支不存在（UnbornBranch），代码尝试使用 `find_reference` 查找分支，但如果返回错误（分支不存在），代码仍然尝试 `set_head` 设置分支头，导致报错：
"reference 'refs/heads/dev' not found; class=Reference (4); code=UnbornBranch (-9)"

**修改内容:**
修改强制覆盖模式下的分支创建逻辑，使用 match 表达式处理 `find_reference` 结果：
1. 如果分支存在，使用 `set_target` 更新目标提交
2. 如果分支不存在（UnbornBranch），使用 `repo.reference()` 创建分支
3. 然后再设置 HEAD 和 checkout

**修改前:**
```rust
let reference_name = format!("refs/heads/{branch}");
if let Ok(mut reference) = repo.find_reference(&reference_name) {
    reference.set_target(target_oid, "force override").map_err(|e| format!("更新本地分支失败: {e}"))?;
}
repo.set_head(&reference_name).map_err(|e| format!("切换分支头失败: {e}"))?;
```

**修改后:**
```rust
let reference_name = format!("refs/heads/{branch}");
match repo.find_reference(&reference_name) {
    Ok(mut reference) => {
        reference.set_target(target_oid, "force override").map_err(|e| format!("更新本地分支失败: {e}"))?;
    }
    Err(_) => {
        repo.reference(&reference_name, target_oid, true, "create local branch")
            .map_err(|e| format!("创建本地分支失败: {e}"))?;
    }
}
repo.set_head(&reference_name).map_err(|e| format!("切换分支头失败: {e}"))?;
```

## Verification

运行 `cargo check` 确保代码编译通过。

## Commits

- `src-tauri/src/lib.rs`: 修复强制覆盖时的 UnbornBranch 错误