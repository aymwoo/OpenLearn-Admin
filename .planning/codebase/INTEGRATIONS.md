# External Integrations

**Analysis Date:** 2026-04-21

## APIs & External Services

**Source Control:**
- Generic Git remote (`origin` / user-provided clone URL) - Repository clone, fetch, status comparison, changelog inspection, and fast-forward update logic run through `src-tauri/src/lib.rs` and are configured from `src/app/settings/page.tsx`
  - SDK/Client: Rust `git2` in `src-tauri/Cargo.toml` and Tauri IPC calls from `src/lib/git.ts`
  - Auth: No env var. Credentials come from `Cred::ssh_key_from_agent(...)` or `Cred::default()` in `src-tauri/src/lib.rs`

**Fonts/CDN-backed Assets:**
- Google Fonts via `next/font/google` - Geist and Geist Mono are loaded in `src/app/layout.tsx`
  - SDK/Client: `next/font/google` from `next` in `package.json`
  - Auth: Not required

## Data Storage

**Databases:**
- Not detected in `package.json`, `src/lib/git.ts`, or `src-tauri/src/lib.rs`

**File Storage:**
- Local filesystem only - Repository files, backup copies, and version/changelog reads use `std::fs` and `std::path::Path` in `src-tauri/src/lib.rs`
- Browser local storage - Persisted user configuration is stored under `git-updater-config` in `src/lib/git.ts`

**Caching:**
- None detected beyond persisted frontend config in `localStorage` from `src/lib/git.ts`

## Authentication & Identity

**Auth Provider:**
- None - No application login, session provider, or identity SDK is present in `src/app/`, `src/lib/`, or `package.json`
  - Implementation: Desktop app relies on local usage plus Git credential resolution inside `src-tauri/src/lib.rs`

## Monitoring & Observability

**Error Tracking:**
- None - No Sentry, Bugsnag, Datadog, or similar client is detected in `package.json`, `src/`, or `src-tauri/`

**Logs:**
- Tauri log plugin in debug builds - `tauri_plugin_log::Builder` is registered in `src-tauri/src/lib.rs`
- User-facing progress updates are emitted as the `pull-progress` event from `src-tauri/src/lib.rs` and consumed by `listenPullProgress(...)` in `src/lib/git.ts`

## CI/CD & Deployment

**Hosting:**
- Desktop Tauri application - Product metadata and native window settings are defined in `src-tauri/tauri.conf.json`
- Local frontend dev server - Tauri dev mode points to `http://localhost:3000` via `beforeDevCommand` and `devUrl` in `src-tauri/tauri.conf.json`

**CI Pipeline:**
- None detected - No GitHub Actions, GitLab CI, or other pipeline configuration is present in the repository root

## Environment Configuration

**Required env vars:**
- None detected in `src/`, `src-tauri/`, `next.config.ts`, `vitest.config.ts`, or `package.json`

**Secrets location:**
- No in-repo secret file usage is detected
- Git authentication is delegated to the host machine through the SSH agent in `src-tauri/src/lib.rs`
- User runtime settings are stored locally in browser `localStorage` through `src/lib/git.ts`

## Webhooks & Callbacks

**Incoming:**
- None - No webhook endpoints, HTTP servers, or callback handlers are defined in `src/` or `src-tauri/`

**Outgoing:**
- Git network calls to the configured remote during clone/fetch/pull operations in `src-tauri/src/lib.rs`
- Font retrieval through `next/font/google` declared in `src/app/layout.tsx`

---

*Integration audit: 2026-04-21*
