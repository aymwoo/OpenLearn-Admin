# Codebase Structure

**Analysis Date:** 2026-04-21

## Directory Layout

```text
openlearnadmin/
├── src/                    # Next.js frontend source
│   ├── app/                # App Router routes, layout, styles, route tests
│   └── lib/                # Shared frontend service wrappers for Tauri IPC
├── src-tauri/              # Native Tauri desktop application and Rust backend
│   ├── src/                # Rust entrypoints and command implementation
│   ├── capabilities/       # Tauri capability definitions
│   ├── gen/                # Generated Tauri schemas
│   ├── icons/              # Desktop app icons
│   └── target/             # Rust build output (excluded from TS config)
├── public/                 # Static assets served by Next.js
├── docs/                   # Project docs and superpowers artifacts
├── .planning/codebase/     # Generated codebase mapping documents
├── package.json            # Frontend and workspace scripts
├── next.config.ts          # Next.js runtime config
├── tsconfig.json           # TypeScript compiler config and path alias
├── eslint.config.mjs       # ESLint flat config
├── vitest.config.ts        # Vitest config
└── vitest.setup.ts         # Test environment setup
```

## Directory Purposes

**`src/app/`:**
- Purpose: Hold App Router routes and route-scoped UI code.
- Contains: `layout.tsx`, `globals.css`, route files such as `page.tsx`, nested route folders such as `settings/`, and route tests such as `page.test.tsx`
- Key files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/settings/page.tsx`

**`src/lib/`:**
- Purpose: Hold shared frontend helpers that should be imported from multiple routes.
- Contains: Tauri bridge code and shared TypeScript interfaces
- Key files: `src/lib/git.ts`

**`src-tauri/src/`:**
- Purpose: Hold Rust source for the desktop backend.
- Contains: Native entrypoints, Tauri command registration, Git/domain logic, Rust tests
- Key files: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`

**`src-tauri/capabilities/`:**
- Purpose: Define Tauri capability manifests.
- Contains: Permission files
- Key files: `src-tauri/capabilities/default.json`

**`src-tauri/gen/`:**
- Purpose: Store generated Tauri schemas referenced by capability files.
- Contains: JSON schema files under `src-tauri/gen/schemas/`
- Key files: `src-tauri/gen/schemas/desktop-schema.json`, `src-tauri/gen/schemas/capabilities.json`

**`public/`:**
- Purpose: Store public web assets.
- Contains: SVG assets created by the starter app
- Key files: `public/next.svg`, `public/vercel.svg`

**`docs/superpowers/`:**
- Purpose: Store planning/spec artifacts outside executable app code.
- Contains: `plans/` and `specs/`
- Key files: `docs/superpowers/plans/2026-04-21-gitless-release-fetch-implementation.md`, `docs/superpowers/specs/2026-04-21-gitless-release-fetch-design.md`

**`.planning/codebase/`:**
- Purpose: Store generated architecture and codebase reference docs for downstream agents.
- Contains: Mapping documents such as `ARCHITECTURE.md` and `STRUCTURE.md`
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Global App Router shell
- `src/app/page.tsx`: Dashboard route at `/`
- `src/app/settings/page.tsx`: Settings route at `/settings`
- `src-tauri/src/main.rs`: Native desktop binary entry
- `src-tauri/src/lib.rs`: Tauri builder and native command registration

**Configuration:**
- `package.json`: npm scripts and JS dependencies
- `next.config.ts`: Next.js config with `reactCompiler`
- `tsconfig.json`: strict TS options and `@/*` alias to `src/*`
- `eslint.config.mjs`: ESLint flat configuration for Next.js + TypeScript
- `vitest.config.ts`: Vitest runner configuration
- `src-tauri/tauri.conf.json`: Desktop window/build config
- `src-tauri/Cargo.toml`: Rust dependencies and crate metadata
- `src-tauri/capabilities/default.json`: Tauri capability manifest

**Core Logic:**
- `src/lib/git.ts`: Frontend API surface for all Git-related actions
- `src-tauri/src/lib.rs`: Git operations, changelog parsing, backup, pull orchestration

**Testing:**
- `src/app/page.test.tsx`: Dashboard route behavior tests
- `src/app/settings/page.test.tsx`: Settings route behavior tests
- `src-tauri/src/lib.rs`: Inline Rust unit tests for parsing and result helpers

## Naming Conventions

**Files:**
- App Router route files use framework names: `page.tsx`, `layout.tsx`, `page.test.tsx`
- Shared frontend modules use short lowercase names by concern: `src/lib/git.ts`
- Rust source uses canonical crate filenames: `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Config files follow tool defaults: `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`

**Directories:**
- Route directories are lowercase and match URL segments: `src/app/settings/`
- Shared code directories are lowercase by responsibility: `src/lib/`
- Native project directories follow Tauri defaults: `src-tauri/src/`, `src-tauri/capabilities/`, `src-tauri/gen/`

## Where to Add New Code

**New Feature:**
- Primary code: Add a new route folder under `src/app/` when the feature needs a new screen, or extend `src/app/page.tsx` / `src/app/settings/page.tsx` when it belongs to an existing screen.
- Tests: Add route tests next to the route file, following `src/app/page.test.tsx` and `src/app/settings/page.test.tsx`.

**New Component/Module:**
- Implementation: If the code is route-specific, place it under that route directory in `src/app/`; if it is a shared frontend bridge/helper, place it under `src/lib/`.

**Utilities:**
- Shared helpers: Use `src/lib/` for TypeScript helpers reused by multiple routes.
- Native/backend helpers: Keep Rust-side helpers in `src-tauri/src/lib.rs` unless the backend is intentionally split into more modules.

## Special Directories

**`src-tauri/target/`:**
- Purpose: Rust compilation output
- Generated: Yes
- Committed: No

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No

**`.worktrees/`:**
- Purpose: Git worktree data for alternate checkout states
- Generated: Yes
- Committed: No

**`src-tauri/gen/`:**
- Purpose: Generated Tauri schemas used by capabilities
- Generated: Yes
- Committed: Yes

**`public/`:**
- Purpose: Static assets served directly by Next.js
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-04-21*
