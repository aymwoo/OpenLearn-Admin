# Codebase Concerns

**Analysis Date:** 2026-04-21

## Tech Debt

**Monolithic native Git service:**
- Issue: Git commands, changelog parsing, backup logic, progress events, and Tauri command registration all live in one file, which makes behavior hard to isolate and change safely.
- Files: `src-tauri/src/lib.rs`
- Impact: Small changes in pull, backup, version parsing, or event emission can regress unrelated flows because the same module owns all responsibilities.
- Fix approach: Split `src-tauri/src/lib.rs` into focused modules such as repository access, version parsing, backup, and Tauri command adapters; keep command functions thin.

**Configuration model contains an unused remote URL:**
- Issue: `GitConfig.remoteUrl` is collected in the UI and stored in `localStorage`, but the Rust backend marks `remote_url` as dead code and dashboard/pull flows only operate on the existing local repo origin.
- Files: `src/app/settings/page.tsx`, `src/app/page.tsx`, `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Impact: The settings screen suggests that changing the remote URL affects updates, but the running pull flow ignores it; operators can believe they repointed a repo when they did not.
- Fix approach: Either wire `remoteUrl` into clone/origin-management commands in `src-tauri/src/lib.rs`, or remove the field from `src/app/settings/page.tsx` and `src/lib/git.ts` until it is functional.

**Silent fallback hides backend failures:**
- Issue: Frontend and bridge helpers swallow errors and replace them with defaults (`catch {}` and fallback values) instead of surfacing the real failure.
- Files: `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/lib/git.ts`
- Impact: Auth failures, invalid repositories, missing branches, and event-listener failures can appear as “no updates”, default branches, or no feedback at all.
- Fix approach: Return typed error states from `src/lib/git.ts`, show explicit UI messages in `src/app/page.tsx` and `src/app/settings/page.tsx`, and reserve fallback defaults for confirmed empty states only.

**Bootstrap metadata and docs remain scaffold-level:**
- Issue: App metadata and README still reflect the default template rather than the actual Git update desktop app.
- Files: `src/app/layout.tsx`, `README.md`
- Impact: Packaging, browser metadata, onboarding, and operational setup guidance are misleading for maintainers and users.
- Fix approach: Replace template metadata in `src/app/layout.tsx` and document the real setup, Tauri workflow, and repository requirements in `README.md`.

## Known Bugs

**Corrupt saved config can crash page initialization:**
- Symptoms: If `git-updater-config` in `localStorage` contains invalid JSON, `loadConfig()` throws during mount and both pages fail before rendering recovery UI.
- Files: `src/lib/git.ts`, `src/app/page.tsx`, `src/app/settings/page.tsx`
- Trigger: Invalid or manually edited `localStorage` content for `git-updater-config`.
- Workaround: Clear `localStorage` manually before reopening the app.

**Progress listener can leak after component unmount:**
- Symptoms: `listenPullProgress()` resolves asynchronously; if the dashboard unmounts before `unlisten` is assigned, cleanup runs without removing the listener.
- Files: `src/app/page.tsx`, `src/lib/git.ts`
- Trigger: Navigate away from `src/app/page.tsx` quickly while the event listener promise is still resolving.
- Workaround: None in code; reopening the page recreates the listener state.

**HTTPS remote configuration does not match credential handling:**
- Symptoms: The UI placeholder encourages `https://github.com/user/repo.git`, but native fetch credentials rely on `Cred::ssh_key_from_agent` or `Cred::default`, which is brittle for authenticated HTTPS remotes.
- Files: `src/app/settings/page.tsx`, `src-tauri/src/lib.rs`
- Trigger: Use a private HTTPS remote that requires username/password or token-based auth.
- Workaround: Use an SSH remote with an available SSH agent, or rely on public repositories.

**Force update mode can remove untracked local files:**
- Symptoms: Enabling force mode can delete untracked files during checkout because `remove_untracked(true)` is enabled when `forcePush` is set.
- Files: `src/app/settings/page.tsx`, `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Trigger: Turn on “强制用远端覆盖本地冲突” and run a pull against a repo with local untracked files.
- Workaround: Keep `backupBeforePull` enabled and avoid force mode unless the repo is disposable.

## Security Considerations

**Mutable localStorage drives native filesystem operations:**
- Risk: Repository path, branch, and destructive flags are loaded from `localStorage` and passed directly into Tauri commands that open repositories, copy directories, fetch remotes, and update working trees.
- Files: `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Current mitigation: `ensure_config()` in `src-tauri/src/lib.rs` only checks for empty strings and the UI defaults `backupBeforePull` to true.
- Recommendations: Validate path existence and repository boundaries in `src-tauri/src/lib.rs`, reject unsafe paths, and store trusted config in a Tauri-side store instead of browser `localStorage`.

**Destructive checkout path is one toggle away:**
- Risk: `fast_forward()` combines force checkout with untracked-file removal, so a mistaken toggle can delete local data.
- Files: `src/app/settings/page.tsx`, `src-tauri/src/lib.rs`
- Current mitigation: The toggle is off by default in `src/lib/git.ts`, and backup is enabled by default.
- Recommendations: Add a confirmation step in `src/app/settings/page.tsx`, require a fresh backup before destructive pulls, and log exactly what will be removed.

