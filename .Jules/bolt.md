
## 2024-05-19 - Use targeted sysinfo refreshes and cache Disks struct
**Learning:** Calling `sys.refresh_all()` is expensive as it polls all system metrics (processes, networks, users, etc.). Similarly, constantly recreating `Disks::new_with_refreshed_list()` does full disk layout polling every time system info is requested.
**Action:** When using the `sysinfo` crate for periodic stats polling, avoid `sys.refresh_all()`. Instead, cache both `System` and `Disks` (in `AppState` Mutexes) and selectively call `sys.refresh_cpu_usage()`/`sys.refresh_memory()` and `disks.refresh(true)` to dramatically lower overhead.
