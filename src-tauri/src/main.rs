// src-tauri/src/main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    silence_cutter::run()
        .expect("Silence Cutter 启动失败");
}