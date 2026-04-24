
## 2024-04-24 - [Tauri Backend] Avoid sys.refresh_all() and Disks recreation on interval
**Learning:** `sysinfo::System::refresh_all()` is a highly unoptimized way to poll system metrics if only partial data (like CPU/RAM) is required. Similarly, repeatedly executing `Disks::new_with_refreshed_list()` adds heavy I/O overhead. This codebase was doing both every time the frontend requested system info via the Tauri `get_system_info` command.
**Action:** Replace `sys.refresh_all()` with specific methods like `sys.refresh_cpu_usage()` and `sys.refresh_memory()`. Always cache `Disks` inside Tauri's `AppState` wrapped in a `Mutex`, and refresh it with `disks.refresh(true)` instead of recreating the struct each time.

## 2024-04-24 - [Tauri Backend] Correct Disks caching and refreshing method
**Learning:** The previous code review incorrectly assumed the `sysinfo` version was 0.30+ and expected `refresh()` or `refresh_list()` to take no arguments. The version in this repo is 0.36.1, where `Disks` exposes a `refresh(remove_not_listed_disks: bool)` method, so `disks.refresh(true)` is indeed correct for caching and updating the disks. `refresh_list()` doesn't exist on `Disks` in 0.36.1.
**Action:** Always check the installed crate version before assuming API signatures. For `sysinfo` v0.36.1, `Disks::refresh(true)` updates the cached struct accurately.
