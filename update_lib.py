import re

with open('src-tauri/src/lib.rs', 'r') as f:
    content = f.read()

# Add struct and command
system_info_code = """
use std::sync::Mutex;
use sysinfo::{System, Disks};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemInfo {
    uptime: u64,
    cpu_usage: f32,
    memory_total: u64,
    memory_used: u64,
    disk_total: u64,
    disk_available: u64,
}

#[command]
fn get_system_info(state: tauri::State<'_, Mutex<System>>) -> Result<SystemInfo, String> {
    let mut sys = state.lock().map_err(|e| format!("锁错误: {}", e))?;
    sys.refresh_all();

    let disks = Disks::new_with_refreshed_list();
    let mut disk_total = 0;
    let mut disk_available = 0;
    for disk in disks.list() {
        disk_total += disk.total_space();
        disk_available += disk.available_space();
    }

    Ok(SystemInfo {
        uptime: System::uptime(),
        cpu_usage: sys.global_cpu_usage(),
        memory_total: sys.total_memory(),
        memory_used: sys.used_memory(),
        disk_total,
        disk_available,
    })
}
"""

if "struct SystemInfo" not in content:
    content = content.replace("use serde::{Deserialize, Serialize};", "use serde::{Deserialize, Serialize};\n" + system_info_code)

# Add to generate_handler
if "get_system_info" not in content:
    content = re.sub(
        r'run_smart_pull,\s*\]\)',
        r'run_smart_pull,\n            get_system_info,\n        ])',
        content
    )

# Add to setup
if "manage(Mutex::new(System::new_all()))" not in content:
    content = content.replace(
        "tauri::Builder::default()",
        "tauri::Builder::default()\n        .manage(Mutex::new(System::new_all()))"
    )

with open('src-tauri/src/lib.rs', 'w') as f:
    f.write(content)
