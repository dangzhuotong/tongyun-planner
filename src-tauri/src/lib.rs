mod agent_api;
mod sqlite_transaction;
mod planner_portable;
use tauri::{AppHandle, Emitter, Manager};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use serde::{Serialize, Deserialize};
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

mod backup;
mod diagnostic;
mod email;
mod webdav_meta;

pub use backup::*;
pub use webdav_meta::*;

static QUIT_PENDING: AtomicBool = AtomicBool::new(false);
static QUIT_READY: AtomicBool = AtomicBool::new(false);

fn request_quit(app: &AppHandle) {
    if QUIT_READY.load(Ordering::SeqCst) {
        app.exit(0);
        return;
    }
    if QUIT_PENDING.swap(true, Ordering::SeqCst) {
        return;
    }

    let _ = app.emit_to("main", "tongyun-quit-requested", ());

    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(8));
        QUIT_READY.store(true, Ordering::SeqCst);
        app_handle.exit(0);
    });
}

#[tauri::command]
fn app_quit_ready(app: AppHandle) {
    QUIT_READY.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[tauri::command]
fn save_local_attachment(app: AppHandle, file_name: String, bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("E_ATTACHMENT_TOO_LARGE".to_string());
    }
    if file_name.is_empty() || !file_name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) {
        return Err("E_INVALID_ATTACHMENT_NAME".to_string());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(&file_name);
    let temporary = dir.join(format!("{}.tmp", file_name));
    std::fs::write(&temporary, bytes).map_err(|e| e.to_string())?;
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temporary, &target).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
fn delete_local_attachment(app: AppHandle, file_name: String) -> Result<(), String> {
    if file_name.is_empty() || !file_name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) {
        return Err("E_INVALID_ATTACHMENT_NAME".to_string());
    }
    let target = app.path().app_data_dir().map_err(|e| e.to_string())?.join("attachments").join(file_name);
    if target.exists() {
        std::fs::remove_file(target).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 1. 定义多窗口间传递的同步状态数据结构
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TodoSyncPayload {
    pub task_id: String,
    pub action: String,      // 例如: "complete" (完成), "snooze" (延后), "update" (修改)
    pub source_window: Option<String>,
    // title/description/notes/... 全部改为 Option<String>：
    //   None    → 表示“未提供，不要变更”
    //   Some("") → 表示“显式清空”
    // 前端收方按此语义处理。
    pub title: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub category: Option<String>,
    pub due_date: Option<String>,
    pub due_time: Option<String>,
    pub timestamp: u64,
}

// 2. Tauri Command: 供前端手动调用，用于跨窗口广播状态
#[tauri::command]
fn sync_todo_state(app: AppHandle, payload: TodoSyncPayload) -> Result<(), String> {
    app.emit("todo-sync-event", payload)
        .map_err(|e| e.to_string())
}

/// macOS Dock / Finder 再次打开时，只要主窗不可见就把主窗拉回来。
/// 不能用「有没有任何可见窗口」判断：桌面挂件单独可见时主窗仍可能是隐藏的，
/// 那样点 Dock 图标会没有任何反应。
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn should_restore_main_on_reopen(main_visible: bool) -> bool {
    !main_visible
}

fn restore_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    // 主窗真被销毁时（不是这次的隐藏路径），按已合并的窗口配置重建，避免进程活着却永远没窗。
    let Some(config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")
        .cloned()
    else {
        return;
    };
    if let Ok(builder) = tauri::WebviewWindowBuilder::from_config(app, &config) {
        let _ = builder.build();
    }
}

// 3. 核心业务逻辑：切换悬浮挂件的显隐状态
fn toggle_widget(app: &AppHandle) {
    if let Some(widget_window) = app.get_webview_window("widget") {
        let is_visible = widget_window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = widget_window.hide();
        } else {
            let _ = widget_window.show();
            let _ = widget_window.set_focus(); 
        }
    }
}

