use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::Manager;

const MAX_BODY: usize = 256 * 1024;
const SECRET_QUERY: &[&str] = &[
    "token",
    "access_token",
    "password",
    "secret",
    "key",
    "api_key",
    "authorization",
];

#[derive(Debug, Serialize)]
pub struct LoopbackBody {
    pub status: u16,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoopbackPrefix {
    pub prefix: String,
    #[serde(default)]
    pub exclude_segments: Vec<String>,
}

fn segment_ok(segment: &str) -> bool {
    !segment.is_empty()
        && segment.len() <= 32
        && segment
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-')
}

fn path_matches(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{prefix}/"))
}

pub fn check_loopback_get(url: &str, prefixes: &[LoopbackPrefix]) -> Result<reqwest::Url, String> {
    if prefixes.is_empty() || prefixes.len() > 8 {
        return Err("loopback_rejected".into());
    }
    let parsed = reqwest::Url::parse(url).map_err(|_| "loopback_rejected".to_string())?;
    if parsed.scheme() != "http" || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("loopback_rejected".into());
    }
    let host = parsed.host_str().unwrap_or("");
    if host != "127.0.0.1" && host != "localhost" {
        return Err("loopback_rejected".into());
    }
    if parsed.port().is_none() {
        return Err("loopback_rejected".into());
    }
    if parsed.path().split('/').any(|part| part == "..") {
        return Err("loopback_rejected".into());
    }
    for (key, _) in parsed.query_pairs() {
        if SECRET_QUERY.contains(&key.to_ascii_lowercase().as_str()) {
            return Err("loopback_rejected".into());
        }
    }
    let mut matched = false;
    for prefix in prefixes {
        let rule = reqwest::Url::parse(&prefix.prefix).map_err(|_| "loopback_rejected".to_string())?;
        if rule.scheme() != "http"
            || rule.host_str() != Some(host)
            || rule.port() != parsed.port()
            || !rule.username().is_empty()
        {
            continue;
        }
        let rule_path = rule.path();
        if rule_path.len() < 2
            || !rule_path.starts_with('/')
            || rule_path == "/"
            || rule_path.split('/').any(|p| p == "..")
        {
            return Err("loopback_rejected".into());
        }
        if prefix.exclude_segments.len() > 8 || prefix.exclude_segments.iter().any(|seg| !segment_ok(seg)) {
            return Err("loopback_rejected".into());
        }
        let blocked = parsed
            .path()
            .split('/')
            .any(|part| !part.is_empty() && prefix.exclude_segments.iter().any(|seg| seg == part));
        if !blocked && path_matches(parsed.path(), rule_path) {
            matched = true;
            break;
        }
    }
    if !matched {
        return Err("loopback_rejected".into());
    }
    Ok(parsed)
}

pub fn read_secret_map(path: &std::path::Path) -> std::collections::HashMap<String, String> {
    let Ok(text) = fs::read_to_string(path) else {
        return std::collections::HashMap::new();
    };
    serde_json::from_str(&text).unwrap_or_default()
}

pub fn write_secret_map(path: &std::path::Path, map: &std::collections::HashMap<String, String>) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "secret_store".to_string())?;
    }
    let data = serde_json::to_vec(map).map_err(|_| "secret_store".to_string())?;
    let mut options = OpenOptions::new();
    options.create(true).write(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|_| "secret_store".to_string())?;
    file.write_all(&data).map_err(|_| "secret_store".to_string())?;
    Ok(())
}

pub fn secrets_path(dir: PathBuf) -> PathBuf {
    dir.join("plugin-sessions.json")
}

fn plugin_id_ok(id: &str) -> bool {
    let mut parts = id.split('.');
    let Some(first) = parts.next() else {
        return false;
    };
    if first.is_empty() || !first.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
        return false;
    }
    let mut count = 1;
    for part in parts {
        count += 1;
        if part.is_empty() || !part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()) {
            return false;
        }
    }
    count >= 2
}

fn sessions_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|_| "secret_store".to_string())?;
    Ok(secrets_path(dir))
}

fn load_sessions(path: &Path) -> HashMap<String, String> {
    read_secret_map(path)
}

#[tauri::command]
pub fn plugin_secret_put(app: AppHandle, plugin_id: String, secret: String) -> Result<(), String> {
    if !plugin_id_ok(&plugin_id) || secret.is_empty() || secret.len() > 4096 {
        return Err("secret_rejected".into());
    }
    let path = sessions_file(&app)?;
    let mut map = load_sessions(&path);
    map.insert(plugin_id, secret);
    write_secret_map(&path, &map)
}

