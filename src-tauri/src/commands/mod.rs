// src-tauri/src/commands/mod.rs
// Tauri 命令处理器

mod system;
mod video_processing;
mod upload;

// 重新导出命令
pub use system::*;
pub use video_processing::*;
pub use upload::*;