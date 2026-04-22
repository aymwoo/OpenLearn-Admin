# Summary: 260422-hnj-force-override

**Task:** 实现强制覆盖：备份冲突文件后用远端强制覆盖本地

**Completed:** 2026-04-22

## Changes Made

### 修改 `fast_forward` 函数

**文件:** `src-tauri/src/lib.rs`

**修改内容:**
修改 `fast_forward` 函数以支持强制覆盖：

1. 当 `force` 参数为 true 且无法 fast-forward 时，不再返回错误
2. 先备份仓库到 `conflict-backup-时间戳` 目录
3. 然后使用 `checkout_head` 强制覆盖本地文件
4. 记录日志说明备份位置

**代码逻辑:**
```rust
if !analysis.is_fast_forward() {
    if !force {
        return Err("当前仅支持 fast-forward 更新".to_string());
    }
    
    // 强制覆盖模式
    log::info!("强制覆盖模式：非 fast-forward 更新，将备份并强制覆盖");
    
    // 备份仓库
    let backup_path = format!("{}.conflict-backup-{}", repo_path.display(), timestamp);
    copy_dir_recursive(&repo_path, Path::new(&backup_path))?;
    log::info!("已备份到 {}", backup_path);
    
    // 强制覆盖
    let mut builder = CheckoutBuilder::default();
    builder.force().remove_untracked(true);
    repo.checkout_head(Some(&mut builder))?;
}
```

## Usage

调用 `fast_forward` 或 `run_smart_pull` 时传入 `force: true` 即可启用强制覆盖模式。

## Verification

运行 `cargo check` 确保代码编译通过。

## Commits

- `src-tauri/src/lib.rs`: 修改 fast_forward 函数支持强制覆盖