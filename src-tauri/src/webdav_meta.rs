use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavMeta {
    pub exists: bool,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebDavFile {
    pub content: String,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

/// Pure helper function to extract text content of an XML element ignoring its namespace prefix.
/// Trims the extracted text and decodes `&quot;` to `"`.
pub fn extract_xml_tag_value(xml: &str, tag_name: &str) -> Option<String> {
    let lower_tag = tag_name.to_ascii_lowercase();
    let mut search_idx = 0;

    while let Some(open_rel) = xml[search_idx..].find('<') {
        let open_pos = search_idx + open_rel;
        let close_pos = match xml[open_pos..].find('>') {
            Some(p) => open_pos + p,
            None => break,
        };

        let tag_content = &xml[open_pos + 1..close_pos];
        // If it's a closing tag, skip
        if tag_content.starts_with('/') {
            search_idx = close_pos + 1;
            continue;
        }

        // If it's self-closing, skip
        if tag_content.ends_with('/') {
            search_idx = close_pos + 1;
            continue;
        }

        let full_tag_name = tag_content.split_whitespace().next().unwrap_or("");
        let local_name = match full_tag_name.split_once(':') {
            Some((_, local)) => local,
            None => full_tag_name,
        };

        if local_name.eq_ignore_ascii_case(&lower_tag) {
            let after_open = close_pos + 1;
            if let Some(next_open) = xml[after_open..].find('<') {
                let inner = &xml[after_open..after_open + next_open];
                let decoded = inner.trim().replace("&quot;", "\"");
                if !decoded.is_empty() {
                    return Some(decoded);
                }
            }
        }

        search_idx = close_pos + 1;
    }

    None
}

fn build_target_url(url: &str, filename: &str) -> String {
    let base_url = if url.ends_with('/') {
        url.to_string()
    } else {
        format!("{}/", url)
    };
    format!("{}{}", base_url, filename)
}

fn apply_auth(
    mut req: reqwest::RequestBuilder,
    username: &str,
    password: &Option<String>,
) -> reqwest::RequestBuilder {
    if let Some(pass) = password {
        req = req.basic_auth(username, Some(pass));
    } else {
        req = req.basic_auth(username, None::<String>);
    }
    req
}

pub async fn stat_internal(
    client: &reqwest::Client,
    target_url: &str,
    username: &str,
    password: &Option<String>,
) -> Result<WebDavMeta, String> {
    let head_req = client.head(target_url);
    let head_req = apply_auth(head_req, username, password);

    let res = head_req.send().await.map_err(|e| format!("E_NETWORK: {}", e))?;
    let status = res.status();

    if status == reqwest::StatusCode::NOT_FOUND {
        return Ok(WebDavMeta {
            exists: false,
            etag: None,
            last_modified: None,
        });
    }

    if status.is_success() {
        let etag = res
            .headers()
            .get(reqwest::header::ETAG)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let last_modified = res
            .headers()
            .get(reqwest::header::LAST_MODIFIED)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        if etag.is_some() || last_modified.is_some() {
            return Ok(WebDavMeta {
                exists: true,
                etag,
                last_modified,
            });
        }
        // Fall back to PROPFIND if HEAD succeeds but returns neither header
    } else if status.as_u16() != 405 && status.as_u16() != 501 {
        return Err(format!("E_HTTP_{}", status.as_u16()));
    }

    // PROPFIND fallback
    let propfind_method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("E_NETWORK: {}", e))?;
    let prop_req = client
        .request(propfind_method, target_url)
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getlastmodified/></d:prop></d:propfind>"#);
    let prop_req = apply_auth(prop_req, username, password);

    let prop_res = prop_req.send().await.map_err(|e| format!("E_NETWORK: {}", e))?;
    let prop_status = prop_res.status();

    if prop_status == reqwest::StatusCode::NOT_FOUND {
        return Ok(WebDavMeta {
            exists: false,
            etag: None,
            last_modified: None,
        });
    }

    if prop_status.is_success() || prop_status.as_u16() == 207 {
        let body = prop_res.text().await.map_err(|e| format!("E_NETWORK: {}", e))?;
        let etag = extract_xml_tag_value(&body, "getetag");
        let last_modified = extract_xml_tag_value(&body, "getlastmodified");
        return Ok(WebDavMeta {
            exists: true,
            etag,
            last_modified,
        });
    }

    Err(format!("E_HTTP_{}", prop_status.as_u16()))
}

#[tauri::command]
pub async fn webdav_stat(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
) -> Result<WebDavMeta, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let target_url = build_target_url(&url, &filename);
    stat_internal(&client, &target_url, &username, &password).await
}

