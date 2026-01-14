// src-tauri/src/app/mod.rs
// 应用配置和启动

use tauri::Manager;
use std::io::{Read, Seek};

use std::sync::atomic::{AtomicBool};
use std::sync::Arc;

// 应用状态
#[derive(Default)]
pub struct AppState {
    pub ffmpeg_available: bool,
    pub ffmpeg_path: Option<std::path::PathBuf>,
    pub ffprobe_path: Option<std::path::PathBuf>,
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            log::info!("Silence Cutter 正在启动...");

            // 获取 sidecar 路径
            let mut ffmpeg_path = crate::utils::sidecar::get_sidecar_path(app.handle(), "ffmpeg").ok();
            let mut ffprobe_path = crate::utils::sidecar::get_sidecar_path(app.handle(), "ffprobe").ok();
            let mut is_sidecar = ffmpeg_path.is_some();
            
            // 如果 sidecar 不存在，尝试查找系统全局的
            if ffmpeg_path.is_none() {
                println!("⚠️ 未找到 ffmpeg sidecar，尝试寻找系统全局 ffmpeg...");
                if let Ok(p) = which::which("ffmpeg") {
                    ffmpeg_path = Some(p.to_string_lossy().to_string());
                }
            }
            if ffprobe_path.is_none() {
                println!("⚠️ 未找到 ffprobe sidecar，尝试寻找系统全局 ffprobe...");
                if let Ok(p) = which::which("ffprobe") {
                    ffprobe_path = Some(p.to_string_lossy().to_string());
                }
            }

            let ffmpeg_available = ffmpeg_path.is_some() && ffprobe_path.is_some();
            
            if ffmpeg_available {
                println!("🚀 FFmpeg 路径: {:?}", ffmpeg_path);
                println!("🚀 FFprobe 路径: {:?}", ffprobe_path);
                if is_sidecar {
                    log::info!("✅ [Sidecar] 模式启动: {:?}", ffmpeg_path);
                } else {
                    log::info!("ℹ️ [System] 模式启动 (使用全局 FFmpeg): {:?}", ffmpeg_path);
                }
            } else {
                println!("❌ 错误: 未找到 FFmpeg/FFprobe！");
                log::error!("❌ 未找到任何 FFmpeg/FFprobe！应用功能将受限。");
            }

            app.manage(AppState {
                ffmpeg_available,
                ffmpeg_path: ffmpeg_path.map(std::path::PathBuf::from),
                ffprobe_path: ffprobe_path.map(std::path::PathBuf::from),
                processing_count: 0,
            });

            // 开发模式下打开开发者工具
            #[cfg(debug_assertions)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            
            Ok(())
        })
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
                                .body(Vec::new()).unwrap();
                        }

                        let max_chunk = 5 * 1024 * 1024; // 5MB safe chunk
                        let content_len = end - start + 1;
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
                                    .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                                    .header("Access-Control-Allow-Headers", "Range, Accept-Encoding")
                                    .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                                    .body(buffer).unwrap();
                            },
                            Err(e) => {
                                log::error!("Read error at {}-{}: {}", start, end, e);
                                return tauri::http::Response::builder()
                                    .status(tauri::http::StatusCode::INTERNAL_SERVER_ERROR)
                                    .header("Access-Control-Allow-Origin", "*")
                                    .body(Vec::new()).unwrap();
                            }
                        }
                    }
                }
            }

            // 无 Range 请求：返回第一个 chunk 的 206 Partial Content
            // 这对 WebKit 非常重要，它如果第一次请求没拿到数据且状态码不是 206，可能会直接报错
            let chunk_size = std::cmp::min(file_len, 2 * 1024 * 1024); // 2MB start chunk
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
                .header("Access-Control-Allow-Methods", "GET, OPTIONS")
                .header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
                .body(buffer).unwrap()
        })
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
            crate::commands::reveal_in_explorer,
        ]);
    
    builder.run(tauri::generate_context!())
}

