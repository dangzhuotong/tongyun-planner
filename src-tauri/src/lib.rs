use tauri::{AppHandle, Emitter, Manager};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use serde::{Serialize, Deserialize};
use std::path::PathBuf;

mod email;

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

// 6. WebDAV 云备份指令 (在 Rust 端运行以规避前端浏览器的 CORS 限制)
// WebDAV 创建目录 (MKCOL)
#[tauri::command]
fn webdav_mkcol(
    url: String,
    username: String,
    password: Option<String>,
    dirname: String,
) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, dirname);

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
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, filename);

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
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, filename);

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
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, filename);

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
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, filename);

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
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let base_url = if url.ends_with('/') { url } else { format!("{}/", url) };
    let target_url = format!("{}{}", base_url, filename);

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
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("TongYunPlanner/1.0 RSS Reader")
        .build()
        .map_err(|e| e.to_string())?;

    let res = client.get(&url)
        .header("Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml, */*")
        .send()
        .map_err(|e| format!("E_NETWORK: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}: {}", res.status().as_u16(), res.status().canonical_reason().unwrap_or("")));
    }

    res.text().map_err(|e| e.to_string())
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

    if status < 200 || status >= 300 {
        return Err(format!("E_HTTP_{}: {}", status, text));
    }
    Ok(text)
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
        // 挂载用于多窗口间状态交互及窗口显隐控制的命令
        .invoke_handler(tauri::generate_handler![
            sync_todo_state,
            toggle_widget_window,
            set_widget_click_through,
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
            ai_proxy,
            email::send_test_email
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
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
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
                            app.exit(0);
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
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        // 7. 拦截窗口关闭事件：主窗口点 X 时隐藏到托盘，而不是退出
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
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("运行 Tauri 应用程序时发生错误");
}
