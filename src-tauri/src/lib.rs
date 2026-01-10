// src-tauri/src/lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// 导出模块
pub mod app;
pub mod commands;
pub mod audio;
pub mod video;
pub mod utils;

// 重新导出
pub use app::run_app;
// 不要使用通配符重导出，以避免名称冲突 (e.g. get_video_info)
// 如果其他模块需要访问，可以通过 silence_cutter::commands::xxx 访问

// 主运行函数
pub fn run() -> tauri::Result<()> {
    app::run_app()
}