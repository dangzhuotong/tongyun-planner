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

/// https is required. http is allowed only for localhost, 127.0.0.1, and ::1,
/// so Basic auth is not sent in cleartext to an arbitrary host.
pub fn assert_webdav_url_allowed(url: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "E_WEBDAV_URL: invalid URL".to_string())?;
    match parsed.scheme() {
        "https" => Ok(()),
        "http" => {
            if is_local_http_host(parsed.host_str()) {
                Ok(())
            } else {
                Err("E_WEBDAV_URL: http is only allowed for localhost".to_string())
            }
        }
        _ => Err("E_WEBDAV_URL: only https is allowed".to_string()),
    }
}

fn is_local_http_host(host: Option<&str>) -> bool {
    let Some(host) = host else {
        return false;
    };
    let host = host.trim_matches(|c| c == '[' || c == ']');
    host.eq_ignore_ascii_case("localhost") || host == "127.0.0.1" || host == "::1"
}

pub fn build_target_url(url: &str, filename: &str) -> Result<String, String> {
    let url = url.trim();
    assert_webdav_url_allowed(url)?;
    let base_url = if url.ends_with('/') {
        url.to_string()
    } else {
        format!("{}/", url)
    };
    Ok(format!("{}{}", base_url, filename))
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

    let res = head_req
        .send()
        .await
        .map_err(|e| format!("E_NETWORK: {}", e))?;
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
    let propfind_method =
        reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| format!("E_NETWORK: {}", e))?;
    let prop_req = client
        .request(propfind_method, target_url)
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .body(r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:getetag/><d:getlastmodified/></d:prop></d:propfind>"#);
    let prop_req = apply_auth(prop_req, username, password);

    let prop_res = prop_req
        .send()
        .await
        .map_err(|e| format!("E_NETWORK: {}", e))?;
    let prop_status = prop_res.status();

    if prop_status == reqwest::StatusCode::NOT_FOUND {
        return Ok(WebDavMeta {
            exists: false,
            etag: None,
            last_modified: None,
        });
    }

    if prop_status.is_success() || prop_status.as_u16() == 207 {
        let body = prop_res
            .text()
            .await
            .map_err(|e| format!("E_NETWORK: {}", e))?;
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

    let target_url = build_target_url(&url, &filename)?;
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

    let target_url = build_target_url(&url, &filename)?;
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

    let target_url = build_target_url(&url, &filename)?;
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

        assert_eq!(
            extract_xml_tag_value(xml, "getetag"),
            Some("\"tag-d-123\"".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "getlastmodified"),
            Some("Sun, 27 Sep 2026 12:00:00 GMT".to_string())
        );
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

        assert_eq!(
            extract_xml_tag_value(xml, "getetag"),
            Some("\"tag-D-456\"".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "getlastmodified"),
            Some("Mon, 28 Sep 2026 08:30:00 GMT".to_string())
        );
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

        assert_eq!(
            extract_xml_tag_value(xml, "getetag"),
            Some("\"tag-no-prefix\"".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "getlastmodified"),
            Some("Tue, 29 Sep 2026 15:45:00 GMT".to_string())
        );
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

    #[test]
    fn http_is_limited_to_localhost() {
        assert!(assert_webdav_url_allowed("https://dav.jianguoyun.com/dav/").is_ok());
        assert!(assert_webdav_url_allowed("http://localhost:8080/dav/").is_ok());
        assert!(assert_webdav_url_allowed("http://127.0.0.1/dav/").is_ok());
        assert!(assert_webdav_url_allowed("http://[::1]/dav/").is_ok());
        assert!(assert_webdav_url_allowed("http://evil.example/dav/").is_err());
        assert!(assert_webdav_url_allowed("http://localhost.evil.example/dav/").is_err());
        assert!(assert_webdav_url_allowed("ftp://localhost/dav/").is_err());
        assert!(
            build_target_url("http://evil.example/dav/", "TongYunPlanner/config.json").is_err()
        );
        assert!(build_target_url(
            "https://dav.jianguoyun.com/dav/",
            "TongYunPlanner/config.json"
        )
        .is_ok());
    }

    #[test]
    fn test_build_target_url_handling() {
        assert_eq!(
            build_target_url("https://dav.jianguoyun.com/dav", "file.json").unwrap(),
            "https://dav.jianguoyun.com/dav/file.json"
        );
        assert_eq!(
            build_target_url("https://dav.jianguoyun.com/dav/", "file.json").unwrap(),
            "https://dav.jianguoyun.com/dav/file.json"
        );
        assert_eq!(
            build_target_url("  https://dav.jianguoyun.com/dav/  ", "sub/dir.json").unwrap(),
            "https://dav.jianguoyun.com/dav/sub/dir.json"
        );
    }

    #[test]
    fn test_extract_xml_with_attributes_and_entities() {
        let xml = r#"<d:multistatus xmlns:d="DAV:"><d:prop><d:getetag attr="test">&quot;tag-with-attr&quot;</d:getetag></d:prop></d:multistatus>"#;
        assert_eq!(
            extract_xml_tag_value(xml, "getetag"),
            Some("\"tag-with-attr\"".to_string())
        );

        let empty_xml = r#"<d:multistatus xmlns:d="DAV:"><d:prop><d:getetag></d:getetag></d:prop></d:multistatus>"#;
        assert_eq!(extract_xml_tag_value(empty_xml, "getetag"), None);
    }

    #[test]
    fn test_webdav_meta_and_file_serialization() {
        let meta = WebDavMeta {
            exists: true,
            etag: Some("\"etag-123\"".to_string()),
            last_modified: Some("Mon, 28 Sep 2026 08:30:00 GMT".to_string()),
        };
        let json = serde_json::to_string(&meta).expect("serialize meta");
        assert!(json.contains("\"lastModified\":"));
        let de_meta: WebDavMeta = serde_json::from_str(&json).expect("deserialize meta");
        assert_eq!(de_meta.exists, true);
        assert_eq!(de_meta.etag.as_deref(), Some("\"etag-123\""));

        let file = WebDavFile {
            content: "{}".to_string(),
            etag: Some("\"etag-456\"".to_string()),
            last_modified: None,
        };
        let file_json = serde_json::to_string(&file).expect("serialize file");
        assert!(file_json.contains("\"content\":\"{}\""));
    }

    #[test]
    fn test_extract_xml_date_formats() {
        // RFC 1123 format date
        let xml_rfc1123 = r#"<d:response><d:propstat><d:prop>
            <d:getlastmodified>Sun, 27 Sep 2026 12:00:00 GMT</d:getlastmodified>
        </d:prop></d:propstat></d:response>"#;
        assert_eq!(
            extract_xml_tag_value(xml_rfc1123, "getlastmodified"),
            Some("Sun, 27 Sep 2026 12:00:00 GMT".to_string())
        );

        // ISO 8601 format date
        let xml_iso = r#"<D:response><D:propstat><D:prop>
            <D:getlastmodified>2026-10-15T08:30:00Z</D:getlastmodified>
        </D:prop></D:propstat></D:response>"#;
        assert_eq!(
            extract_xml_tag_value(xml_iso, "getlastmodified"),
            Some("2026-10-15T08:30:00Z".to_string())
        );

        // RFC 850 format date
        let xml_rfc850 = r#"<response><propstat><prop>
            <getlastmodified>Sunday, 27-Sep-26 12:00:00 GMT</getlastmodified>
        </prop></propstat></response>"#;
        assert_eq!(
            extract_xml_tag_value(xml_rfc850, "getlastmodified"),
            Some("Sunday, 27-Sep-26 12:00:00 GMT".to_string())
        );

        // Date with extra whitespace and newlines (should be trimmed)
        let xml_whitespace = "<d:response><d:prop>\n            <d:getlastmodified>\n                Thu, 15 Oct 2026 15:30:00 GMT\n            </d:getlastmodified>\n        </d:prop></d:response>";
        assert_eq!(
            extract_xml_tag_value(xml_whitespace, "getlastmodified"),
            Some("Thu, 15 Oct 2026 15:30:00 GMT".to_string())
        );
    }

    #[test]
    fn test_extract_xml_tag_case_insensitivity() {
        let xml = r#"<d:response><d:prop>
            <d:GetLastModified>2026-10-15T12:00:00Z</d:GetLastModified>
            <d:GETETAG>"tag-case-test"</d:GETETAG>
        </d:prop></d:response>"#;

        assert_eq!(
            extract_xml_tag_value(xml, "getlastmodified"),
            Some("2026-10-15T12:00:00Z".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "GETLASTMODIFIED"),
            Some("2026-10-15T12:00:00Z".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "GetLastModified"),
            Some("2026-10-15T12:00:00Z".to_string())
        );

        assert_eq!(
            extract_xml_tag_value(xml, "getetag"),
            Some("\"tag-case-test\"".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "GETETAG"),
            Some("\"tag-case-test\"".to_string())
        );
        assert_eq!(
            extract_xml_tag_value(xml, "GetETag"),
            Some("\"tag-case-test\"".to_string())
        );
    }

    #[test]
    fn test_extract_xml_etag_quote_decoding_and_formatting() {
        let xml_entities = r#"<d:prop><d:getetag>&quot;hash-abc-123&quot;</d:getetag></d:prop>"#;
        assert_eq!(
            extract_xml_tag_value(xml_entities, "getetag"),
            Some("\"hash-abc-123\"".to_string())
        );

        let xml_weak = r#"<d:prop><d:getetag>W/&quot;weak-etag-xyz&quot;</d:getetag></d:prop>"#;
        assert_eq!(
            extract_xml_tag_value(xml_weak, "getetag"),
            Some("W/\"weak-etag-xyz\"".to_string())
        );

        let xml_unquoted = r#"<d:prop><d:getetag>unquoted-hash-456</d:getetag></d:prop>"#;
        assert_eq!(
            extract_xml_tag_value(xml_unquoted, "getetag"),
            Some("unquoted-hash-456".to_string())
        );
    }

    #[test]
    fn test_extract_xml_edge_cases_and_malformed() {
        let xml_self_closing = r#"<d:prop><d:getetag/><d:getetag>"valid-tag"</d:getetag></d:prop>"#;
        assert_eq!(
            extract_xml_tag_value(xml_self_closing, "getetag"),
            Some("\"valid-tag\"".to_string())
        );

        let xml_empty = r#"<d:prop><d:getetag></d:getetag></d:prop>"#;
        assert_eq!(extract_xml_tag_value(xml_empty, "getetag"), None);

        let xml_ws_only = "<d:prop><d:getetag>   \n\t   </d:getetag></d:prop>";
        assert_eq!(extract_xml_tag_value(xml_ws_only, "getetag"), None);

        let xml_unclosed = r#"<d:prop><d:getetag "value"#;
        assert_eq!(extract_xml_tag_value(xml_unclosed, "getetag"), None);

        let xml_no_bracket = r#"<d:getetag"#;
        assert_eq!(extract_xml_tag_value(xml_no_bracket, "getetag"), None);

        assert_eq!(extract_xml_tag_value("", "getetag"), None);

        let xml_other = r#"<d:prop><d:displayname>Test File</d:displayname></d:prop>"#;
        assert_eq!(extract_xml_tag_value(xml_other, "getetag"), None);
    }

    #[test]
    fn test_assert_webdav_url_allowed_error_mapping() {
        assert_eq!(
            assert_webdav_url_allowed("not a valid url").unwrap_err(),
            "E_WEBDAV_URL: invalid URL"
        );
        assert_eq!(
            assert_webdav_url_allowed("").unwrap_err(),
            "E_WEBDAV_URL: invalid URL"
        );
        assert_eq!(
            assert_webdav_url_allowed("://missing-scheme").unwrap_err(),
            "E_WEBDAV_URL: invalid URL"
        );

        assert_eq!(
            assert_webdav_url_allowed("http://dav.example.com/dav").unwrap_err(),
            "E_WEBDAV_URL: http is only allowed for localhost"
        );
        assert_eq!(
            assert_webdav_url_allowed("http://192.168.1.100:8080/dav").unwrap_err(),
            "E_WEBDAV_URL: http is only allowed for localhost"
        );
        assert_eq!(
            assert_webdav_url_allowed("http://10.0.0.1/dav").unwrap_err(),
            "E_WEBDAV_URL: http is only allowed for localhost"
        );
        assert_eq!(
            assert_webdav_url_allowed("http://[2001:db8::1]/dav").unwrap_err(),
            "E_WEBDAV_URL: http is only allowed for localhost"
        );

        assert_eq!(
            assert_webdav_url_allowed("ftp://localhost/dav").unwrap_err(),
            "E_WEBDAV_URL: only https is allowed"
        );
        assert_eq!(
            assert_webdav_url_allowed("file:///local/path").unwrap_err(),
            "E_WEBDAV_URL: only https is allowed"
        );
        assert_eq!(
            assert_webdav_url_allowed("ws://localhost:1420").unwrap_err(),
            "E_WEBDAV_URL: only https is allowed"
        );
        assert_eq!(
            assert_webdav_url_allowed("gopher://localhost").unwrap_err(),
            "E_WEBDAV_URL: only https is allowed"
        );
    }

    #[test]
    fn test_is_local_http_host() {
        assert!(is_local_http_host(Some("localhost")));
        assert!(is_local_http_host(Some("LOCALHOST")));
        assert!(is_local_http_host(Some("LocalHost")));
        assert!(is_local_http_host(Some("127.0.0.1")));
        assert!(is_local_http_host(Some("::1")));
        assert!(is_local_http_host(Some("[::1]")));

        assert!(!is_local_http_host(Some("example.com")));
        assert!(!is_local_http_host(Some("192.168.1.1")));
        assert!(!is_local_http_host(Some("0.0.0.0")));
        assert!(!is_local_http_host(Some("localhost.example.com")));
        assert!(!is_local_http_host(None));
    }

    #[test]
    fn test_build_target_url_formatting_and_error_propagation() {
        assert_eq!(
            build_target_url("https://dav.example.com/remote.php/webdav", "tasks.json").unwrap(),
            "https://dav.example.com/remote.php/webdav/tasks.json"
        );
        assert_eq!(
            build_target_url("https://dav.example.com/remote.php/webdav/", "tasks.json").unwrap(),
            "https://dav.example.com/remote.php/webdav/tasks.json"
        );
        assert_eq!(
            build_target_url("https://dav.example.com/webdav", "backups/2026-10-15.json").unwrap(),
            "https://dav.example.com/webdav/backups/2026-10-15.json"
        );

        assert_eq!(
            build_target_url("  https://dav.example.com/dav/  ", "file.json").unwrap(),
            "https://dav.example.com/dav/file.json"
        );

        assert_eq!(
            build_target_url("http://remote.server/dav", "file.json").unwrap_err(),
            "E_WEBDAV_URL: http is only allowed for localhost"
        );
        assert_eq!(
            build_target_url("invalid-url-string", "file.json").unwrap_err(),
            "E_WEBDAV_URL: invalid URL"
        );
        assert_eq!(
            build_target_url("ftp://localhost/dav", "file.json").unwrap_err(),
            "E_WEBDAV_URL: only https is allowed"
        );
    }

    #[test]
    fn test_webdav_meta_and_file_edge_cases() {
        let json_minimal = r#"{"exists":false}"#;
        let meta: WebDavMeta = serde_json::from_str(json_minimal).expect("deserialize minimal");
        assert_eq!(meta.exists, false);
        assert_eq!(meta.etag, None);
        assert_eq!(meta.last_modified, None);

        let meta_none = WebDavMeta {
            exists: true,
            etag: None,
            last_modified: None,
        };
        let serialized = serde_json::to_string(&meta_none).expect("serialize none");
        assert!(serialized.contains("\"exists\":true"));

        let file = WebDavFile {
            content: r#"{"tasks":[]}"#.to_string(),
            etag: Some("\"etag-xyz\"".to_string()),
            last_modified: Some("Sun, 27 Sep 2026 12:00:00 GMT".to_string()),
        };
        let file_json = serde_json::to_string(&file).expect("serialize file");
        let de_file: WebDavFile = serde_json::from_str(&file_json).expect("deserialize file");
        assert_eq!(de_file.content, r#"{"tasks":[]}"#);
        assert_eq!(de_file.etag.as_deref(), Some("\"etag-xyz\""));
        assert_eq!(de_file.last_modified.as_deref(), Some("Sun, 27 Sep 2026 12:00:00 GMT"));
    }
}