// 4. 新增 Command: 供前端按钮点击调用
#[tauri::command]
fn toggle_widget_window(app: AppHandle) -> Result<(), String> {
    toggle_widget(&app);
    Ok(())
}

// 5. 新增 Command: 供前端控制挂件窗口鼠标穿透
#[tauri::command]
fn set_widget_click_through(app: AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(widget_window) = app.get_webview_window("widget") {
        widget_window.set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// 6. 微休息提醒：主窗前台可见且聚焦时返回 false 由应用内浮层展示，
// 否则发系统通知（不拉起主窗、不抢焦点）。
#[tauri::command]
fn notify_micro_break(app: AppHandle, title: String, body: String) -> bool {
    use tauri_plugin_notification::NotificationExt;

    // 挂件或其他本应用窗口持有焦点时，主窗的 is_focused 仍可能是 false，
    // 因此按「主窗可见且未最小化 + 本应用任一窗口持有焦点」判断是否在前台。
    let main = app.get_webview_window("main");
    let main_visible = main
        .as_ref()
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false);
    let main_minimized = main
        .as_ref()
        .and_then(|window| window.is_minimized().ok())
        .unwrap_or(false);
    let app_focused = app
        .webview_windows()
        .values()
        .any(|window| window.is_focused().unwrap_or(false));
    let inline = main_visible && !main_minimized && app_focused;

    if inline {
        return false;
    }

    let _ = app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show();
    true
}

// 6. WebDAV 云备份指令 (在 Rust 端运行以规避前端浏览器的 CORS 限制)
// WebDAV 创建目录 (MKCOL)
#[tauri::command]
fn webdav_mkcol(
    url: String,
    username: String,
    password: Option<String>,
    dirname: String,
) -> Result<(), String> {
    let target_url = build_target_url(&url, &dirname)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.request(reqwest::Method::from_bytes(b"MKCOL").unwrap(), &target_url);

    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;

    // 405 = already exists, which is fine
    if res.status().is_success() || res.status().as_u16() == 405 {
        Ok(())
    } else {
        Err(format!("E_HTTP_{}: MKCOL failed - {}", res.status().as_u16(), res.status().canonical_reason().unwrap_or("")))
    }
}

#[tauri::command]
fn webdav_upload(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
    content: String,
) -> Result<(), String> {
    let target_url = build_target_url(&url, &filename)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.put(&target_url)
        .header("Content-Type", "application/json; charset=utf-8")
        .body(content);

    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}: Upload failed - {}", res.status().as_u16(), res.status().canonical_reason().unwrap_or("")));
    }

    Ok(())
}

#[tauri::command]
fn webdav_download(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
) -> Result<String, String> {
    let target_url = build_target_url(&url, &filename)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&target_url);

    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        // 使用稳定的错误标识码，前端按前缀匹配而非文案，避免本地化/大小写差异
        return Err("E_NOT_FOUND: Backup file not found on server.".to_string());
    }

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}: {}", res.status().as_u16(), res.status().canonical_reason().unwrap_or("")));
    }

    res.text().map_err(|e| e.to_string())
}

// WebDAV 二进制上传 (base64 编码): 用于图片/附件等非文本文件
#[tauri::command]
fn webdav_upload_binary(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
    content_base64: String,
    content_type: String,
) -> Result<(), String> {
    let target_url = build_target_url(&url, &filename)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    use base64::Engine;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|e| format!("Base64 decode error: {}", e))?;

    let mut req = client.put(&target_url)
        .header("Content-Type", &content_type)
        .body(bytes);

    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}: Upload failed", res.status().as_u16()));
    }
    Ok(())
}

// WebDAV 二进制下载 (返回 base64)
#[tauri::command]
fn webdav_download_binary(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
) -> Result<String, String> {
    let target_url = build_target_url(&url, &filename)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&target_url);
    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("E_NOT_FOUND".to_string());
    }
    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}", res.status().as_u16()));
    }

    let bytes = res.bytes().map_err(|e| e.to_string())?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}

