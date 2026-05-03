// Tauri 2 OS バイナリのエントリ。Windows GUI アプリとしてコンソールを開かない。
// 実装本体は lib.rs::run() に集約。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    scenario_studio_tauri_lib::run();
}
