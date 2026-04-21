---
phase: quick
plan: 01
subsystem: src-tauri
tags: [tauri, graphics, gbm, linux]
---

# Quick Task 260421-r1p: GBM Buffer Workaround Summary

**One-liner:** Added GBM buffer workarounds for Tauri Linux to handle GPU/display issues

## Context

The original error "Failed to create GBM buffer of size 900x650: Invalid argument" was a **Tauri webview graphics issue**, not a git2 buffer problem. GBM (Graphics Buffer Manager) is the Linux graphics subsystem used for buffer management in webview.

## Solution

Added environment workarounds for headless/no-GPU Linux environments:

1. **`LIBGL_ALWAYS_SOFTWARE=1`**: Force software rendering when GPU unavailable
2. **`WEBKIT_DISABLE_COMPOSITING_MODE=1`**: Disable GPU composition in WebKit

## Key Files Modified

| File | Change |
|------|--------|
| `src-tauri/tauri.conf.json` | Added `withGlobalTauri: true` for better debugging |
| `src-tauri/src/lib.rs` | Added `setup_graphics_workarounds()` function |
| `src-tauri/Cargo.toml` | Added `tauri-plugin-shell` dependency |

## Commit

`d8adcd6` - fix(quick-260421-r1p): add GBM buffer workarounds for Tauri Linux

## Verification

- [x] cargo check passes

## Notes for Testing

To test in environment with GBM issues:
1. Run the Tauri app - the GBM error should be resolved
2. If still failing, check if running in a virtual display (Xvfb) without proper GPU
3. May need to set display explicitly: `export DISPLAY=:99` (if using Xvfb)

## Threat Flags

None - graphics workarounds are defensive configuration only.