// WebDAV 删除文件 (DELETE)
#[tauri::command]
fn webdav_delete(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
) -> Result<(), String> {
    let target_url = build_target_url(&url, &filename)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.delete(&target_url);
    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }

    let res = req.send().map_err(|e| e.to_string())?;
    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("E_NOT_FOUND".to_string());
    }
    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}", res.status().as_u16()));
    }
    Ok(())
}

// ── 本地文件操作 (App Data Directory) ──

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| format!("Cannot get app data dir: {}", e))
}

fn ensure_tongyun_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?;
    let tongyun = dir.join("TongYunPlanner");
    std::fs::create_dir_all(&tongyun).map_err(|e| format!("Cannot create dir: {}", e))?;
    Ok(tongyun)
}

#[tauri::command]
fn file_save(app: AppHandle, path: String, data: Vec<u8>) -> Result<(), String> {
    let base = ensure_tongyun_dir(&app)?;
    let full = base.join(&path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dir: {}", e))?;
    }
    std::fs::write(&full, data).map_err(|e| format!("Cannot write file: {}", e))
}

#[tauri::command]
fn file_save_b64(app: AppHandle, path: String, data_b64: String) -> Result<(), String> {
    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&data_b64)
        .map_err(|e| format!("Invalid base64: {}", e))?;
    let base = ensure_tongyun_dir(&app)?;
    let full = base.join(&path);
    if let Some(parent) = full.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Cannot create parent dir: {}", e))?;
    }
    std::fs::write(&full, data).map_err(|e| format!("Cannot write file: {}", e))
}

#[tauri::command]
fn file_read(app: AppHandle, path: String) -> Result<Vec<u8>, String> {
    let base = ensure_tongyun_dir(&app)?;
    let full = base.join(&path);
    if !full.exists() {
        return Err("E_NOT_FOUND".to_string());
    }
    std::fs::read(&full).map_err(|e| format!("Cannot read file: {}", e))
}

#[tauri::command]
fn file_read_b64(app: AppHandle, path: String) -> Result<String, String> {
    use base64::Engine;
    let base = ensure_tongyun_dir(&app)?;
    let full = base.join(&path);
    if !full.exists() {
        return Err("E_NOT_FOUND".to_string());
    }
    let data = std::fs::read(&full).map_err(|e| format!("Cannot read file: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[tauri::command]
fn file_delete(app: AppHandle, path: String) -> Result<(), String> {
    let base = ensure_tongyun_dir(&app)?;
    let full = base.join(&path);
    if !full.exists() {
        return Err("E_NOT_FOUND".to_string());
    }
    std::fs::remove_file(&full).map_err(|e| format!("Cannot delete file: {}", e))
}

#[tauri::command]
fn file_list(app: AppHandle, prefix: String) -> Result<Vec<String>, String> {
    let base = ensure_tongyun_dir(&app)?;
    let dir = base.join(&prefix);
    if !dir.exists() || !dir.is_dir() {
        return Ok(Vec::new());
    }
    let mut result = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| format!("Cannot list dir: {}", e))? {
        let entry = entry.map_err(|e| format!("Cannot read entry: {}", e))?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                let relative = if prefix.is_empty() {
                    name.to_string()
                } else {
                    format!("{}/{}", prefix, name)
                };
                result.push(relative);
            }
        }
    }
    Ok(result)
}

// 7. RSS 代理拉取命令：在 Rust 端 GET 远程 RSS/Atom XML，绕过前端 CORS 限制
#[tauri::command]
fn fetch_rss(url: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .header("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .header("Cache-Control", "no-cache")
        .send()
        .map_err(|e| format!("E_NETWORK: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}: {}", res.status().as_u16(), res.status().canonical_reason().unwrap_or("")));
    }

    res.text().map_err(|e| e.to_string())
}

