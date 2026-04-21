---
phase: 26-quick-uxn-ahead-behind
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
autonomous: true
requirements: []
must_haves:
  truths:
    - "git_status命令返回正确的ahead/behind数值"
    - "当本地落后于远端时,behind > 0"
    - "当本地领先于远端时,ahead > 0"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      provides: "git_status函数正确计算ahead/behind"
  key_links:
    - from: "git_status函数"
      to: "graph_ahead_behind"
      via: "比较local_oid和remote_oid"
---

<objective>
修复ahead/behind计算不准确问题,当前总是显示0

Purpose: 当前git_status函数返回的ahead和behind总是0,需要调试并修复
Output: 修改后的git_status函数能正确返回ahead/behind数值
</objective>

<context>
@src-tauri/src/lib.rs

# 当前git_status函数逻辑:
# 1. fetch_branch获取远端更新
# 2. local_oid = repo.head().target()
# 3. remote_oid = find_reference("refs/remotes/origin/{branch}").target()
# 4. graph_ahead_behind(local_oid, remote_oid)
#
# 问题: 总是返回(0,0),可能原因:
# - remote_oid获取失败(返回Oid::zero)
# - fetch后需要刷新reference
# - reference路径问题
</context>

<tasks>

<task type="auto">
  <name>Task 1: 调试并修复ahead/behind计算逻辑</name>
  <files>src-tauri/src/lib.rs</files>
  <action>
修复git_status函数中的ahead/behind计算问题。

当前代码问题分析:
```rust
let branch = get_head_branch(&repo)?;
fetch_branch(&repo, &branch)?;
let local_oid = repo.head()...target()...;
let remote_oid = repo.find_reference(&format!("refs/remotes/origin/{branch}"))...target()...;
let (ahead, behind) = repo.graph_ahead_behind(local_oid, remote_oid)?;
```

可能的问题:
1. fetch后reference需要refresh才能获取最新OID
2. 需要添加调试日志确认OID值
3. 需要处理找不到reference的情况

修复方案:
1. 在fetch后调用repo.refresh()刷新内存中的refs
2. 改进remote reference查找逻辑,尝试多种路径:
   - refs/remotes/origin/{branch}
   - refs/remotes/origin/HEAD (检查远端默认分支)
3. 添加调试日志输出local_oid和remote_oid以便排查
4. 如果remote reference不存在,返回明确错误而不是0

具体修改git_status函数(约第559-623行):
- 添加调试日志记录branch名、local_oid、remote_oid
- fetch后添加repo.refresh()刷新
- 改进reference查找错误处理
</action>
  <verify>
  <automated>cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | head -30</automated>
  </verify>
  <done>
git_status函数正确返回ahead/behind数值:
- 本地落后远端时 behind > 0
- 本地领先远端时 ahead > 0
- 控制台可看到调试日志
  </done>
</task>

</tasks>

<verification>
cargo build成功,函数逻辑改进并添加调试日志
</verification>

<success_criteria>
ahead/behind能够正确计算,不再总是返回0
</success_criteria>

<output>
After completion, create .planning/quick/260421-uxn-ahead-behind/260421-uxn-SUMMARY.md
</output>
