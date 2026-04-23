## 2024-10-24 - System polling overhead in `get_system_info`
**Learning:** `sysinfo::System::refresh_all()` is expensive as it queries many unused stats (e.g., processes, networks, components) taking ~8-10ms. Re-instantiating `sysinfo::Disks::new_with_refreshed_list()` is also costly (re-queries all disks).
**Action:** Selectively call `refresh_cpu_usage()` and `refresh_memory()` (< 100µs overhead), and maintain a cached `Mutex<Disks>` that is refreshed via `disks.refresh(true)` instead of recreating it. This drastically reduces the overhead of periodic system polling in Tauri applications.
