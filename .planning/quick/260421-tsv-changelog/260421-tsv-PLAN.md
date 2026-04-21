---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - src/app/page.tsx
autonomous: true
requirements: []
user_setup: []
must_haves:
  truths:
    - 只显示远端CHANGELOG与本地CHANGELOG的差异部分(新增内容)
    - 字体大小从text-sm改为text-base
  artifacts:
    - path: src-tauri/src/lib.rs
      provides: 计算远端与本地changelog差异的函数
      min_lines: 10
    - path: src/app/page.tsx
      provides: 显示新增changelog内容,使用text-base字体
      min_lines: 5
  key_links:
    - from: src-tauri/src/lib.rs
      to: VersionDetails
      via: 新增changelogDiff字段
    - from: src/app/page.tsx
      to: VersionDetails.changelogDiff
      via: 显示差异内容
---

<objective>
优化CHANGELOG显示: 只显示远端CHANGELOG与本地CHANGELOG不同的部分(新增部分),同时加大字体尺寸为text-base
</objective>

<execution_context>
@$HOME/.config/opencode/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@src-tauri/src/lib.rs
@src/app/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: 计算changelog差异并更新前端显示</name>
  <files>src-tauri/src/lib.rs, src/app/page.tsx</files>
  <action>
1. 在 src-tauri/src/lib.rs 的 VersionDetails 结构体中添加 changelogDiff 字段(类型为 Option<String>)
2. 在 find_changelog_section 函数后添加 compute_changelog_diff(local: &str, remote: &str) -> Option<String> 函数:
   - 如果 remote 内容包含 local 内容,返回 remote 中多出的部分(新增内容)
   - 否则返回完整的 remote 内容
3. 在 collect_dashboard_data 函数中,当 local_section 和 remote_section 都存在时,调用 compute_changelog_diff 计算差异
4. 在 build_version_details 调用时传入 changelogDiff 参数
5. 在 src/app/page.tsx 中:
   - 找到显示changelog的两个article,改为只显示一个"新增版本日志"区域
   - 使用 remoteDetails?.changelogDiff 显示新增内容
   - 将字体从 text-sm 改为 text-base
   - 保留展开/收起功能
  </action>
  <verify>
    <automated>cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | head -20</automated>
  </verify>
  <done>
    - 远端与本地changelog差异只显示新增部分
    - 字体大小为text-base
    - 保留展开/收起功能
  </done>
</task>

</tasks>

<verification>
[整体验证]
- 运行 cargo build 确认 Rust 编译通过
- 前端显示优化后的changelog差异内容
</verification>

<success_criteria>
- [x] changelog只显示新增部分(远端有但本地没有的内容)
- [x] 字体大小改为text-base
- [x] 代码编译通过
</success_criteria>

<output>
After completion, create `.planning/quick/260421-tsv-changelog/260421-tsv-SUMMARY.md`
</output>
