// src-tauri/src/utils/sidecar.rs
use tauri::Manager;

pub fn get_sidecar_path(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    // 根据系统架构返回对应的 triple
    // 这里只列出常见的，如果需要支持更多可以扩展
    let triple = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        _ => return Err(format!("不支持的平台: {} {}", std::env::consts::OS, std::env::consts::ARCH)),
    };
    
    let mut filename = format!("{}-{}", name, triple);
    if std::env::consts::OS == "windows" {
        filename.push_str(".exe");
    }
    
    // Tauri 在开发模式和打包模式下 sidecar 位置不同
    // 我们尝试在 Resource 目录下寻找
    let path = app.path()
        .resolve(format!("binaries/{}", filename), tauri::path::BaseDirectory::Resource)
        .map_err(|e| format!("解析 sidecar 路径失败: {}", e))?;
    
    if !path.exists() {
        // 如果资源目录里没有，尝试在 src-tauri/binaries 目录（开发环境）
        let dev_path = app.path()
            .app_log_dir().unwrap() // 只是为了拿到一个基础路径
            .parent().unwrap() // logs
            .parent().unwrap() // app context
            .join("binaries").join(&filename);
            
        // 实际上在 Tauri v2 开发模式，它会被链接到特定目录
        // 但最稳妥的办法是：如果 resolve 失败，回退到全局命令，并警告用户
        println!("⚠️ Sidecar 路径不存在: {:?}", path);
        return Err("Sidecar not found".to_string());
    }

    Ok(path.to_string_lossy().to_string())
}
