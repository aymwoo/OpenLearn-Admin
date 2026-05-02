## 2024-05-18 - Optimize system polling in Rust backend
**Learning:** Found that `sys.refresh_all()` and `Disks::new_with_refreshed_list()` were being called frequently during `get_system_info()` to gather memory and CPU usage, causing high overhead. In sysinfo v0.36.1, caching `Disks` and using specific refresh methods performs much better.
**Action:** Use `sys.refresh_cpu_usage()` and `sys.refresh_memory()` instead of `sys.refresh_all()`. Cache the `Disks` instance in `AppState` and call `disks_lock.refresh(true)` instead of recreating it.
