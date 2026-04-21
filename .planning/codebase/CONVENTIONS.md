# Coding Conventions

**Analysis Date:** 2026-04-21

## Naming Patterns

**Files:**
- Use Next.js App Router page filenames for route entry points: `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/app/layout.tsx`.
- Use lowercase utility filenames for shared modules: `src/lib/git.ts`.
- Use co-located test filenames ending in `.test.tsx` next to the implementation: `src/app/page.test.tsx`, `src/app/settings/page.test.tsx`.

**Functions:**
- Use PascalCase for React component functions exported as route pages and layouts: `Dashboard` in `src/app/page.tsx`, `Settings` in `src/app/settings/page.tsx`, `RootLayout` in `src/app/layout.tsx`.
- Use camelCase for internal helpers and async workflows: `applyDashboardData`, `handlePull`, `handleSave` in `src/app/page.tsx` and `src/app/settings/page.tsx`.
- Use verb-first camelCase for exported library APIs in `src/lib/git.ts`: `loadConfig`, `saveConfig`, `getDashboardData`, `runSmartPull`, `listenPullProgress`, `getBranches`.
- Use snake_case in Rust function and field names in `src-tauri/src/lib.rs`, then rely on `#[serde(rename_all = "camelCase")]` for the frontend contract.

**Variables:**
- Use descriptive camelCase state names for UI state in `src/app/page.tsx` and `src/app/settings/page.tsx`: `localDetails`, `remoteDetails`, `loading`, `message`, `branches`.
- Use short temporary names only inside narrow async scopes: `cfg` in `src/app/page.tsx:37` and `src/app/settings/page.tsx:14`, `b` in `src/app/settings/page.tsx:76`.
- Use `next*` naming for replacement values derived in handlers: `nextProgress` in `src/app/page.tsx:65`, `nextMessage` in `src/app/page.tsx:95`.

**Types:**
- Use `interface` for shared TypeScript contracts in `src/lib/git.ts`: `GitConfig`, `RepoSyncStatus`, `VersionDetails`, `DashboardData`, `PullResult`.
- Use string-literal unions for constrained state values instead of freeform strings where possible, as in `FetchProgress.stage` in `src/lib/git.ts:42`.
- Import types inline with runtime imports using `type` specifiers, as in `src/app/page.tsx:5` and `src/app/settings/page.tsx:5`.

## Code Style

**Formatting:**
- Use ESLint as the active formatting/lint gate via `eslint.config.mjs`; no Prettier or Biome config is detected.
- Follow single quotes and semicolons in the application/client code under `src/`: `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/lib/git.ts`, `vitest.config.ts`.
- Keep the generated/default Next.js config style where it already exists with double quotes in `src/app/layout.tsx` and `next.config.ts`; do not reformat generated files unless touching them for a feature.
- Use trailing commas sparingly; current code favors multiline object literals without dangling commas in `src/app/page.tsx` and `src/lib/git.ts`.