// 7.1 RSS / 文章配图代理命令：支持携带目标站点 Referer 绕过防盗链，并转为 base64 data-url 返回前端
#[tauri::command]
fn fetch_image_base64(url: String, referer: Option<String>) -> Result<String, String> {
    use base64::Engine;

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.get(&url);
    if let Some(ref r) = referer {
        if !r.trim().is_empty() {
            req = req.header("Referer", r);
        }
    } else if let Ok(parsed) = reqwest::Url::parse(&url) {
        if let Some(host) = parsed.host_str() {
            req = req.header("Referer", format!("https://{}/", host));
        }
    }

    let resp = req.send().map_err(|e| format!("E_NETWORK: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("E_HTTP_{}", resp.status().as_u16()));
    }

    let mime = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = resp.bytes().map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

// 8. AI API 代理命令：异步 HTTP 请求到任意 AI 端点，不阻塞 UI
#[tauri::command]
async fn ai_proxy(url: String, method: String, headers: std::collections::HashMap<String, String>, body: Option<String>, timeout_secs: Option<u64>) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs.unwrap_or(30)))
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = match method.to_uppercase().as_str() {
        "GET" => client.get(&url),
        _ => client.post(&url).header("Content-Type", "application/json"),
    };

    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let res = req.send().await.map_err(|e| format!("E_NETWORK: {}", e))?;
    let status = res.status().as_u16();
    let text = res.text().await.map_err(|e| e.to_string())?;

    if !(200..300).contains(&status) {
        return Err(format!("E_HTTP_{}: {}", status, text));
    }
    Ok(text)
}

/// 只回传 ~/.tongyun 里和公司库 DSN 有关的字段，不把整份配置打进日志。
#[tauri::command]
fn read_pipeline_home_files() -> PipelineHomeFiles {
    let mut files = PipelineHomeFiles::default();
    if let Ok(value) = std::env::var("TONGYUN_REMOTE_DSN") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            files.remote_dsn_from_env = Some(trimmed.to_string());
        }
    }
    let Some(home) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) else {
        return files;
    };
    let dir = PathBuf::from(home).join(".tongyun");
    if !dir.is_dir() {
        return files;
    }
    files.pipeline_dsn = read_capped(&dir.join("pipeline.dsn"));
    files.pipeline_json = read_capped(&dir.join("pipeline.json")).and_then(|text| project_pipeline_json(&text));
    files.config_json = read_capped(&dir.join("config.json")).and_then(|text| project_pipeline_json(&text));
    files.env_file = read_capped(&dir.join(".env")).and_then(|text| project_env(&text));
    if files.remote_dsn_from_env.is_none() {
        if let Some(text) = read_capped(&dir.join("planner").join("remote.env"))
            .or_else(|| read_capped(&dir.join("remote.env")))
        {
            for line in text.lines() {
                let trimmed = line.trim();
                let body = trimmed.strip_prefix("export ").unwrap_or(trimmed).trim();
                if let Some((k, v)) = body.split_once('=') {
                    let k_norm = k.trim().to_ascii_uppercase();
                    if k_norm == "DATABASE_URL" || k_norm == "TONGYUN_REMOTE_DSN" {
                        let val = v.trim().trim_matches('"').trim_matches('\'').trim();
                        if !val.is_empty() {
                            files.remote_dsn_from_env = Some(val.to_string());
                            break;
                        }
                    }
                }
            }
        }
    }
    files
}

#[derive(Serialize, Default)]
struct PipelineHomeFiles {
    #[serde(rename = "pipeline.dsn")]
    pipeline_dsn: Option<String>,
    #[serde(rename = "pipeline.json")]
    pipeline_json: Option<String>,
    #[serde(rename = "config.json")]
    config_json: Option<String>,
    #[serde(rename = ".env")]
    env_file: Option<String>,
    #[serde(rename = "remoteDsnFromEnv")]
    remote_dsn_from_env: Option<String>,
}

