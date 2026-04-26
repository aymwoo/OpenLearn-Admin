---
phase: quick
plan: "01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src-tauri/src/lib.rs
  - src/lib/git.ts
autonomous: true
must_haves:
  truths:
    - "使用 Gitee HTTPS 地址时，clone/fetch 不再因为空认证重放而报 too many redirects 或 authentication replays"
    - "SSH 仓库认证与现有进度事件保持可用，不因本次修复退化"
    - "失败时界面/命令返回可执行的中文提示，而不是原始 libgit2 重定向报错"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      contains: "shared HTTPS credential handling"
    - path: "src/lib/git.ts"
      contains: "user-facing git error mapping for redirect/auth replay"
  key_links:
    - from: "src-tauri/src/lib.rs"
      to: "git_clone / fetch_branch / git_status"
      via: "shared remote callback or error-normalization helper"
    - from: "src/lib/git.ts"
      to: "dashboard / sync UI"
      via: "propagated error message"
---

# Quick Task 260426-ihi Plan

## Goal

修复 Rust `git2` 在使用 Gitee HTTPS 远程地址时出现
`too many redirects or authentication replays` 的问题，避免空认证/重复认证导致
clone、fetch、状态检查失败，同时不破坏现有 SSH、进度条、取消同步与
`web.config` 相关逻辑。

## Context

- `src-tauri/src/lib.rs` 当前在多个 `credentials` callback 中对
  `USER_PASS_PLAINTEXT` 直接传入空密码、对 `DEFAULT` 直接兜底，这很可能让
  Gitee HTTPS 场景进入 libgit2 的重复认证/重定向循环。
- 现有未提交改动已存在于 `src-tauri/src/lib.rs`、`src/app/page.tsx`、
  `src/components/GlobalProgress.tsx`、`src/lib/git.ts`；执行时必须基于当前工作树
  做最小改动，尤其是 `lib.rs` 只能在认证/错误映射附近精确合并，禁止覆盖无关
  进度、取消、`web.config` 暂存恢复等新逻辑。
- 优先把修复限制在 Rust backend；只有在前端需要把底层错误翻译成用户可执行提示时，
  才最小化修改 `src/lib/git.ts`。本 quick plan 不改 `src/app/page.tsx` 和
  `src/components/GlobalProgress.tsx`。

## Tasks

### Task 1
- files: `src-tauri/src/lib.rs`
- action: 抽取并统一远端认证处理，供 `remote_callbacks()`、`create_progress_fetch_options()`、以及 `git_status` 内联 fetch 复用。保留 SSH URL 的现有 `ssh_key_from_agent` 路径；对 `http://`/`https://` 尤其是 `gitee.com` 远端，禁止继续返回空的 `Cred::userpass_plaintext(..., "")`，也不要在无明确可用凭据时反复回退到会触发认证重放的默认分支。改为一次性返回明确错误，提示用户改用已配置凭据的 HTTPS/PAT 或 SSH 地址。仅在确认当前回调拿到可用用户名/凭据来源时才尝试 HTTP 认证。实现时只修改认证与错误封装相邻代码，保留现有 `RemoteRedirect::Initial`、进度事件、取消检查与克隆/拉取主流程。
- verify: `cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo check --manifest-path src-tauri/Cargo.toml`
- done: `git_clone`、`fetch_branch`、`run_smart_pull`、`git_status` 共享同一套 HTTPS 认证策略；Gitee HTTPS 不再走空密码/重复认证分支；Rust 编译与库测试通过。

### Task 2
- files: `src-tauri/src/lib.rs`, `src/lib/git.ts`
- action: 统一包装 clone/fetch/status 失败信息，把 libgit2 原始 `too many redirects` / `authentication replays` 文案转换为中文可执行提示，例如“Gitee HTTPS 认证被拒绝，请改用 SSH 地址或为 HTTPS 配置可用凭据/PAT”。若 Rust 已能直接返回稳定中文错误，则 `src/lib/git.ts` 只做最小透传；不要改动页面组件。确保现有“空文件夹/不是有效 Git 仓库/路径不存在/正在被其他操作”这些前端容错分支不被破坏。
- verify: `cargo check --manifest-path src-tauri/Cargo.toml && pnpm exec tsc --noEmit`
- done: 同类底层错误在 UI/调用层看到统一中文提示；现有 TypeScript 类型检查通过；未引入对 `page.tsx`、`GlobalProgress.tsx` 的无关改动。

### Task 3
- files: `src-tauri/src/lib.rs`
- action: 在本地用最小回归方式检查三条路径：Gitee HTTPS clone/fetch 报错路径、SSH 路径、非认证相关进度路径。若仓库里已有合适测试入口则复用；若没有，不新增大体量集成测试，只通过编译和已有库测试验证，并在实现备注中记录“为何不增加网络集成测试”。执行时注意不要整理或重写 `lib.rs` 大段代码，避免与当前未提交改动冲突。
- verify: `cargo test --manifest-path src-tauri/Cargo.toml --lib && cargo check --manifest-path src-tauri/Cargo.toml`
- done: 修复范围被限制在认证/报错链路，SSH 与进度逻辑无回归信号，且工作树中无对无关文件的意外回退。

## Success criteria

- Gitee HTTPS 远端不再因空认证重放进入 `too many redirects or authentication replays`。
- 失败时返回明确中文指引，告诉用户改用 SSH 或配置 HTTPS 凭据/PAT。
- `src-tauri/src/lib.rs` 的现有未提交逻辑被保留，前端无无关改动。

## Output

After completion, create `.planning/quick/260426-ihi-rust-git2-gitee-https-too-many-redirects/260426-ihi-SUMMARY.md`