#[tauri::command]
pub async fn webdav_download_meta(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
) -> Result<WebDavFile, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let target_url = build_target_url(&url, &filename);
    let req = client.get(&target_url);
    let req = apply_auth(req, &username, &password);

    let res = req.send().await.map_err(|e| format!("E_NETWORK: {}", e))?;

    if res.status() == reqwest::StatusCode::NOT_FOUND {
        return Err("E_NOT_FOUND".to_string());
    }

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}", res.status().as_u16()));
    }

    let etag = res
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let last_modified = res
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let content = res.text().await.map_err(|e| format!("E_NETWORK: {}", e))?;

    Ok(WebDavFile {
        content,
        etag,
        last_modified,
    })
}

#[tauri::command]
pub async fn webdav_upload_meta(
    url: String,
    username: String,
    password: Option<String>,
    filename: String,
    content: String,
) -> Result<WebDavMeta, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    let target_url = build_target_url(&url, &filename);
    let req = client
        .put(&target_url)
        .header("Content-Type", "application/json; charset=utf-8")
        .body(content);
    let req = apply_auth(req, &username, &password);

    let res = req.send().await.map_err(|e| format!("E_NETWORK: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("E_HTTP_{}", res.status().as_u16()));
    }

    let etag = res
        .headers()
        .get(reqwest::header::ETAG)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let last_modified = res
        .headers()
        .get(reqwest::header::LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if etag.is_some() || last_modified.is_some() {
        Ok(WebDavMeta {
            exists: true,
            etag,
            last_modified,
        })
    } else {
        stat_internal(&client, &target_url, &username, &password).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_xml_prefix_lowercase_d() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/remote.php/webdav/test.json</d:href>
    <d:propstat>
      <d:prop>
        <d:getetag>"tag-d-123"</d:getetag>
        <d:getlastmodified>Sun, 27 Sep 2026 12:00:00 GMT</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;

        assert_eq!(extract_xml_tag_value(xml, "getetag"), Some("\"tag-d-123\"".to_string()));
        assert_eq!(extract_xml_tag_value(xml, "getlastmodified"), Some("Sun, 27 Sep 2026 12:00:00 GMT".to_string()));
    }

    #[test]
    fn test_extract_xml_prefix_uppercase_d() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:propstat>
      <D:prop>
        <D:getetag>&quot;tag-D-456&quot;</D:getetag>
        <D:getlastmodified>Mon, 28 Sep 2026 08:30:00 GMT</D:getlastmodified>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>
</D:multistatus>"#;

        assert_eq!(extract_xml_tag_value(xml, "getetag"), Some("\"tag-D-456\"".to_string()));
        assert_eq!(extract_xml_tag_value(xml, "getlastmodified"), Some("Mon, 28 Sep 2026 08:30:00 GMT".to_string()));
    }

    #[test]
    fn test_extract_xml_no_prefix() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<multistatus xmlns="DAV:">
  <response>
    <propstat>
      <prop>
        <getetag>"tag-no-prefix"</getetag>
        <getlastmodified>Tue, 29 Sep 2026 15:45:00 GMT</getlastmodified>
      </prop>
      <status>HTTP/1.1 200 OK</status>
    </propstat>
  </response>
</multistatus>"#;

        assert_eq!(extract_xml_tag_value(xml, "getetag"), Some("\"tag-no-prefix\"".to_string()));
        assert_eq!(extract_xml_tag_value(xml, "getlastmodified"), Some("Tue, 29 Sep 2026 15:45:00 GMT".to_string()));
    }

    #[test]
    fn test_extract_xml_missing_element() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>"#;

        assert_eq!(extract_xml_tag_value(xml, "getetag"), None);
        assert_eq!(extract_xml_tag_value(xml, "getlastmodified"), None);
    }
}
