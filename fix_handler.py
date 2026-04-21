with open('src-tauri/src/lib.rs', 'r') as f:
    content = f.read()

content = content.replace("#[command]\nfn get_system_info", "#[tauri::command]\nfn get_system_info")

with open('src-tauri/src/lib.rs', 'w') as f:
    f.write(content)