**Linting:**
- Use the flat ESLint config in `eslint.config.mjs` with `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.
- Respect the existing ignore set in `eslint.config.mjs`: `.next/**`, `out/**`, `build/**`, `next-env.d.ts`.
- Preserve strict TypeScript settings from `tsconfig.json`, especially `strict: true`, `moduleResolution: "bundler"`, and `jsx: "react-jsx"`.

## Import Organization

**Order:**
1. Framework and third-party imports first: `next/link`, `react`, `@tauri-apps/api/*`, `vitest`, `@testing-library/react` in `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/lib/git.ts`, `src/app/page.test.tsx`.
2. Blank line.
3. Local relative imports for route-local modules and tests: `./page` in `src/app/page.test.tsx` and `src/app/settings/page.test.tsx`.
4. Use the `@/` alias for shared app code: `@/lib/git` in `src/app/page.tsx`, `src/app/settings/page.tsx`, and both test files.

**Path Aliases:**
- Use `@/*` mapped to `./src/*` from `tsconfig.json:21`.
- Match the Vitest alias in `vitest.config.ts:10` so test imports use the same `@/` paths as production code.

## Error Handling

**Patterns:**
- Wrap async actions that call Tauri commands in `try/catch` and convert unknown failures into user-facing messages, as in `src/app/page.tsx:44`, `src/app/page.tsx:85`, and `src/app/settings/page.tsx:27`.
- Use `error instanceof Error ? error.message : String(error)` when surfacing caught errors to the UI, as in `src/app/page.tsx:58`, `src/app/page.tsx:95`, and `src/app/settings/page.tsx:34`.
- Use silent fallback `.catch(() => {})` only for non-critical background hydration/subscription work, as in `src/app/page.tsx:71` and `src/app/settings/page.tsx:18`.
- In `src/lib/git.ts`, return safe fallback values for lightweight helper APIs when the UI can continue: `getRemoteStatus` returns `{ hasUpdates: false, behind: 0, branch: 'main' }`, and `getBranches` returns `['main', 'master']`.
- In `src-tauri/src/lib.rs`, propagate domain failures as `Result<_, String>` with localized messages via `map_err`, for example `open_repo`, `fetch_branch`, `read_remote_file`, and `emit_progress`.

## Logging

**Framework:** None in the TypeScript app layer; Tauri logging plugin in `src-tauri/src/lib.rs`.

**Patterns:**
- Do not add `console.log` in `src/`; no console logging is present.
- Use user-visible status text in React state (`message`, `progress.label`) instead of debug prints, as in `src/app/page.tsx` and `src/app/settings/page.tsx`.
- Backend logging is configured only through `tauri_plugin_log` during debug setup in `src-tauri/src/lib.rs:603`.

## Comments

**When to Comment:**
- Keep comments minimal. Current application code in `src/` is effectively self-documenting and contains no explanatory comments.
- Preserve necessary platform comments only when they communicate build/runtime constraints, such as the Windows subsystem note in `src-tauri/src/main.rs:1`.

**JSDoc/TSDoc:**
- Not used in `src/`; prefer expressive names and typed interfaces over docblocks.
- Rust also avoids doc comments in `src-tauri/src/lib.rs`; follow the same style unless a public API becomes non-obvious.

## Function Design

**Size:**
- Keep shared library functions focused and single-purpose in `src/lib/git.ts`; each exported function wraps one storage, event, or Tauri invoke concern.
- Route components may own moderate UI orchestration logic, but keep extracted helpers for repeated state updates, as with `applyDashboardData` in `src/app/page.tsx:26`.

**Parameters:**
- Pass typed config objects when multiple related fields travel together, as in `getDashboardData(config)` and `runSmartPull(config)` from `src/lib/git.ts`.
- Use explicit primitive parameters for simple commands: `cloneRepo(url, path, branch)`, `pullRepo(path, force)`, `getBranches(path)` in `src/lib/git.ts`.
- Keep optional defaults in the function signature rather than inside the body when the default is stable, as in `cloneRepo(..., branch: string = 'main')` and `pullRepo(..., force: boolean = false)`.

**Return Values:**
- Return typed objects instead of tuples from library APIs, as in `PullResult`, `DashboardData`, and `{ success, message }` from `src/lib/git.ts`.
- In the UI layer, prefer early returns for missing prerequisites, such as `if (!config) return;` in `src/app/page.tsx:80` and the alternate render branch in `src/app/page.tsx:107`.
- In Rust, return `Result<T, String>` from command handlers and helpers in `src-tauri/src/lib.rs`.

## Module Design

**Exports:**
- Use named exports for shared constants, interfaces, and helper functions in `src/lib/git.ts`.
- Use `export default function` only for App Router entry modules in `src/app/page.tsx`, `src/app/settings/page.tsx`, and `src/app/layout.tsx`.

**Barrel Files:**
- Not used. Import directly from the source module path, especially `@/lib/git` and relative `./page` test targets.

---

*Convention analysis: 2026-04-21*
