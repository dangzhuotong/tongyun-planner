use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

const MAX_LOG_BYTES: u64 = 1_000_000;
const MAX_LINE_CHARS: usize = 2_000;

static LOG_WRITE: Mutex<()> = Mutex::new(());

fn log_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("logs");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.join("diagnostic.log"))
}

pub(crate) fn utc_stamp(secs: u64) -> String {
    let days = (secs / 86_400) as i64;
    let tod = secs % 86_400;
    let hour = tod / 3_600;
    let minute = (tod % 3_600) / 60;
    let second = tod % 60;
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let mut year = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    if month <= 2 {
        year += 1;
    }
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn file_stamp(secs: u64) -> String {
    utc_stamp(secs).replace(['-', ':'], "").replace('T', "-").replace('Z', "")
}

pub(crate) fn sanitize_log_line(raw: &str) -> String {
    let mut line = raw.replace(['\r', '\n', '\0'], " ");
    if line.chars().count() > MAX_LINE_CHARS {
        line = line.chars().take(MAX_LINE_CHARS).collect::<String>();
        line.push('…');
    }
    line.trim().to_string()
}

fn trim_log(path: &Path) {
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    if meta.len() <= MAX_LOG_BYTES {
        return;
    }
    let Ok(bytes) = fs::read(path) else {
        return;
    };
    let start = bytes.len().saturating_sub(MAX_LOG_BYTES as usize);
    let offset = bytes[start..]
        .iter()
        .position(|byte| *byte == b'\n')
        .map(|index| index + 1)
        .unwrap_or(0);
    let _ = fs::write(path, &bytes[start + offset..]);
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

pub fn append_log(app: &AppHandle, text: &str) -> Result<(), String> {
    let _guard = LOG_WRITE.lock().map_err(|_| "E_LOG_LOCK".to_string())?;
    let path = log_path(app)?;
    trim_log(&path);
    let stamp = utc_stamp(now_secs());
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    let mut wrote = false;
    for raw in text.split('\n') {
        let line = sanitize_log_line(raw);
        if line.is_empty() {
            continue;
        }
        writeln!(file, "{stamp} {line}").map_err(|error| error.to_string())?;
        wrote = true;
    }
    if !wrote {
        writeln!(file, "{stamp} (empty)").map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn export_log(app: &AppHandle) -> Result<String, String> {
    let _guard = LOG_WRITE.lock().map_err(|_| "E_LOG_LOCK".to_string())?;
    let source = log_path(app)?;
    if !source.exists() {
        fs::write(&source, "").map_err(|error| error.to_string())?;
    }
    let downloads = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&downloads).map_err(|error| error.to_string())?;
    let dest = downloads.join(format!("tongyun-planner-{}.log", file_stamp(now_secs())));
    fs::copy(&source, &dest).map_err(|error| error.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{file_stamp, sanitize_log_line, utc_stamp};

    #[test]
    fn stamp_is_utc_epoch() {
        assert_eq!(utc_stamp(0), "1970-01-01T00:00:00Z");
        assert_eq!(file_stamp(0), "19700101-000000");
    }

    #[test]
    fn sanitize_collapses_breaks_and_limits_length() {
        assert_eq!(sanitize_log_line("a\nb\r\n"), "a b");
        let long = "字".repeat(2_001);
        let cleaned = sanitize_log_line(&long);
        assert!(cleaned.ends_with('…'));
        assert_eq!(cleaned.chars().count(), 2_001);
    }
}
