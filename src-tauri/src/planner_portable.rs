use base64::Engine;
use std::io::Read;
use tauri::{AppHandle, Manager};

#[tauri::command]
pub(crate) async fn fetch_calendar_feed(url: String) -> Result<String, String> {
    const LIMIT: usize = 2 * 1024 * 1024;
    let url = reqwest::Url::parse(&url).map_err(|_| "日历订阅地址无效")?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return Err("日历订阅需要 HTTPS".into());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "无法初始化日历连接")?;
    let mut response = client
        .get(url)
        .send()
        .await
        .map_err(|_| "无法连接日历服务")?;
    if !response.status().is_success() {
        return Err(format!("日历服务返回 HTTP {}", response.status().as_u16()));
    }
    let mut data = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "读取日历失败")? {
        if data.len() + chunk.len() > LIMIT {
            return Err("日历文件最大 2 MB".into());
        }
        data.extend_from_slice(&chunk);
    }
    String::from_utf8(data).map_err(|_| "日历不是 UTF-8 文件".into())
}

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
