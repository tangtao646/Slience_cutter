// src-tauri/src/utils/sidecar.rs
use tauri::Manager;

pub fn get_sidecar_path(app: &tauri::AppHandle, name: &str) -> Result<String, String> {
    // 1. 获取当前平台的 Triple 后缀
    let triple = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos", "aarch64") => "aarch64-apple-darwin",
        ("macos", "x86_64") => "x86_64-apple-darwin",
        ("windows", "x86_64") => "x86_64-pc-windows-msvc",
        ("linux", "x86_64") => "x86_64-unknown-linux-gnu",
        _ => return Err(format!("不支持的平台: {} {}", std::env::consts::OS, std::env::consts::ARCH)),
    };
    
    let filename_with_triple = if std::env::consts::OS == "windows" {
        format!("{}-{}.exe", name, triple)
    } else {
        format!("{}-{}", name, triple)
    };

    let filename_plain = if std::env::consts::OS == "windows" {
        format!("{}.exe", name)
    } else {
        name.to_string()
    };

    // 2. 多路径探测策略
    let mut search_paths = Vec::new();

    // 尝试从当前可执行文件目录获取 (MacOS Contents/MacOS)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            println!("🔍 检查可执行目录: {:?}", exe_dir);
            search_paths.push(exe_dir.join(&filename_plain));
            search_paths.push(exe_dir.join(&filename_with_triple));
        }
    }

    // 尝试从 Resource 目录获取 (MacOS Contents/Resources)
    if let Ok(res_dir) = app.path().resource_dir() {
        println!("🔍 检查资源目录: {:?}", res_dir);
        search_paths.push(res_dir.join("binaries").join(&filename_plain));
        search_paths.push(res_dir.join("binaries").join(&filename_with_triple));
        search_paths.push(res_dir.join(&filename_plain));
        search_paths.push(res_dir.join(&filename_with_triple));
    }

    for path in search_paths {
        // 添加打印以便在终端调试
        println!("🔍 检查路径: {:?}", path);
        if path.exists() {
            println!("✅ 发现 Sidecar: {:?}", path);
            // 自动修复权限 (针对 Unix 系统)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(metadata) = std::fs::metadata(&path) {
                    let mut perms = metadata.permissions();
                    if (perms.mode() & 0o111) == 0 {
                        println!("⚙️ 正在修复可执行权限: {:?}", path);
                        perms.set_mode(0o755);
                        let _ = std::fs::set_permissions(&path, perms);
                    }
                }
            }
            return Ok(path.to_string_lossy().to_string());
        }
    }

    // 3. 开发环境回退方案
    let dev_path = std::env::current_dir()
        .unwrap_or_default()
        .join("binaries")
        .join(&filename_with_triple);
    
    if dev_path.exists() {
        return Ok(dev_path.to_string_lossy().to_string());
    }

    Err(format!("无法在任何预想位置找到 Sidecar: {}", name))
}
