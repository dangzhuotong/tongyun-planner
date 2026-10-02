use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub name: String,
    pub size: u64,
    pub modified_ms: u64,
}

pub fn validate_backup_kind(kind: &str) -> Result<(), String> {
    if kind != "daily" && kind != "conflicts" {
        return Err("E_INVALID_BACKUP_KIND".to_string());
    }
    Ok(())
}

pub fn validate_backup_name(file_name: &str) -> Result<(), String> {
    if file_name.is_empty()
        || file_name.len() > 128
        || !file_name.ends_with(".json")
        || !file_name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
    {
        return Err("E_INVALID_BACKUP_NAME".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn local_backup_write(
    app: AppHandle,
    kind: String,
    file_name: String,
    content: String,
) -> Result<String, String> {
    validate_backup_kind(&kind)?;
    validate_backup_name(&file_name)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups")
        .join(&kind);

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let target = dir.join(&file_name);
    let tmp = dir.join(format!("{}.tmp", file_name));

    std::fs::write(&tmp, content.as_bytes()).map_err(|e| e.to_string())?;

    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &target).map_err(|e| e.to_string())?;

    Ok(target.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn local_backup_list(app: AppHandle, kind: String) -> Result<Vec<BackupEntry>, String> {
    validate_backup_kind(&kind)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups")
        .join(&kind);

    if !dir.exists() || !dir.is_dir() {
        return Ok(Vec::new());
    }

    let read_dir = match std::fs::read_dir(&dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(Vec::new()),
    };

    let mut entries = Vec::new();
    for entry_res in read_dir {
        let entry = entry_res.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let size = metadata.len();
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        entries.push(BackupEntry {
            name,
            size,
            modified_ms,
        });
    }

    entries.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(entries)
}

#[tauri::command]
pub fn local_backup_read(app: AppHandle, kind: String, file_name: String) -> Result<String, String> {
    validate_backup_kind(&kind)?;
    validate_backup_name(&file_name)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups")
        .join(&kind);

    let target = dir.join(&file_name);
    if !target.exists() || !target.is_file() {
        return Err("E_NOT_FOUND".to_string());
    }

    std::fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn local_backup_prune(app: AppHandle, kind: String, keep: usize) -> Result<usize, String> {
    validate_backup_kind(&kind)?;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups")
        .join(&kind);

    if !dir.exists() || !dir.is_dir() {
        return Ok(0);
    }

    let read_dir = match std::fs::read_dir(&dir) {
        Ok(rd) => rd,
        Err(_) => return Ok(0),
    };

    let mut names = Vec::new();
    for entry_res in read_dir {
        let entry = entry_res.map_err(|e| e.to_string())?;
        let file_type = entry.file_type().map_err(|e| e.to_string())?;
        if !file_type.is_file() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.ends_with(".json") {
            continue;
        }
        names.push(name);
    }

    names.sort_by(|a, b| b.cmp(a));

    if names.len() <= keep {
        return Ok(0);
    }

    let to_delete = &names[keep..];
    let mut deleted_count = 0;
    for file_name in to_delete {
        let target = dir.join(file_name);
        if std::fs::remove_file(&target).is_ok() {
            deleted_count += 1;
        }
    }

    Ok(deleted_count)
}

#[tauri::command]
pub fn local_backup_dir(app: AppHandle) -> Result<String, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups");
    Ok(root.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_backup_kind() {
        assert!(validate_backup_kind("daily").is_ok());
        assert!(validate_backup_kind("conflicts").is_ok());
        assert_eq!(validate_backup_kind("weekly").unwrap_err(), "E_INVALID_BACKUP_KIND");
        assert_eq!(validate_backup_kind("").unwrap_err(), "E_INVALID_BACKUP_KIND");
    }

    #[test]
    fn test_validate_backup_name() {
        assert!(validate_backup_name("2026-09-27.json").is_ok());
        assert!(validate_backup_name("backup_1.json").is_ok());
        assert_eq!(validate_backup_name("").unwrap_err(), "E_INVALID_BACKUP_NAME");
        assert_eq!(validate_backup_name("test.txt").unwrap_err(), "E_INVALID_BACKUP_NAME");
        assert_eq!(validate_backup_name("../test.json").unwrap_err(), "E_INVALID_BACKUP_NAME");
        assert_eq!(validate_backup_name("test/foo.json").unwrap_err(), "E_INVALID_BACKUP_NAME");
        let long_name = format!("{}.json", "a".repeat(125));
        assert_eq!(validate_backup_name(&long_name).unwrap_err(), "E_INVALID_BACKUP_NAME");
    }
}
