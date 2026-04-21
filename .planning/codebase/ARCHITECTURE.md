# Architecture

**Analysis Date:** 2026-04-21

## Pattern Overview

**Overall:** Thin Next.js App Router frontend over a Tauri command backend

**Key Characteristics:**
- UI routes in `src/app/` are client components that orchestrate local state and user actions.
- Browser-side service code in `src/lib/git.ts` acts as the single bridge from React to native Tauri commands.
- Native Git, filesystem, changelog parsing, backup, and progress emission logic is centralized in `src-tauri/src/lib.rs`.

## Layers

**App Shell / Route Layer:**
- Purpose: Define the desktop UI shell and route entry points.
- Location: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/settings/page.tsx`
- Contains: Root layout, dashboard screen, settings screen, route-local rendering logic
- Depends on: `next`, `react`, `next/link`, `@/lib/git`, `src/app/globals.css`
- Used by: Next.js App Router runtime started from `next.config.ts` and Tauri `devUrl` in `src-tauri/tauri.conf.json`

**Frontend Service / Bridge Layer:**
- Purpose: Hide Tauri IPC details behind typed TypeScript helpers.
- Location: `src/lib/git.ts`
- Contains: Shared interfaces (`GitConfig`, `DashboardData`, `PullResult`, `FetchProgress`) and wrappers around `invoke()` / `listen()`
- Depends on: `@tauri-apps/api/core`, `@tauri-apps/api/event`
- Used by: `src/app/page.tsx`, `src/app/settings/page.tsx`, related tests in `src/app/*.test.tsx`

**Native Command Layer:**
- Purpose: Expose backend operations to the frontend as Tauri commands.
- Location: `src-tauri/src/lib.rs`
- Contains: `#[command]` handlers such as `get_dashboard_data`, `run_smart_pull`, `git_status`, `git_branches`, `git_backup`
- Depends on: Internal helper functions in `src-tauri/src/lib.rs`, Tauri builder setup in `src-tauri/src/lib.rs`
- Used by: `src/lib/git.ts` through `invoke()` calls

**Domain / Repository Logic Layer:**
- Purpose: Implement repository inspection, remote fetch, fast-forward pull, changelog parsing, and backup behavior.
- Location: `src-tauri/src/lib.rs`
- Contains: Helpers such as `ensure_config`, `fetch_branch`, `read_remote_file`, `find_changelog_section`, `fast_forward`, `collect_dashboard_data`
- Depends on: `git2`, `chrono`, `std::fs`, `std::path::Path`
- Used by: Tauri commands in `src-tauri/src/lib.rs`

**Desktop Bootstrap Layer:**
- Purpose: Start the native host, wire the web UI to the desktop window, and register permissions/plugins.
- Location: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`
- Contains: Rust entry point, Tauri builder, log plugin setup, window metadata, default capability definition
- Depends on: `tauri`, `tauri-build`, generated schema files in `src-tauri/gen/schemas/`
- Used by: `pnpm tauri` from `package.json`

## Data Flow

**Dashboard Hydration Flow:**

1. `src/app/page.tsx` loads persisted config with `loadConfig()` from `src/lib/git.ts`.
2. `src/lib/git.ts` reads `localStorage` under the `git-updater-config` key and returns a merged `GitConfig` object.
3. `src/app/page.tsx` calls `getDashboardData(config)` from `src/lib/git.ts`.
4. `src/lib/git.ts` invokes the Tauri command `get_dashboard_data`.
5. `src-tauri/src/lib.rs` validates config, fetches `origin/{branch}`, reads local and remote files, derives versions/changelog sections, and returns `DashboardData`.
6. `src/app/page.tsx` stores `status`, `localDetails`, and `remoteDetails` in component state and renders the dashboard cards.

**Settings Save Flow:**

1. `src/app/settings/page.tsx` initializes form state from `DEFAULT_GIT_CONFIG` in `src/lib/git.ts`.
2. On mount, `loadConfig()` rehydrates saved settings from browser `localStorage`.
3. When a local path exists, `src/app/settings/page.tsx` calls `getBranches(localPath)` from `src/lib/git.ts`.
4. `src/lib/git.ts` invokes `git_branches`, which enumerates repository branches in `src-tauri/src/lib.rs`.
5. On save, `saveConfig(config)` persists settings in `localStorage`, then `getRemoteStatus(localPath)` optionally validates the repository via the native backend.

**Smart Pull Flow:**

1. `src/app/page.tsx` calls `runSmartPull(config)` from `src/lib/git.ts` when the user clicks the pull button.
2. `src/app/page.tsx` also subscribes to `pull-progress` using `listenPullProgress()` from `src/lib/git.ts`.
3. `src/lib/git.ts` forwards the request to the `run_smart_pull` Tauri command.
4. `src-tauri/src/lib.rs` emits progress stages with `emit_progress()`, fetches remote refs, compares versions, optionally backs up the repo, and performs a fast-forward checkout.
5. The `pull-progress` event updates `progress` state in `src/app/page.tsx`.
6. After the command returns `PullResult`, `src/app/page.tsx` refreshes dashboard data by calling `getDashboardData(config)` again.

**State Management:**
- Route-local React state in `src/app/page.tsx` and `src/app/settings/page.tsx` handles UI state.
- Persistent user configuration is stored in browser `localStorage` by `src/lib/git.ts`.
- Repository truth is recomputed on demand in `src-tauri/src/lib.rs`; there is no shared client-side cache layer.

## Key Abstractions

**GitConfig:**
- Purpose: Single configuration contract for repo URL, local path, branch, force mode, backup mode, version file, and changelog file.
- Examples: `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Pattern: Shared shape across TypeScript and Rust with camelCase on the frontend and `#[serde(rename_all = "camelCase")]` on the backend.

**DashboardData / RepoSyncStatus / VersionDetails:**
- Purpose: Represent the read model rendered on the dashboard.
- Examples: `src/lib/git.ts`, `src/app/page.tsx`, `src-tauri/src/lib.rs`
- Pattern: Backend assembles a complete view model so the React page remains mostly presentational.

**PullResult / FetchProgress:**
- Purpose: Represent long-running update outcomes and incremental progress.
- Examples: `src/lib/git.ts`, `src/app/page.tsx`, `src-tauri/src/lib.rs`
- Pattern: Request-response via Tauri command plus side-channel event streaming via `pull-progress`.

**Single Native Module:**
- Purpose: Keep all command registration and Git logic in one Rust module.
- Examples: `src-tauri/src/lib.rs`
- Pattern: Monolithic backend module instead of separate domain/service/command files.

## Entry Points

**Next.js Root Layout:**
- Location: `src/app/layout.tsx`
- Triggers: Automatically loaded by App Router for all routes
- Responsibilities: Define HTML/body shell, load fonts, import global CSS, export metadata

**Dashboard Route:**
- Location: `src/app/page.tsx`
- Triggers: `/` route in the App Router
- Responsibilities: Load saved config, fetch version comparison data, subscribe to pull progress, run smart pull, render status/changelog UI

**Settings Route:**
- Location: `src/app/settings/page.tsx`
- Triggers: `/settings` route in the App Router
- Responsibilities: Edit config fields, persist config, probe branch list, validate local repo status

**Desktop Runtime Entry:**
- Location: `src-tauri/src/main.rs`
- Triggers: Native desktop process start
- Responsibilities: Forward startup to `app_lib::run()`

**Tauri Builder Entry:**
- Location: `src-tauri/src/lib.rs`
- Triggers: Called from `src-tauri/src/main.rs`
- Responsibilities: Register commands, install log plugin in debug, run generated Tauri context

**Tauri Build Hook:**
- Location: `src-tauri/build.rs`
- Triggers: Cargo build for the Tauri app
- Responsibilities: Run `tauri_build::build()`

## Error Handling

**Strategy:** String-based error propagation from Rust to the UI

**Patterns:**
- Backend helpers in `src-tauri/src/lib.rs` return `Result<_, String>` and translate library failures into user-readable Chinese messages.
- Frontend callers in `src/app/page.tsx` and `src/app/settings/page.tsx` catch thrown errors and map them into the `message` state.
- Wrapper helpers in `src/lib/git.ts` sometimes swallow backend failures and return safe defaults, such as `getBranches()` and `getRemoteStatus()`.
- Progress failures are surfaced through `runSmartPull()` exceptions and by setting `progress.stage` to `error` in `src/app/page.tsx`.

## Cross-Cutting Concerns

**Logging:** Debug-only native logging is installed through `tauri_plugin_log` in `src-tauri/src/lib.rs`; the React layer does not define a separate logging abstraction.

**Validation:** Required config validation is centralized in `ensure_config()` inside `src-tauri/src/lib.rs`; the settings page in `src/app/settings/page.tsx` does not enforce a richer schema client-side.

**Authentication:** Git remote authentication is delegated to libgit2 credential callbacks in `remote_callbacks()` inside `src-tauri/src/lib.rs`, preferring SSH agent credentials and falling back to default credentials.

---

*Architecture analysis: 2026-04-21*