fn read_capped(path: &std::path::Path) -> Option<String> {
    let file = std::fs::File::open(path).ok()?;
    let mut reader = std::io::BufReader::new(file);
    let mut buf = vec![0u8; 32 * 1024];
    let read = std::io::Read::read(&mut reader, &mut buf).ok()?;
    if read == 0 {
        return None;
    }
    let text = String::from_utf8_lossy(&buf[..read]);
    let trimmed = text.trim_start_matches('\u{feff}').trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn project_pipeline_json(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    let obj = value.as_object()?;
    let mut out = serde_json::Map::new();
    for key in ["dsn", "pipeline_dsn", "pipelineDsn"] {
        if let Some(item) = obj.get(key) {
            out.insert(key.to_string(), item.clone());
        }
    }
    if let Some(pipeline) = obj.get("pipeline").and_then(|item| item.as_object()) {
        if let Some(dsn) = pipeline.get("dsn") {
            let mut nested = serde_json::Map::new();
            nested.insert("dsn".to_string(), dsn.clone());
            out.insert("pipeline".to_string(), serde_json::Value::Object(nested));
        }
    }
    if out.is_empty() {
        return None;
    }
    serde_json::to_string(&out).ok()
}

fn project_env(text: &str) -> Option<String> {
    let mut kept = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let body = trimmed.strip_prefix("export ").unwrap_or(trimmed).trim();
        let Some((key, _)) = body.split_once('=') else {
            continue;
        };
        let key_norm = key.trim().to_ascii_uppercase();
        if key_norm == "PIPELINE_DSN"
            || key_norm == "TONGYUN_PIPELINE_DSN"
            || key_norm == "TONGYUN_REMOTE_DSN"
            || key_norm == "DATABASE_URL"
        {
            kept.push(body.to_string());
        }
    }
    if kept.is_empty() {
        None
    } else {
        Some(kept.join("\n"))
    }
}

const EXTERNAL_PLAYER_LABEL: &str = "external-player";

static PLAYER_URL: Mutex<Option<String>> = Mutex::new(None);
static PLAYER_GEN: AtomicU64 = AtomicU64::new(0);
static SILENT_PLAYER_GENS: Mutex<Option<HashSet<u64>>> = Mutex::new(None);

/// 只允许已经解析好的 YouTube / B 站嵌入页。主窗口不再内嵌这些页面。
fn external_player_url_allowed(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    if url.scheme() != "https" || url.username() != "" || url.password().is_some() {
        return false;
    }
    if url.port().is_some() || url.fragment().is_some() {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    match host {
        "www.youtube-nocookie.com" | "www.youtube.com" => {
            let mut parts = url.path().split('/').filter(|part| !part.is_empty());
            let Some("embed") = parts.next() else {
                return false;
            };
            let Some(id) = parts.next() else {
                return false;
            };
            parts.next().is_none()
                && id.len() == 11
                && id
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
        }
        "player.bilibili.com" => url.path() == "/player.html",
        _ => false,
    }
}

fn destroy_external_player(app: &AppHandle) {
    let Some(window) = app.get_webview_window(EXTERNAL_PLAYER_LABEL) else {
        return;
    };
    let generation = PLAYER_GEN.load(Ordering::SeqCst);
    if generation != 0 {
        if let Ok(mut guard) = SILENT_PLAYER_GENS.lock() {
            guard.get_or_insert_with(HashSet::new).insert(generation);
        }
    }
    let _ = window.destroy();
}

fn open_external_player(app: &AppHandle, target: &str) -> Result<(), String> {
    let parsed = target
        .parse()
        .map_err(|_| "E_PLAYER_URL".to_string())?;
    let generation = PLAYER_GEN.load(Ordering::SeqCst).saturating_add(1);
    PLAYER_GEN.store(generation, Ordering::SeqCst);
    let mut builder = tauri::WebviewWindowBuilder::new(app, EXTERNAL_PLAYER_LABEL, tauri::WebviewUrl::External(parsed))
        .title("外部白噪音")
        .inner_size(420.0, 280.0)
        .resizable(true)
        .always_on_top(true)
        .focused(false)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .on_navigation(|url| url.scheme() == "https" || url.scheme() == "about");
    if let Ok(dir) = app.path().app_data_dir() {
        builder = builder.data_directory(dir.join("external-player-webview"));
    }
    let window = builder.build().map_err(|error| error.to_string())?;
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if !matches!(event, tauri::WindowEvent::Destroyed) {
            return;
        }
        let silent = SILENT_PLAYER_GENS
            .lock()
            .ok()
            .and_then(|mut guard| guard.as_mut().map(|gens| gens.remove(&generation)))
            .unwrap_or(false);
        if silent {
            return;
        }
        if PLAYER_GEN.load(Ordering::SeqCst) != generation {
            return;
        }
        if let Ok(mut current) = PLAYER_URL.lock() {
            *current = None;
        }
        let _ = app_handle.emit_to("main", "external-player-closed", ());
    });
    Ok(())
}

