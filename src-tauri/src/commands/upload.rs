use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::io::{Write, Seek};
use std::sync::Mutex;
use tempfile::NamedTempFile;

static SESSIONS: Lazy<Mutex<HashMap<String, (NamedTempFile, String)>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn gen_session_id() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let v: u128 = rng.gen();
    format!("{:032x}", v)
}

#[tauri::command]
pub fn start_upload(filename: String, _total_size: Option<u64>) -> Result<String, String> {
    let ext = filename
        .rsplit('.')
        .next()
        .map(|s| format!(".{}", s))
        .unwrap_or_default();

    let mut builder = tempfile::Builder::new();
    if !ext.is_empty() {
        builder.suffix(&ext);
    }

    let tmp = builder
        .tempfile()
        .map_err(|e| format!("failed to create temp file: {}", e))?;

    let session_id = gen_session_id();

    let mut map = SESSIONS.lock().map_err(|e| format!("lock error: {}", e))?;
    map.insert(session_id.clone(), (tmp, ext));

    Ok(session_id)
}

#[tauri::command]
pub fn upload_chunk(session_id: String, chunk_base64: String) -> Result<u64, String> {
    let mut map = SESSIONS.lock().map_err(|e| format!("lock error: {}", e))?;
    let (tmp, _) = map
        .get_mut(&session_id)
        .ok_or_else(|| "invalid session id".to_string())?;

    let decoded = base64::decode(&chunk_base64).map_err(|e| format!("base64 decode: {}", e))?;

    let file = tmp.as_file_mut();
    file.write_all(&decoded)
        .map_err(|e| format!("write error: {}", e))?;

    let pos = file
        .stream_position()
        .map_err(|e| format!("tell pos error: {}", e))?;

    Ok(pos)
}

#[tauri::command]
pub fn finish_upload(session_id: String) -> Result<String, String> {
    let mut map = SESSIONS.lock().map_err(|e| format!("lock error: {}", e))?;
    let (tmp, ext) = map
        .remove(&session_id)
        .ok_or_else(|| "invalid session id".to_string())?;

    // Persist to a file inside system temp dir with a stable name and original extension
    let tmp_dir = std::env::temp_dir();
    let filename = format!("silence_cutter_upload_{}{}", session_id, ext);
    let final_path = tmp_dir.join(filename);

    match tmp.persist(&final_path) {
        Ok(_) => {
            // Set permissions so the asset protocol can read it
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&final_path).unwrap().permissions();
                perms.set_mode(0o644);
                let _ = std::fs::set_permissions(&final_path, perms);
            }

            Ok(final_path
                .to_str()
                .map(|s| s.to_string())
                .ok_or_else(|| "path conversion failed".to_string())?)
        },
        Err(e) => Err(format!("persist temp file error: {}", e.error)),
    }
}
