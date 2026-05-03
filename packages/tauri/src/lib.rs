// Scenario Studio Tauri 2 wrapper — entry library.
// 詳細: ../../../Documentation/ScenarioEditor/12_architecture.md §2.3,
//       ../../../Documentation/ScenarioEditor/13_roadmap.md PoC-G

mod fs_commands;

use fs_commands::FsHandles;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FsHandles::default())
        .invoke_handler(tauri::generate_handler![
            fs_commands::ss_fs_register,
            fs_commands::ss_fs_list,
            fs_commands::ss_fs_read,
            fs_commands::ss_fs_read_bytes,
            fs_commands::ss_fs_write,
            fs_commands::ss_fs_write_bytes,
            fs_commands::ss_fs_delete,
            fs_commands::ss_fs_exists,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
