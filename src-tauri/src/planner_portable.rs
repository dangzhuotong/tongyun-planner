use base64::Engine;
use std::io::Read;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub(crate) fn read_planner_attachment(app: AppHandle, path: String) -> Result<String, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "附件目录不可用")?
        .join("attachments");
    let root = root.canonicalize().map_err(|_| "附件目录不可用")?;
    let file = std::path::Path::new(&path)
        .canonicalize()
        .map_err(|_| "附件不存在")?;
    if !file.starts_with(&root) || !file.is_file() {
        return Err("附件路径不属于手帐".into());
    }
    let mut data = Vec::new();
    std::fs::File::open(file)
        .map_err(|_| "附件读取失败")?
        .take(20 * 1024 * 1024 + 1)
        .read_to_end(&mut data)
        .map_err(|_| "附件读取失败")?;
    if data.len() > 20 * 1024 * 1024 {
        return Err("单个附件超过 20 MB".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}
