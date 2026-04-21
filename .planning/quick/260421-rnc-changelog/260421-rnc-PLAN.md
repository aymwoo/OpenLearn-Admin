---
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/page.tsx
autonomous: true
requirements: []
---

<objective>
添加版本日志折叠效果，使用 textarea 展示，超过适当高度出现滚动条
</objective>

<context>
@src/app/page.tsx

当前日志展示使用 `<pre>` 标签（行 188-196），需要改为带折叠功能的 textarea
</context>

<tasks>

<task type="auto">
  <name>Task 1: 将版本日志改为带折叠的 textarea</name>
  <files>src/app/page.tsx</files>
  <action>
将本地版本日志和远端版本日志从 `<pre>` 改为可折叠的 textarea:

1. 为每个 changelog section 添加 `useState` 管理展开/折叠状态
2. 将 `<pre>` 替换为 `<textarea>`:
   - 设置 `readOnly`
   - 设置 `rows` 为折叠时显示的行数（如 6 行）
   - 设置 `className` 包含 `resize-none`（禁止拖拽调整大小）
   - 设置 `max-h-48` + `overflow-y-auto` 实现滚动条
3. 添加点击标题可展开/折叠的功能
4. 保持当前的美观样式

具体修改两个 article (行 188-196):
- 本地当前版本日志 (localDetails?.changelogSection)
- 远端最新版本日志 (remoteDetails?.changelogSection)
  </action>
  <verify>
<automated>npm run build 2>&1 | head -20</automated>
  </verify>
  <done>日志区域使用 textarea 展示，可折叠/展开，超过 12rem 高度出现滚动条</done>
</task>

</tasks>

<verification>
- [x] 使用 textarea 而非 pre
- [x] 可展开/折叠
- [x] 超过适当高度有滚动条
</verification>

<success_criteria>
日志区域变为可交互的 textarea，超过最大高度显示滚动条</success_criteria>

<output>
完成后创建 `.planning/quick/260421-rnc-changelog/260421-rnc-SUMMARY.md`
</output>
