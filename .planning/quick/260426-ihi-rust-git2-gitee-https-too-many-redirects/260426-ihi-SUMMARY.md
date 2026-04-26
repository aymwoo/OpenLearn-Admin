---
phase: quick
plan: "01"
subsystem: git
tags: [rust, git2, tauri, gitee, https, auth, typescript]
requires: []
provides:
  - 统一的 git2 HTTPS 认证回调，避免 Gitee 空认证重放
  - clone/fetch/status 的中文可执行错误提示
  - 轻量回归测试覆盖 Gitee HTTPS 与 SSH 路径
affects: [dashboard, sync-ui, tauri-backend]
tech-stack:
  added: []
  patterns: [shared remote callback, git error normalization, credential helper fallback]
key-files:
  created: []
  modified: [src-tauri/src/lib.rs, src/lib/git.ts, src/lib/git.test.ts]
key-decisions:
  - "HTTPS 远端只在 credential helper 能提供真实凭据时才尝试 USER_PASS_PLAINTEXT，不再回放空密码"
  - "将 too many redirects / authentication replays 统一归一化为中文可执行提示，并保持 SSH agent 路径不变"
patterns-established:
  - "Shared git auth helper: clone、fetch、status 复用同一套 Rust 认证与错误归一化逻辑"
  - "UI error mapping: 前端对关键 libgit2 认证重放错误做最小兜底映射"
requirements-completed: []
duration: 14min
completed: 2026-04-26
---

# Phase quick Plan 01: 260426-ihi Summary

**git2 统一 HTTPS 凭据解析与错误归一化，修复 Gitee 重定向/认证重放并保留 SSH 与进度链路。**

## Performance

- **Duration:** 14 min
- **Started:** 2026-04-26T05:24:11Z
- **Completed:** 2026-04-26T05:38:10Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- 在 `src-tauri/src/lib.rs` 抽取共享远端认证逻辑，统一服务于 clone、fetch、status。
- 禁止 Gitee/HTTPS 在无真实凭据时走空密码或默认重放分支，失败时返回中文可执行提示。
- 在 `src/lib/git.ts` 与 `src/lib/git.test.ts` 补齐最小前端错误映射与回归测试，保证调用层看到稳定中文提示。

## Task Commits

Each task was committed atomically:

1. **Task 1: 统一后端 HTTPS 认证策略** - `c41dfc1` (fix)
2. **Task 2: 统一前端错误提示透传** - `c326cdd` (fix)
3. **Task 3: 增加轻量回归覆盖** - `26b243e` (test)

## Files Created/Modified

- `src-tauri/src/lib.rs` - 新增共享认证/错误归一化 helper，复用到 clone、fetch、status，并补充 Rust 回归测试。
- `src/lib/git.ts` - 将 redirect/auth replay 错误映射为统一中文提示，同时保留既有“空文件夹/请先克隆/不是有效仓库”等前端容错分支。
- `src/lib/git.test.ts` - 增加 UI 调用层错误映射测试，并修复阻塞 `tsc` 的括号缺失问题。

## Decisions Made

- 对 SSH 远端继续优先走 `ssh_key_from_agent` / `Cred::username`，避免本次修复影响既有 SSH 使用方式。
- 对 HTTPS 远端改为优先尝试 `git2::Cred::credential_helper` 读取本机已配置凭据；若没有可用凭据则一次性返回明确错误，不再触发 libgit2 认证重放。
- 不新增真实网络集成测试：当前 quick task 目标是最小修复，仓库内也没有可稳定复用的离线 Git 服务器夹具，因此采用 Rust 单测 + 现有编译检查作为本地回归手段。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 修复 `src/lib/git.test.ts` 语法缺失以恢复 TypeScript 校验**
- **Found during:** Task 2
- **Issue:** `pnpm exec tsc --noEmit` 被同模块测试文件缺失闭合括号阻塞，无法验证本次 `src/lib/git.ts` 改动。
- **Fix:** 最小补齐测试文件括号，并顺手增加 Gitee HTTPS 错误映射用例。
- **Files modified:** `src/lib/git.test.ts`
- **Verification:** `pnpm exec tsc --noEmit`、`pnpm exec vitest run src/lib/git.test.ts`
- **Committed in:** `c326cdd`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** 仅修复直接阻塞本次校验的问题，无额外范围扩张。

## Issues Encountered

- `pnpm exec tsc --noEmit` 首次执行失败，原因不是本次逻辑本身，而是 `src/lib/git.test.ts` 已存在未闭合结构；修复后校验通过。

## Next Phase Readiness

- Gitee HTTPS 失败提示已稳定，后续若要支持交互式 PAT 输入，可在当前 shared callback 基础上继续扩展。
- 当前未改动 `src/app/page.tsx` 与 `src/components/GlobalProgress.tsx` 的用户在制改动，工作树可继续基于现状推进。

## Self-Check: PASSED

- FOUND: `.planning/quick/260426-ihi-rust-git2-gitee-https-too-many-redirects/260426-ihi-SUMMARY.md`
- FOUND: `c41dfc1`
- FOUND: `c326cdd`
- FOUND: `26b243e`
