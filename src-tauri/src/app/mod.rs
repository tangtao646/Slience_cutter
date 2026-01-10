// src-tauri/src/app/mod.rs
// 应用配置和启动

use tauri::Manager;
use std::io::{Read, Seek};

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

// 应用状态
#[derive(Default)]
pub struct AppState {
    pub ffmpeg_available: bool,
    pub processing_count: u32,
}

pub struct ExportState {
    pub is_cancelled: Arc<AtomicBool>,
}

impl Default for ExportState {
    fn default() -> Self {
        Self {
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
}

// 运行应用
pub fn run_app() -> tauri::Result<()> {
    let builder = tauri::Builder::default()
        .manage(ExportState::default())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .register_uri_scheme_protocol("video-stream", move |_app, request| {
            let uri = request.uri().to_string();
            // 改进路径解析：移除协议头和主机名，适配多种 WebKit URI 格式
            let path_part = if uri.starts_with("video-stream://localhost/") {
                &uri[25..]
            } else if uri.starts_with("video-stream://localhost") {
                &uri[24..]
            } else if uri.starts_with("video-stream:/") {
                &uri[14..]
            } else {
                &uri[13..]
            };

            let path = percent_encoding::percent_decode_str(path_part)
                .decode_utf8_lossy()
                .to_string();
            
            // 确保绝对路径格式 (macOS/Linux)
            let final_path_str = if !path.starts_with('/') && !path.contains(':') {
                format!("/{}", path)
            } else {
                path
            };

            let file_path = std::path::Path::new(&final_path_str);
            if !file_path.exists() {
                log::error!("[Video Protocol] File not found: {}", final_path_str);
                return tauri::http::Response::builder()
                    .status(tauri::http::StatusCode::NOT_FOUND)
                    .header("Access-Control-Allow-Origin", "*")
                    .body(Vec::new()).unwrap();
            }

            let mut file = match std::fs::File::open(file_path) {
                Ok(f) => f,
                Err(e) => {
                    log::error!("[Video Protocol] Open failed: {} -> {}", final_path_str, e);
                    return tauri::http::Response::builder()
                        .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new()).unwrap();
                }
            };

            let metadata = match file.metadata() {
                Ok(m) => m,
                Err(_) => {
                    return tauri::http::Response::builder()
                        .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                        .header("Access-Control-Allow-Origin", "*")
                        .body(Vec::new()).unwrap();
                }
            };
            let file_len = metadata.len();

            // 确定 Mime Type
            let ext = std::path::Path::new(&final_path_str)
                .extension()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            
            let mime_type = match ext.as_str() {
                "mp3" => "audio/mpeg",
                "wav" => "audio/wav",
                "aac" => "audio/aac",
                "m4a" => "audio/mp4",
                "webm" => "video/webm",
                "ogg" | "ogv" => "video/ogg",
                "mov" | "qt" => "video/quicktime",
                "mp4" | "m4v" => "video/mp4",
                "mkv" => "video/x-matroska",
                "avi" => "video/x-msvideo",
                _ => "application/octet-stream", // Fallback to generic binary
            };

            let range_header = request.headers().get("range");
            
            // Log request for debugging
            // log::info!("[Video Protocol] Request: {} Range: {:?}", final_path_str, range_header);

            if let Some(range) = range_header {
                if let Ok(range_str) = range.to_str() {
                    let range_str = range_str.trim();
                    if range_str.starts_with("bytes=") {
                        let range_val = &range_str["bytes=".len()..].trim();
                        
                        let (start, end) = if range_val.starts_with('-') {
                            // Suffix byte range request (e.g. bytes=-500)
                            // Used by browsers to find file metadata at the end
                            let suffix_len = range_val[1..].parse::<u64>().unwrap_or(0);
                            let start = if file_len > suffix_len { file_len - suffix_len } else { 0 };
                            (start, file_len - 1)
                        } else {
                            // Standard range request (e.g. bytes=0-100 or bytes=0-)
                            let parts: Vec<&str> = range_val.split('-').collect();
                            let s = parts[0].parse::<u64>().unwrap_or(0);
                            let e = if parts.len() > 1 && !parts[1].is_empty() {
                                parts[1].parse::<u64>().unwrap_or(file_len - 1)
                            } else {
                                file_len - 1
                            };
                            (s, e)
                        };

                        let end = std::cmp::min(end, file_len - 1);
                        if start > end {
                            return tauri::http::Response::builder()
                                .status(tauri::http::StatusCode::RANGE_NOT_SATISFIABLE)
                                .header("Content-Range", format!("bytes */{}", file_len))
                                .header("Access-Control-Allow-Origin", "*")
                                .header("Access-Control-Allow-Headers", "Range, Accept-Encoding")
                                .body(Vec::new()).unwrap();
                        }

                        let content_len = end - start + 1;
                        let max_chunk = 10 * 1024 * 1024; // 10MB chunk limit
                        let actual_len = std::cmp::min(content_len, max_chunk);
                        let actual_end = start + actual_len - 1;

                        if let Err(e) = file.seek(std::io::SeekFrom::Start(start)) {
                             log::error!("Seek failed at {}: {}", start, e);
                             return tauri::http::Response::builder()
                                .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                                .header("Access-Control-Allow-Origin", "*")
                                .body(Vec::new()).unwrap();
                        }
                        
                        let mut buffer = vec![0; actual_len as usize];
                        match file.read_exact(&mut buffer) {
                            Ok(_) => {
                                return tauri::http::Response::builder()
                                    .status(tauri::http::StatusCode::PARTIAL_CONTENT)
                                    .header("Content-Range", format!("bytes {}-{}/{}", start, actual_end, file_len))
                                    .header("Accept-Ranges", "bytes")
                                    .header("Content-Length", actual_len.to_string())
                                    .header("Content-Type", mime_type)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .header("Access-Control-Allow-Headers", "Range, Accept-Encoding")
                                    .body(buffer).unwrap();
                            },
                            Err(e) => {
                                log::error!("Read error at {}-{}: {}", start, actual_end, e);
                                return tauri::http::Response::builder()
                                    .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .body(Vec::new()).unwrap();
                            }
                        }
                    }
                }
            }

            // 无 Range 请求
            let chunk_size = std::cmp::min(file_len, 2 * 1024 * 1024); // 2MB
            let mut buffer = vec![0; chunk_size as usize];
            if let Err(e) = file.read_exact(&mut buffer) {
                 log::warn!("Initial read_exact warning: {}", e);
            }

            let end_pos = if chunk_size > 0 { chunk_size - 1 } else { 0 };

            tauri::http::Response::builder()
                .status(tauri::http::StatusCode::PARTIAL_CONTENT)
                .header("Accept-Ranges", "bytes")
                .header("Content-Range", format!("bytes 0-{}/{}", end_pos, file_len))
                .header("Content-Length", chunk_size.to_string())
                .header("Content-Type", mime_type)
                .header("Access-Control-Allow-Origin", "*")
                .header("Access-Control-Allow-Headers", "Range, Accept-Encoding")
                .body(buffer).unwrap()
        })
        .setup(|app| {
            // 初始化日志
            log::info!("Silence Cutter 正在启动...");
            
            // 检查 FFmpeg
            check_ffmpeg_availability();
            
            // 开发模式下打开开发者工具 (安全尝试)
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                } else {
                    log::warn!("无法找到主窗口以打开开发者工具");
                }
            }
            
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            crate::commands::test_connection,
            crate::commands::test_ffmpeg,
            crate::commands::get_video_info,
            crate::commands::extract_audio,
            crate::commands::detect_silences,
            crate::commands::process_video,
            crate::commands::cancel_export,
            crate::commands::start_upload,
            crate::commands::upload_chunk,
            crate::commands::finish_upload,
            crate::commands::batch_process,
        ]);
    
    builder.run(tauri::generate_context!())
}

// 检查 FFmpeg 可用性
fn check_ffmpeg_availability() {
    use std::process::Command;
    
    match Command::new("ffmpeg").arg("-version").output() {
        Ok(output) => {
            let version = String::from_utf8_lossy(&output.stdout);
            let first_line = version.lines().next().unwrap_or("未知版本");
            log::info!("FFmpeg 检测到: {}", first_line);
        }
        Err(e) => {
            log::warn!("FFmpeg 未找到: {}", e);
            log::warn!("请安装 FFmpeg: https://ffmpeg.org/download.html");
        }
    }
}