#[tauri::command]
fn append_diagnostic_log(app: AppHandle, line: String) -> Result<(), String> {
    diagnostic::append_log(&app, &line)
}

#[tauri::command]
fn export_diagnostic_log(app: AppHandle) -> Result<String, String> {
    diagnostic::export_log(&app)
}

#[tauri::command]
fn set_external_player(app: AppHandle, url: Option<String>) -> Result<(), String> {
    let desired = match url {
        Some(raw) => {
            let trimmed = raw.trim().to_string();
            if !external_player_url_allowed(&trimmed) {
                return Err("E_PLAYER_URL".to_string());
            }
            Some(trimmed)
        }
        None => None,
    };

    {
        let current = PLAYER_URL.lock().map_err(|_| "E_PLAYER_LOCK".to_string())?;
        if *current == desired {
            if desired.is_some() {
                if let Some(window) = app.get_webview_window(EXTERNAL_PLAYER_LABEL) {
                    let _ = window.unminimize();
                    let _ = window.show();
                    return Ok(());
                }
            } else if app.get_webview_window(EXTERNAL_PLAYER_LABEL).is_none() {
                return Ok(());
            }
        }
    }

    destroy_external_player(&app);
    if let Ok(mut current) = PLAYER_URL.lock() {
        *current = None;
    }
    let Some(next) = desired else {
        return Ok(());
    };
    open_external_player(&app, &next)?;
    if let Ok(mut current) = PLAYER_URL.lock() {
        *current = Some(next);
    }
    Ok(())
}

