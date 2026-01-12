// src-tauri/src/commands/system.rs
// 系统相关命令

use serde::{Deserialize, Serialize};
use std::process::Command;

// 系统信息响应
#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub app_name: String,
    pub app_version: String,
    pub rust_version: String,
    pub os: String,
    pub ffmpeg_available: bool,
    pub ffmpeg_version: Option<String>,
    pub timestamp: String,
}

// 测试连接
#[tauri::command]
pub fn test_connection(state: tauri::State<'_, crate::app::AppState>) -> Result<SystemInfo, String> {
    let ffmpeg_path = state.ffmpeg_path.as_ref().map(|p| p.to_string_lossy().to_string());
    let ffmpeg_info = check_ffmpeg(ffmpeg_path);
    
    Ok(SystemInfo {
        app_name: "Silence Cutter".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        rust_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        ffmpeg_available: ffmpeg_info.available,
        ffmpeg_version: ffmpeg_info.version,
        timestamp: chrono::Local::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        let path = std::path::Path::new(&path);
        let folder = path.parent().unwrap_or_else(|| std::path::Path::new("."));
        Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// 检查 FFmpeg
#[tauri::command]
pub fn test_ffmpeg(state: tauri::State<'_, crate::app::AppState>) -> Result<FfmpegInfo, String> {
    let ffmpeg_path = state.ffmpeg_path.as_ref().map(|p| p.to_string_lossy().to_string());
    let info = check_ffmpeg(ffmpeg_path);
    Ok(info)
}

// FFmpeg 信息
#[derive(Debug, Serialize, Deserialize)]
pub struct FfmpegInfo {
    pub available: bool,
    pub version: Option<String>,
    pub path: Option<String>,
    pub message: String,
}

fn check_ffmpeg(ffmpeg_path: Option<String>) -> FfmpegInfo {
    let path_to_run = ffmpeg_path.clone().unwrap_or_else(|| "ffmpeg".to_string());
    
    // 执行 ffmpeg 命令
    match Command::new(&path_to_run).arg("-version").output() {
        Ok(output) => {
            let output_str = String::from_utf8_lossy(&output.stdout);
            let first_line = output_str.lines().next().unwrap_or("");
            let version = extract_ffmpeg_version(first_line);
            
            FfmpegInfo {
                available: true,
                version,
                path: ffmpeg_path,
                message: format!("FFmpeg 可用: {}", first_line),
            }
        }
        Err(e) => {
            let message = match e.kind() {
                std::io::ErrorKind::NotFound => "FFmpeg 未安装，请先安装 FFmpeg".to_string(),
                _ => format!("FFmpeg 检查失败: {}", e),
            };
            
            FfmpegInfo {
                available: false,
                version: None,
                path: ffmpeg_path,
                message,
            }
        }
    }
}

// 提取 FFmpeg 版本号
fn extract_ffmpeg_version(line: &str) -> Option<String> {
    if line.starts_with("ffmpeg version") {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            // 格式: ffmpeg version N.N.N
            let version = parts[2];
            if version.chars().next().map_or(false, |c| c.is_numeric()) {
                return Some(version.to_string());
            }
        }
    }
    None
}