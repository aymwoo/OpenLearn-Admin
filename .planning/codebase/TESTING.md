# Testing Patterns

**Analysis Date:** 2026-04-21

## Test Framework

**Runner:**
- Vitest `^3.2.4` from `package.json`.
- Config: `vitest.config.ts`.

**Assertion Library:**
- Vitest `expect` plus `@testing-library/jest-dom/vitest` from `vitest.setup.ts`.

**Run Commands:**
```bash
pnpm test                 # Run all configured frontend tests via package.json
pnpm vitest               # Watch mode / interactive local test run
pnpm vitest --coverage    # Coverage run; no dedicated script is configured
```

## Test File Organization

**Location:**
- Use co-located frontend tests beside the route component they verify: `src/app/page.test.tsx` for `src/app/page.tsx`, and `src/app/settings/page.test.tsx` for `src/app/settings/page.tsx`.
- Keep Rust unit tests inside the source module under `#[cfg(test)]`, as in `src-tauri/src/lib.rs:524`.

**Naming:**
- Use `.test.tsx` for React route tests in `src/app/`.
- Use inline `#[test]` functions with snake_case names in `src-tauri/src/lib.rs`.

**Structure:**
```
src/
└── app/
    ├── page.tsx
    ├── page.test.tsx
    └── settings/
        ├── page.tsx
        └── page.test.tsx

src-tauri/
└── src/
    └── lib.rs   # includes #[cfg(test)] mod tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import Dashboard from './page';

vi.mock('@/lib/git', () => ({
  loadConfig: vi.fn(async () => ({ /* fixture */ })),
  getDashboardData: vi.fn(async () => ({ /* fixture */ })),
}));

describe('Dashboard', () => {
  it('renders version comparison and staged progress state', async () => {
    render(<Dashboard />);
    expect(await screen.findByText('本地当前版本')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '一键抓取' }));
    await waitFor(() => {
      expect(screen.getAllByText('当前已是最新版本').length).toBeGreaterThan(0);
    });
  });
});
```

**Patterns:**
- Render the full page component directly rather than testing isolated helpers, as in `src/app/page.test.tsx:50` and `src/app/settings/page.test.tsx:30`.
- Prefer accessible queries first: `findByText`, `findByLabelText`, `getByRole`, `getByText` in both test files.
- Use `waitFor` after click/change events when state persists asynchronously, as in `src/app/page.test.tsx:58` and `src/app/settings/page.test.tsx:42`.
- Use `beforeEach` only for shared environment reset, such as `localStorage.clear()` in `src/app/settings/page.test.tsx:25`.

## Mocking

**Framework:** Vitest `vi.mock`.

**Patterns:**
```typescript
vi.mock('@/lib/git', () => ({
  DEFAULT_GIT_CONFIG: {
    remoteUrl: '',
    localPath: '',
    branch: 'main',
    forcePush: false,
    backupBeforePull: true,
    versionFilePath: 'release.log',
    changelogFilePath: 'CHANGELOG.md',
  },
  loadConfig: vi.fn(async () => null),
  saveConfig: vi.fn(async (config) => {
    localStorage.setItem('git-updater-config', JSON.stringify(config));
  }),
  getBranches: vi.fn(async () => ['main']),
  getRemoteStatus: vi.fn(async () => ({ hasUpdates: false, behind: 0, branch: 'main' })),
}));
```

**What to Mock:**
- Mock the `@/lib/git` boundary in frontend tests so page tests stay focused on UI behavior rather than Tauri command wiring, as in `src/app/page.test.tsx:6` and `src/app/settings/page.test.tsx:6`.
- Mock async return values with realistic typed objects that match `src/lib/git.ts` contracts.
- Simulate event-driven progress updates by calling the mocked callback immediately, as in `listenPullProgress` within `src/app/page.test.tsx:42`.

**What NOT to Mock:**
- Do not mock React Testing Library primitives; use real `render`, `screen`, `fireEvent`, and `waitFor`.
- Do not mock `localStorage` when jsdom already provides it; `src/app/settings/page.test.tsx` writes and reads the real test-local storage.
- Do not mock the pure Rust helper functions in `src-tauri/src/lib.rs`; the backend tests call them directly.

## Fixtures and Factories

**Test Data:**
```typescript
loadConfig: vi.fn(async () => ({
  remoteUrl: 'https://example.com/repo.git',
  localPath: '/repo',
  branch: 'main',
  forcePush: false,
  backupBeforePull: true,
  versionFilePath: 'release.log',
  changelogFilePath: 'CHANGELOG.md',
}))
```

```rust
let changelog = "2026-04-19\n升级增强\n版本号更新至 v2.0.0.2.20260419125025\n\n2026-04-18\n升级增强\n版本号更新至 v2.0.0.1.20260418111118";
let section = find_changelog_section(changelog, "v2.0.0.2.20260419125025").unwrap();
assert!(section.contains("2026-04-19"));
```

**Location:**
- Inline fixtures live inside each test file today: `src/app/page.test.tsx`, `src/app/settings/page.test.tsx`, and `src-tauri/src/lib.rs`.
- No shared fixture or factory directory is present.

## Coverage

**Requirements:** None enforced. No coverage thresholds or reporter configuration are defined in `vitest.config.ts` or `package.json`.

**View Coverage:**
```bash
pnpm vitest --coverage
```

## Test Types

**Unit Tests:**
- Rust unit tests cover pure parsing/status helpers in `src-tauri/src/lib.rs`, including `extract_version`, `find_changelog_section`, `versions_differ`, `build_repo_status`, and `build_pull_result`.

**Integration Tests:**
- Frontend tests act as lightweight component/integration tests for route pages by rendering `src/app/page.tsx` and `src/app/settings/page.tsx` with mocked data sources.
- These tests verify visible text, form defaults, button interaction, and persistence side effects.

**E2E Tests:**
- Not used. No Playwright, Cypress, or end-to-end test directory/config is detected.

## Common Patterns

**Async Testing:**
```typescript
render(<Settings />);

const versionInput = await screen.findByLabelText('版本文件路径');
fireEvent.change(versionInput, { target: { value: 'custom/release.log' } });
fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

await waitFor(() => {
  const stored = localStorage.getItem('git-updater-config');
  expect(stored).toContain('custom/release.log');
});
```

**Error Testing:**
```rust
#[test]
fn skips_update_when_versions_match() {
    assert!(!versions_differ("v2", "v2"));
}
```
- Direct frontend error-path tests are not present in `src/app/page.test.tsx` or `src/app/settings/page.test.tsx`; add new tests by mocking rejected `@/lib/git` calls and asserting the rendered `message` text.

---

*Testing analysis: 2026-04-21*
