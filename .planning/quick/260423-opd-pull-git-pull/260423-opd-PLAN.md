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
    - "User sees real percentage during clone (e.g., 'Receiving objects: 45% (123/456)')"
    - "User sees real percentage during pull/fetch (e.g., 'Receiving objects: 78%')"
  artifacts:
    - path: "src-tauri/src/lib.rs"
      contains: "transfer_progress callback"
      min_lines: 30
    - path: "src/lib/git.ts"
      contains: "TransferProgress interface"
  key_links:
    - from: "RemoteCallbacks"
      to: "FetchProgress event"
      via: "transfer_progress + window.emit"
---

<objective>
Add real git-like transfer progress to clone and pull operations, showing actual bytes/objects received percentage like real git commands.
</objective>

<context>
@src-tauri/src/lib.rs
@src/lib/git.ts
@src/app/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add transfer_progress callback to Rust backend</name>
  <files>src-tauri/src/lib.rs</files>
  <action>
1. Modify `remote_callbacks()` function to add transfer_progress callback that calculates real percentage
2. Add helper to compute percentage: `(received_objects * 100) / total_objects.max(1)` or fallback to total bytes
3. The callback receives `git2::TransferProgress` with fields: `total_objects`, `received_objects`, `indexed_objects`, `total_deltas`, `indexed_deltas`, `received_bytes`
4. Use `window.emit()` to send real-time progress with calculated percentage
5. Keep backward compatibility: if callback is None (old Tauri version), fall back to stage-based progress

IMPORTANT: The transfer_progress callback runs in a different thread. Need to use Arc<Window> or similar for cross-thread communication with Tauri's window.
  </action>
  <verify>
  <automated>cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -20</automated>
  </verify>
  <done>
- `remote_callbacks()` now includes transfer_progress handler
- Progress events emit real percentage during clone/fetch
- No compilation errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Update Frontend FetchProgress type if needed</name>
  <files>src/lib/git.ts</files>
  <action>
Optional: If needing to pass additional transfer data (like received_bytes, speed), extend FetchProgress interface. For now, the existing `percent` field is sufficient - it will receive the real percentage from backend.
  </action>
  <verify>
  <automated>grep -q "percent" src/lib/git.ts && echo "OK: percent field exists"</automated>
  </verify>
  <done>
- FetchProgress.percent receives real transfer percentage
- Frontend displays actual progress like real git commands
  </done>
</task>

</tasks>

<verification>
After completing both tasks:
1. Run the app and trigger a clone operation
2. Observe progress shows real percentage (not just 10% → 50% → 100%)
3. Example expected: "Receiving objects: 45% (123/456), 1.2 MiB"
</verification>

<success_criteria>
- During clone: progress.percent shows 0-100% based on actual objects received
- During fetch/pull: progress.percent shows transfer progress
- Falls back gracefully if transfer_progress not available
</success_criteria>

<output>
After completion, create `.planning/quick/260423-opd-pull-git-pull/260423-opd-SUMMARY.md`
</output>