**No explicit audit trail for native Git actions:**
- Risk: Pull, backup, fetch, and checkout failures are mostly surfaced as user-facing strings with no durable history for investigation.
- Files: `src/app/page.tsx`, `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Current mitigation: `tauri-plugin-log` is enabled only in debug builds inside `src-tauri/src/lib.rs`.
- Recommendations: Emit structured logs in release builds for pull start/end/failure events and include repo path, branch, and operation outcome without exposing secrets.

## Performance Bottlenecks

**Full repository copy for every backup:**
- Problem: Backup mode recursively copies the whole repository tree before pull, including `.git` and any large working-tree artifacts.
- Files: `src-tauri/src/lib.rs`
- Cause: `backup_repo_dir()` calls `copy_dir_recursive()` with no exclude list or incremental strategy.
- Improvement path: Exclude heavy/generated directories, support snapshot/compressed backups, or back up only the files that can be modified by the update flow.

**Dashboard load always performs a network fetch:**
- Problem: Opening the dashboard triggers `get_dashboard_data`, which fetches from `origin` before rendering current version data.
- Files: `src/app/page.tsx`, `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Cause: `collect_dashboard_data()` always calls `fetch_branch()` before reading local and remote version files.
- Improvement path: Separate cached local state from explicit remote refresh, and let the UI control when a network fetch happens.

**Remote changelog reads pull full file contents into memory:**
- Problem: Both dashboard and smart-pull flows read entire local and remote version/changelog files even when only one section is displayed.
- Files: `src-tauri/src/lib.rs`
- Cause: `read_worktree_file()`, `read_remote_file()`, `split_sections()`, and `find_changelog_section()` operate on full-file strings.
- Improvement path: Stream or bound file size, and stop parsing once the target section is found.

## Fragile Areas

**Version and changelog parsing depend on one text format:**
- Files: `src-tauri/src/lib.rs`
- Why fragile: `extract_version()` assumes the first non-empty line is the version, and `split_sections()` assumes changelog sections start with a `YYYY-` date line.
- Safe modification: Change parsing rules only alongside fixture-based tests that cover alternate release-log and changelog formats.
- Test coverage: Only narrow unit tests in `src-tauri/src/lib.rs` cover happy-path parsing; malformed, large, and multi-format files are not covered.

**Dashboard success/error state is derived from string matching:**
- Files: `src/app/page.tsx`, `src/app/settings/page.tsx`
- Why fragile: UI color and success semantics depend on whether `message.includes('最新版本')`, `message.includes('成功')`, or `message.includes('已保存')`.
- Safe modification: Replace string inspection with explicit status enums returned by `src/lib/git.ts` and rendered in the page components.
- Test coverage: `src/app/page.test.tsx` and `src/app/settings/page.test.tsx` cover only one success path each and do not lock down failure-state rendering.

**Branch handling depends on repository shape:**
- Files: `src/app/settings/page.tsx`, `src/lib/git.ts`, `src-tauri/src/lib.rs`
- Why fragile: `getBranches()` falls back to `['main', 'master']` on any error, while the native branch listing mixes repository branch enumeration with light string cleanup.
- Safe modification: Return structured branch data from `src-tauri/src/lib.rs`, distinguish local vs remote branches, and fail visibly when branch discovery breaks.
- Test coverage: No tests cover branch discovery, invalid repos, detached HEAD, or repositories without `main`/`master`.

## Scaling Limits

**Repository size and changelog size scale linearly with user wait time:**
- Current capacity: Not measured in code; every backup and changelog read scales with repository/file size.
- Limit: Large repos and large changelog files make `copy_dir_recursive()` and full-file parsing increasingly slow in `src-tauri/src/lib.rs`.
- Scaling path: Add size limits, background jobs, streaming reads, and incremental backups before targeting large production repositories.

## Dependencies at Risk

**`git2` native dependency surface:**
- Risk: `git2` with `vendored-libgit2` and `vendored-openssl` increases native build complexity and platform-specific failure modes for the desktop app.
- Impact: Build, packaging, or runtime Git behavior can fail outside the currently exercised development environment.
- Migration plan: Isolate Git operations behind a smaller service boundary in `src-tauri/src/lib.rs` so the app can move to system Git or a dedicated worker if native issues grow.

## Missing Critical Features

**No repo onboarding flow despite clone command existing:**
- Problem: The UI requires an existing local repository path, while `git_clone` exists only in the native layer and is not exposed anywhere in `src/app`.
- Blocks: First-run setup for users who only have a remote URL and no prepared local checkout.

**No validation or recovery flow for invalid repository paths:**
- Problem: `ensure_config()` checks only empty strings, and the UI has no guided repair path for missing folders, non-Git directories, or permission errors.
- Blocks: Reliable self-service recovery when users misconfigure `localPath` in `src/app/settings/page.tsx`.

## Test Coverage Gaps

**Native Git command workflows are largely untested:**
- What's not tested: `git_clone`, `git_pull`, `git_status`, `git_branches`, `git_backup`, `get_dashboard_data`, and `run_smart_pull` command behavior against real repositories.
- Files: `src-tauri/src/lib.rs`
- Risk: Auth, filesystem, branch, backup, and fast-forward regressions can ship unnoticed.
- Priority: High

**Failure handling in the UI is mostly untested:**
- What's not tested: Invalid config JSON, listener setup failure, native invoke rejection, branch-loading failure, and destructive-toggle warnings.
- Files: `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/lib/git.ts`, `src/app/page.test.tsx`, `src/app/settings/page.test.tsx`
- Risk: The app can fail silently or show misleading success states without automated detection.
- Priority: High

**Large-file and destructive-path behavior is not covered:**
- What's not tested: Backup cost, untracked-file deletion in force mode, malformed changelog formats, and large changelog/version files.
- Files: `src-tauri/src/lib.rs`
- Risk: Data-loss and performance regressions remain invisible until exercised on real repositories.
- Priority: High

---

*Concerns audit: 2026-04-21*