#[tauri::command]
pub fn plugin_secret_forget(app: AppHandle, plugin_id: String) -> Result<(), String> {
    if !plugin_id_ok(&plugin_id) {
        return Err("secret_rejected".into());
    }
    let path = sessions_file(&app)?;
    let mut map = load_sessions(&path);
    map.remove(&plugin_id);
    write_secret_map(&path, &map)
}

#[tauri::command]
pub fn plugin_secret_exists(app: AppHandle, plugin_id: String) -> Result<bool, String> {
    if !plugin_id_ok(&plugin_id) {
        return Err("secret_rejected".into());
    }
    let path = sessions_file(&app)?;
    Ok(load_sessions(&path).contains_key(&plugin_id))
}

#[tauri::command]
pub fn plugin_loopback_get(
    app: AppHandle,
    plugin_id: String,
    url: String,
    prefixes: Vec<LoopbackPrefix>,
    attach_secret: bool,
) -> Result<LoopbackBody, String> {
    if !plugin_id_ok(&plugin_id) {
        return Err("loopback_rejected".into());
    }
    let parsed = check_loopback_get(&url, &prefixes)?;
    let secret = if attach_secret {
        let path = sessions_file(&app)?;
        match load_sessions(&path).get(&plugin_id).cloned() {
            Some(value) if !value.is_empty() => Some(value),
            _ => return Err("secret_missing".into()),
        }
    } else {
        None
    };
    perform_get(&parsed, secret.as_deref())
}

pub fn perform_get(url: &reqwest::Url, secret: Option<&str>) -> Result<LoopbackBody, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "network".to_string())?;
    let mut req = client.get(url.clone());
    if let Some(token) = secret {
        if token.is_empty() {
            return Err("secret_missing".into());
        }
        req = req.header("Authorization", format!("Bearer {token}"));
    }
    let response = req.send().map_err(|_| "network".to_string())?;
    let status = response.status().as_u16();
    if status >= 300 && status < 400 {
        return Ok(LoopbackBody {
            status,
            body: String::new(),
        });
    }
    let bytes = response.bytes().map_err(|_| "network".to_string())?;
    if bytes.len() > MAX_BODY {
        return Err("body_too_large".into());
    }
    let body = String::from_utf8(bytes.to_vec()).unwrap_or_default();
    Ok(LoopbackBody { status, body })
}

#[cfg(test)]
mod tests {
    use super::{check_loopback_get, read_secret_map, write_secret_map, LoopbackPrefix};
    use std::collections::HashMap;
    use std::fs;

    fn prefix(value: &str, exclude: &[&str]) -> LoopbackPrefix {
        LoopbackPrefix {
            prefix: value.to_string(),
            exclude_segments: exclude.iter().map(|item| (*item).to_string()).collect(),
        }
    }

    #[test]
    fn rejects_public_hosts_and_secrets_in_query() {
        let prefixes = vec![prefix("http://127.0.0.1:9/api/v1", &[])];
        assert!(check_loopback_get("https://example.com/api/v1", &prefixes).is_err());
        assert!(check_loopback_get("http://127.0.0.1:9/api/v1?token=abc", &prefixes).is_err());
        assert!(check_loopback_get("http://user:pw@127.0.0.1:9/api/v1", &prefixes).is_err());
        assert!(check_loopback_get("http://127.0.0.1/api/v1", &prefixes).is_err());
        assert!(check_loopback_get("http://127.0.0.1:9/other", &prefixes).is_err());
        assert!(check_loopback_get("http://127.0.0.1:9/", &[prefix("http://127.0.0.1:9/", &[])]).is_err());
    }

    #[test]
    fn secret_file_is_owner_readable_only() {
        let dir = std::env::temp_dir().join(format!("tongyun-plugin-secret-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("plugin-sessions.json");
        let mut map = HashMap::new();
        map.insert("org.example.reader".to_string(), "fixture-secret".to_string());
        write_secret_map(&path, &map).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
        assert_eq!(
            read_secret_map(&path).get("org.example.reader").map(String::as_str),
            Some("fixture-secret")
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn allows_declared_loopback_prefix_and_blocks_excluded_segment() {
        let prefixes = vec![prefix("http://127.0.0.1:9/api/v1/projects", &["article"])];
        assert!(check_loopback_get("http://127.0.0.1:9/api/v1/projects?limit=20", &prefixes).is_ok());
        assert!(check_loopback_get("http://127.0.0.1:9/api/v1/projects/abc/submissions", &prefixes).is_ok());
        assert!(check_loopback_get("http://127.0.0.1:9/api/v1/projects-extra", &prefixes).is_err());
        assert!(check_loopback_get("http://127.0.0.1:9/api/v1/projects/abc/article", &prefixes).is_err());
    }
}
