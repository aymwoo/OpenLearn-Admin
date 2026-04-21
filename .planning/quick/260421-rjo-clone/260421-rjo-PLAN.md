---
phase: 260421-rjo-clone
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
autonomous: true
requirements:
  - RJO-01
must_haves:
  truths:
    - "当本地路径不存在时自动克隆远程仓库"
    - "克隆后继续获取版本和更新日志信息"
  artifacts:
    - path: src-tauri/src/lib.rs
      provides: "get_dashboard_data 命令自动克隆逻辑"
      contains: "collect_dashboard_data"
  key_links:
    - from: collect_dashboard_data
      to: git_clone
      via: 自动调用克隆
      pattern: "remote_url.*clone"
---

<objective>
添加本地路径不存在时自动克隆远程仓库的逻辑到 get_dashboard_data 命令

Purpose: 当用户配置了 remote_url 但本地路径不存在时，自动克隆仓库后再获取版本信息，而不是直接报错

Output: 修改后的 lib.rs 中 get_dashboard_data 可以自动处理路径不存在的情况
</objective>

<execution_context>
@$HOME/.config/opencode/get-shit-done/workflows/execute-plan.md
@$HOME/.config/opencode/get-shit-done/templates/summary.md
</execution_context>

<context>
@src-tauri/src/lib.rs

关键代码位置:
- `GitConfig` 结构体 (lines 12-23): 包含 remote_url, local_path, branch 字段
- `collect_dashboard_data` 函数 (lines 377-436): 当前在路径不存在时直接返回错误
- `run_smart_pull` 函数 (lines 596-650): 已有类似的自动克隆逻辑可参考
</context>

<tasks>

<task type="auto">
  <name>Task 1: 添加自动克隆逻辑到 get_dashboard_data</name>
  <files>src-tauri/src/lib.rs</files>
  <action>修改 collect_dashboard_data 函数，在检查本地路径存在性之后、打开仓库之前，添加自动克隆逻辑:

1. 检查 path 是否存在且为有效的 git 仓库
2. 如果路径不存在或不是有效仓库，检查 config.remote_url 是否有值
3. 如果有 remote_url，调用 git2::build::RepoBuilder 进行克隆（参考 run_smart_pull 的克隆逻辑 lines 626-634）
4. 克隆成功后再继续原有逻辑

注意: 只在 remote_url 非空时触发自动克隆，避免无限递归</action>
  <verify>cargo check --lib 编译通过</verify>
  <done>get_dashboard_data 命令在路径不存在时会先克隆再返回版本信息</done>
</task>

</tasks>

<verification>
[Overall checks]
- cargo check --lib 编译通过
- cargo test lib 单元测试通过
</verification>

<success_criteria>
[Measurable completion]
- 当 local_path 不存在但 remote_url 有值时，自动克隆仓库
- 克隆后正确返回本地和远程版本信息
- 当 remote_url 为空时保持原有错误行为
</success_criteria>

<output>
After completion, create `.planning/quick/260421-rjo-clone/260421-rjo-SUMMARY.md`
</output>