fn planner_context() -> tauri::Context<tauri::Wry> {
    let context = tauri::generate_context!();
    #[cfg(all(debug_assertions, target_os = "macos"))]
    {
        let mut context = context;
        // Keep development acceptance WebViews in a separate WebKit data store.
        if let Ok(id) = std::env::var("TONGYUN_PLANNER_ACCEPTANCE_WEBVIEW_STORE") {
            let id = uuid::Uuid::parse_str(&id).expect("invalid Planner acceptance WebView store UUID");
            for window in &mut context.config_mut().app.windows {
                window.data_store_identifier = Some(*id.as_bytes());
            }
        }
        context
    }
    #[cfg(not(all(debug_assertions, target_os = "macos")))]
    context
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 注册 Opener 插件
        .plugin(tauri_plugin_opener::init())
        // 注册 Store 持久化插件
        .plugin(tauri_plugin_store::Builder::default().build())
        // 注册 SQL 插件（SQLite 本地数据库）
        .plugin(tauri_plugin_sql::Builder::default().build())
        // 注册 Process 插件
        .plugin(tauri_plugin_process::init())
        // 注册 Updater 插件
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 注册系统通知插件（后台微休息提醒）
        .plugin(tauri_plugin_notification::init())
        // 挂载用于多窗口间状态交互及窗口显隐控制的命令
        .invoke_handler(tauri::generate_handler![
            save_local_attachment,
            delete_local_attachment,
            sync_todo_state,
            toggle_widget_window,
            set_widget_click_through,
            notify_micro_break,
            webdav_mkcol,
            webdav_upload,
            webdav_download,
            webdav_upload_binary,
            webdav_download_binary,
            webdav_delete,
            file_save,
            file_save_b64,
            file_read,
            file_read_b64,
            file_delete,
            file_list,
            fetch_rss,
            fetch_image_base64,
            ai_proxy,
            email::send_test_email,
            webdav_stat,
            webdav_download_meta,
            webdav_upload_meta,
            local_backup_write,
            local_backup_list,
            local_backup_read,
            local_backup_prune,
            local_backup_dir,
            app_quit_ready,
            read_pipeline_home_files,
            set_external_player,
            append_diagnostic_log,
            export_diagnostic_log,
            agent_api::agent_api_finish,
            agent_api::agent_api_settings,
            agent_api::agent_api_grant,
            agent_api::agent_api_revoke,
            sqlite_transaction::planner_sqlite_write_batch,
            planner_portable::fetch_calendar_feed,
            planner_portable::read_planner_attachment
        ])
        // 6. 初始化系统托盘
        .setup(|app| {
            // 创建托盘菜单项
            let show_item = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let toggle_widget_item = MenuItem::with_id(app, "toggle_widget", "显示/隐藏挂件", true, None::<&str>)?;
            let toggle_lock_item = MenuItem::with_id(app, "toggle_lock", "锁定/解锁挂件", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 橦云手帐", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &toggle_widget_item, &toggle_lock_item, &quit_item])?;

            // 构建系统托盘图标
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("橦云手帐 - 四象限待办管理")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            restore_main_window(app);
                        }
                        "toggle_widget" => {
                            toggle_widget(app);
                        }
                        "toggle_lock" => {
                            let _ = app.emit("todo-sync-event", TodoSyncPayload {
                                task_id: "widget_lock".to_string(),
                                action: "toggle_lock_from_tray".to_string(),
                                source_window: Some("tray".to_string()),
                                title: None,
                                description: None,
                                notes: None,
                                category: None,
                                due_date: None,
                                due_time: None,
                                timestamp: 0,
                            });
                        }
                        "quit" => {
                            request_quit(app);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // 左键单击托盘图标 → 恢复主窗口
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        restore_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            agent_api::start(app.handle().clone());
            Ok(())
        })
        // 7. 主窗口点关闭：隐藏到托盘，不退出。macOS 再点 Dock 由 RunEvent::Reopen 拉回主窗。
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    // 阻止默认关闭行为
                    api.prevent_close();
                    // 隐藏主窗口
                    let _ = window.hide();
                    // 同时隐藏挂件
                    if let Some(widget) = window.app_handle().get_webview_window("widget") {
                        let _ = widget.hide();
                    }
                    let _ = window.app_handle().emit_to("main", "tongyun-main-hidden", ());
                }
            }
        })
        .build(planner_context())
        .expect("运行 Tauri 应用程序时发生错误")
        .run(|app, event| match event {
            tauri::RunEvent::ExitRequested { code, api, .. } => {
                if code.is_none() && !QUIT_READY.load(Ordering::SeqCst) {
                    api.prevent_exit();
                    request_quit(app);
                }
            }
            // Dock / open -a 走 applicationShouldHandleReopen。挂件可见不算主窗可见，
            // 主窗隐藏或最小化时都拉回来；主窗已经在前台就只补一次聚焦。
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen { .. } => {
                let main_visible = app
                    .get_webview_window("main")
                    .and_then(|window| window.is_visible().ok())
                    .unwrap_or(false);
                if should_restore_main_on_reopen(main_visible) {
                    restore_main_window(app);
                } else if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dock_reopen_restores_main_whenever_main_is_hidden() {
        assert!(should_restore_main_on_reopen(false));
        assert!(!should_restore_main_on_reopen(true));
    }

    #[test]
    fn test_todo_sync_payload_serialization_round_trip() {
        let payload = TodoSyncPayload {
            task_id: "task-abc-123".to_string(),
            action: "complete".to_string(),
            source_window: Some("widget".to_string()),
            title: Some("Write test cases".to_string()),
            description: Some("Cover pure helpers".to_string()),
            notes: Some("Pure helpers in src-tauri".to_string()),
            category: Some("important-not-urgent".to_string()),
            due_date: Some("2026-10-15".to_string()),
            due_time: Some("17:00".to_string()),
            timestamp: 1729000000000,
        };

        let json = serde_json::to_string(&payload).expect("serialize payload");
        assert!(json.contains("\"task_id\":\"task-abc-123\""));
        assert!(json.contains("\"action\":\"complete\""));
        assert!(json.contains("\"due_date\":\"2026-10-15\""));
        assert!(json.contains("\"due_time\":\"17:00\""));
        assert!(json.contains("\"timestamp\":1729000000000"));

        let de: TodoSyncPayload = serde_json::from_str(&json).expect("deserialize payload");
        assert_eq!(de.task_id, "task-abc-123");
        assert_eq!(de.action, "complete");
        assert_eq!(de.source_window.as_deref(), Some("widget"));
        assert_eq!(de.title.as_deref(), Some("Write test cases"));
        assert_eq!(de.due_date.as_deref(), Some("2026-10-15"));
        assert_eq!(de.due_time.as_deref(), Some("17:00"));
        assert_eq!(de.timestamp, 1729000000000);
    }

    #[test]
    fn test_todo_sync_payload_with_none_and_empty_options() {
        let payload_none = TodoSyncPayload {
            task_id: "task-none-test".to_string(),
            action: "snooze".to_string(),
            source_window: None,
            title: None,
            description: None,
            notes: None,
            category: None,
            due_date: None,
            due_time: None,
            timestamp: 0,
        };

        let json = serde_json::to_string(&payload_none).expect("serialize payload none");
        let de: TodoSyncPayload = serde_json::from_str(&json).expect("deserialize payload none");
        assert_eq!(de.task_id, "task-none-test");
        assert_eq!(de.action, "snooze");
        assert_eq!(de.source_window, None);
        assert_eq!(de.title, None);
        assert_eq!(de.due_date, None);

        let payload_clear = TodoSyncPayload {
            task_id: "task-clear-test".to_string(),
            action: "update".to_string(),
            source_window: Some("main".to_string()),
            title: Some("".to_string()),
            description: Some("".to_string()),
            notes: Some("".to_string()),
            category: Some("urgent-important".to_string()),
            due_date: Some("".to_string()),
            due_time: Some("".to_string()),
            timestamp: 1729000002000,
        };

        let clear_json = serde_json::to_string(&payload_clear).expect("serialize payload clear");
        let de_clear: TodoSyncPayload = serde_json::from_str(&clear_json).expect("deserialize payload clear");
        assert_eq!(de_clear.title.as_deref(), Some(""));
        assert_eq!(de_clear.description.as_deref(), Some(""));
        assert_eq!(de_clear.due_date.as_deref(), Some(""));
    }

    #[test]
    fn external_player_only_allows_known_embed_pages() {
        assert!(external_player_url_allowed(
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&autoplay=1"
        ));
        assert!(external_player_url_allowed(
            "https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=1"
        ));
        assert!(!external_player_url_allowed("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
        assert!(!external_player_url_allowed("https://evil.example/embed/dQw4w9WgXcQ"));
        assert!(!external_player_url_allowed("file:///tmp/player.html"));
        assert!(!external_player_url_allowed(
            "https://user:pass@www.youtube.com/embed/dQw4w9WgXcQ"
        ));
    }
}
