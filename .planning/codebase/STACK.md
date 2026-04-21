# Technology Stack

**Analysis Date:** 2026-04-21

## Languages

**Primary:**
- TypeScript 5.x - Frontend application code and project configuration in `src/app/page.tsx`, `src/app/settings/page.tsx`, `src/lib/git.ts`, `next.config.ts`, and `vitest.config.ts`
- Rust 1.77.2+ - Tauri desktop backend, Git operations, and native command layer in `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`, and `src-tauri/Cargo.toml`

**Secondary:**
- CSS - Global styling and Tailwind CSS v4 entrypoint in `src/app/globals.css`
- JSON/TOML - Runtime and build configuration in `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `package.json`, and `src-tauri/Cargo.toml`

## Runtime

**Environment:**
- Node.js - Required for `next dev`, `next build`, `next start`, and `vitest run` defined in `package.json`
- Tauri 2 desktop runtime - Native shell configured in `src-tauri/tauri.conf.json` and bootstrapped from `src-tauri/src/main.rs`
- Rust toolchain 1.77.2+ - Pinned by `rust-version = "1.77.2"` in `src-tauri/Cargo.toml`

**Package Manager:**
- pnpm - Implied by `pnpm-lock.yaml` and `beforeDevCommand: "pnpm dev"` in `src-tauri/tauri.conf.json`
- Cargo - Rust dependency management in `src-tauri/Cargo.toml`
- Lockfile: present in `pnpm-lock.yaml`

## Frameworks

**Core:**
- Next.js 16.2.4 - React application framework and App Router host in `package.json`, `src/app/layout.tsx`, `src/app/page.tsx`, and `src/app/settings/page.tsx`
- React 19.2.4 - Client UI rendering in `package.json`, `src/app/page.tsx`, and `src/app/settings/page.tsx`
- Tauri 2.10.x - Desktop container and frontend/backend IPC in `package.json`, `src/lib/git.ts`, and `src-tauri/src/lib.rs`

**Testing:**
- Vitest 3.2.4 - Test runner configured in `package.json` and `vitest.config.ts`
- Testing Library React 16.3.0 - Component testing support in `package.json` and `vitest.setup.ts`
- jest-dom 6.9.1 - DOM assertions loaded from `vitest.setup.ts`

**Build/Dev:**
- Tailwind CSS 4 - Utility CSS pipeline imported in `src/app/globals.css` and installed in `package.json`
- PostCSS with `@tailwindcss/postcss` - CSS build integration in `postcss.config.mjs`
- ESLint 9 with `eslint-config-next` - Linting in `eslint.config.mjs`
- React Compiler - Enabled by `reactCompiler: true` in `next.config.ts` and `babel-plugin-react-compiler` in `package.json`
- `tauri-build` 2.5.6 - Native build integration in `src-tauri/build.rs` and `src-tauri/Cargo.toml`

## Key Dependencies

**Critical:**
- `next` 16.2.4 - Frontend framework and routing surface for everything under `src/app/`
- `react` 19.2.4 and `react-dom` 19.2.4 - Rendering runtime for `src/app/page.tsx` and `src/app/settings/page.tsx`
- `@tauri-apps/api` ^2.10.1 - Frontend bridge used by `src/lib/git.ts` to call Rust commands and listen for native events
- `tauri` 2.10.3 - Native desktop host used by `src-tauri/src/lib.rs`
- `git2` 0.20 with `vendored-libgit2` and `vendored-openssl` - Git clone/fetch/status/fast-forward logic in `src-tauri/src/lib.rs`

**Infrastructure:**
- `tauri-plugin-log` 2 - Debug logging plugin initialized in `src-tauri/src/lib.rs`
- `chrono` 0.4 - Timestamp formatting for backup names and fetch metadata in `src-tauri/src/lib.rs`
- `serde` / `serde_json` 1.0 - Rust command payload serialization in `src-tauri/src/lib.rs`
- `typescript` ^5 - Type checking and path alias support in `tsconfig.json`

## Configuration

**Environment:**
- Runtime app settings are stored in browser `localStorage` under the `git-updater-config` key in `src/lib/git.ts`
- No `.env` files are present at the repository root, and no `process.env`, `import.meta.env`, or `std::env::var(...)` usage is detected in `src/` or `src-tauri/`
- User-provided runtime inputs are `remoteUrl`, `localPath`, `branch`, `versionFilePath`, and `changelogFilePath` from `src/app/settings/page.tsx` and `src/lib/git.ts`

**Build:**
- TypeScript options and `@/*` path alias are defined in `tsconfig.json`
- Next.js behavior is configured in `next.config.ts`
- CSS processing is configured in `postcss.config.mjs` and `src/app/globals.css`
- Lint rules are configured in `eslint.config.mjs`
- Test environment is configured in `vitest.config.ts` and `vitest.setup.ts`
- Tauri build/runtime settings are configured in `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/Cargo.toml`, and `src-tauri/capabilities/default.json`

## Platform Requirements

**Development:**
- Node.js with pnpm is required to run scripts from `package.json`
- Rust 1.77.2+ is required by `src-tauri/Cargo.toml`
- Tauri CLI is installed as a dev dependency in `package.json` for desktop development
- A local web server at `http://localhost:3000` is expected by `src-tauri/tauri.conf.json` during `tauri dev`

**Production:**
- Desktop Tauri application bundle with a native window configured in `src-tauri/tauri.conf.json`
- Git access to a user-specified repository path and remote is required by `src-tauri/src/lib.rs`

---

*Stack analysis: 2026-04-21*
