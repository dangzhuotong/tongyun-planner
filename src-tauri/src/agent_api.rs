// Opt-in loopback bridge. Only the hydrated main window can perform an operation.
use axum::{
    body::{to_bytes, Body},
    extract::{Request, State},
    http::{header, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::any,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    net::Ipv4Addr,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use subtle::ConstantTimeEq;
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tokio::sync::{oneshot, Semaphore};
use uuid::Uuid;

const PORT: u16 = 17321;
const MAX_BODY: usize = 32 * 1024;
const AUDIT_LIMIT: u64 = 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub(crate) enum Operation {
    ListTasks,
    CreateTask,
    ListNotes,
    CreateNote,
    ListJournal,
    CreateJournal,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Grant {
    client: String,
    token_sha256: String,
    allow: Vec<Operation>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Call {
    operation: Operation,
    #[serde(default = "empty_args")]
    arguments: Value,
}

fn empty_args() -> Value {
    json!({})
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    id: Uuid,
    expires_at: u64,
    call: Call,
}

#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum JobResult {
    Ok { data: Value },
    Invalid,
    Conflict,
    Unavailable,
    Unknown,
}

type Pending = Arc<Mutex<Option<(String, oneshot::Sender<JobResult>)>>>;

#[derive(Clone)]
pub(crate) struct Bridge {
    config: PathBuf,
    audit: PathBuf,
    receipts: PathBuf,
    audit_lock: Arc<Mutex<()>>,
    grant_lock: Arc<Mutex<()>>,
    listening: Arc<AtomicBool>,
    host: String,
    single_call: Arc<Semaphore>,
    pending: Pending,
    dispatch: Arc<dyn Fn(Job) -> bool + Send + Sync>,
}

fn epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn digest(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

fn valid_label(label: &str) -> bool {
    !label.is_empty()
        && label.len() <= 64
        && label
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
}

fn read_grants(path: &Path) -> Option<Vec<Grant>> {
    let mut raw = Vec::new();
    fs::File::open(path)
        .ok()?
        .take((MAX_BODY + 1) as u64)
        .read_to_end(&mut raw)
        .ok()?;
    if raw.len() > MAX_BODY {
        return None;
    }
    let grants: Vec<Grant> = serde_json::from_slice(&raw).ok()?;
    if grants.iter().any(|g| {
        !valid_label(&g.client)
            || g.token_sha256.len() != 64
            || !g.token_sha256.bytes().all(|b| b.is_ascii_hexdigit())
    }) {
        return None;
    }
    // Reject ambiguous credentials or actor labels.
    for (i, g) in grants.iter().enumerate() {
        if grants[..i]
            .iter()
            .any(|p| p.client == g.client || p.token_sha256.eq_ignore_ascii_case(&g.token_sha256))
        {
            return None;
        }
    }
    Some(grants)
}

fn identify(path: &Path, req: &Request) -> Option<Grant> {
    let token = req
        .headers()
        .get(header::AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")?;
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let token_hash = digest(token);
    read_grants(path)?.into_iter().find(|g| {
        bool::from(
            g.token_sha256
                .to_ascii_lowercase()
                .as_bytes()
                .ct_eq(token_hash.as_bytes()),
        )
    })
}

fn private_file() -> OpenOptions {
    let mut opts = OpenOptions::new();
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    opts
}

fn write_atomic(path: &Path, content: &[u8]) -> io::Result<()> {
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let write = (|| {
        let mut file = private_file().write(true).create_new(true).open(&temp)?;
        file.write_all(content)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temp, path)?;
        #[cfg(unix)]
        fs::File::open(path.parent().ok_or(io::ErrorKind::InvalidInput)?)?.sync_all()?;
        Ok(())
    })();
    if write.is_err() {
        let _ = fs::remove_file(temp);
    }
    write
}

fn audit(
    bridge: &Bridge,
    id: &str,
    grant: &Grant,
    operation: Option<Operation>,
    outcome: &str,
) -> io::Result<()> {
    let _lock = bridge.audit_lock.lock().unwrap();
    let path = &bridge.audit;
    if let Ok(meta) = fs::metadata(path) {
        if meta.len() >= AUDIT_LIMIT {
            for i in (1..3).rev() {
                let previous = path.with_extension(format!("jsonl.{i}"));
                if previous.exists() {
                    fs::rename(previous, path.with_extension(format!("jsonl.{}", i + 1)))?;
                }
            }
            fs::rename(path, path.with_extension("jsonl.1"))?;
        }
    }
    let mut file = private_file().create(true).append(true).open(path)?;
    let line = json!({
        "time": epoch_ms(), "requestId": id, "client": grant.client,
        "operation": operation, "outcome": outcome,
    });
    writeln!(file, "{line}")?;
    file.sync_data()
}

#[derive(Serialize, Deserialize)]
struct Receipt {
    fingerprint: String,
    request_id: String,
    data: Option<Value>,
}

fn reserve_create(
    bridge: &Bridge,
    grant: &Grant,
    key: &str,
    call: &Call,
    id: &str,
) -> Result<(PathBuf, Receipt), Response> {
    use StatusCode as S;
    let failed = || error(S::SERVICE_UNAVAILABLE, "receipt_unavailable", Some(id));
    fs::create_dir_all(&bridge.receipts).map_err(|_| failed())?;
    let path = bridge
        .receipts
        .join(digest(&format!("{}:{key}", grant.client)));
    let fingerprint = digest(&serde_json::to_string(call).map_err(|_| failed())?);
    match fs::read(&path) {
        Ok(raw) => {
            let saved: Receipt = serde_json::from_slice(&raw).map_err(|_| failed())?;
            if saved.fingerprint != fingerprint {
                return Err(error(
                    S::CONFLICT,
                    "request_key_reused",
                    Some(&saved.request_id),
                ));
            }
            let response = match saved.data {
                Some(data) => respond(
                    S::OK,
                    json!({ "requestId": saved.request_id, "data": data, "replayed": true }),
                ),
                None => error(S::CONFLICT, "outcome_unknown", Some(&saved.request_id)),
            };
            return Err(response);
        }
        Err(e) if e.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(failed()),
    }
    let receipt = Receipt {
        fingerprint,
        request_id: id.into(),
        data: None,
    };
    write_atomic(&path, &serde_json::to_vec(&receipt).map_err(|_| failed())?)
        .map_err(|_| failed())?;
    Ok((path, receipt))
}

fn respond(status: StatusCode, value: Value) -> Response {
    (status, [(header::CACHE_CONTROL, "no-store")], Json(value)).into_response()
}

fn error(status: StatusCode, code: &str, id: Option<&str>) -> Response {
    respond(status, json!({ "error": code, "requestId": id }))
}

async fn handle(State(bridge): State<Bridge>, req: Request<Body>) -> Response {
    use StatusCode as S;
    if req.headers().contains_key(header::ORIGIN)
        || req
            .headers()
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            != Some(&bridge.host)
    {
        return error(S::FORBIDDEN, "loopback_only", None);
    }
    let Some(grant) = identify(&bridge.config, &req) else {
        return error(S::UNAUTHORIZED, "invalid_token", None);
    };
    if req.method() == Method::GET {
        return respond(S::OK, json!({ "operations": grant.allow }));
    }
    if req.method() != Method::POST {
        return error(S::METHOD_NOT_ALLOWED, "method_not_allowed", None);
    }
    if req
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|h| h.to_str().ok())
        .map(|v| v.split(';').next().unwrap_or("").trim())
        != Some("application/json")
    {
        return error(S::UNSUPPORTED_MEDIA_TYPE, "json_required", None);
    }

    let request_key = match req.headers().get("idempotency-key") {
        Some(value) => match value.to_str() {
            Ok(key) if valid_label(key) => Some(key.to_owned()),
            _ => return error(S::BAD_REQUEST, "invalid_request_key", None),
        },
        None => None,
    };
    let id = Uuid::new_v4();
    let id_string = id.to_string();
    let body =
        match tokio::time::timeout(Duration::from_secs(3), to_bytes(req.into_body(), MAX_BODY))
            .await
        {
            Ok(Ok(body)) => body,
            Ok(Err(_)) => {
                return error(
                    S::PAYLOAD_TOO_LARGE,
                    "invalid_or_oversize_body",
                    Some(&id_string),
                )
            }
            Err(_) => return error(S::REQUEST_TIMEOUT, "body_timeout", Some(&id_string)),
        };
    let call: Call = match serde_json::from_slice(&body) {
        Ok(call) => call,
        Err(_) => {
            let _ = audit(&bridge, &id_string, &grant, None, "invalid_call");
            return error(
                S::BAD_REQUEST,
                "unsupported_operation_or_invalid_call",
                Some(&id_string),
            );
        }
    };
    let op = Some(call.operation);
    if !grant.allow.contains(&call.operation) {
        let _ = audit(&bridge, &id_string, &grant, op, "denied");
        return error(S::FORBIDDEN, "scope_denied", Some(&id_string));
    }

    let Ok(permit) = bridge.single_call.clone().try_acquire_owned() else {
        return error(S::SERVICE_UNAVAILABLE, "planner_busy", Some(&id_string));
    };
    if audit(&bridge, &id_string, &grant, op, "started").is_err() {
        return error(
            S::SERVICE_UNAVAILABLE,
            "audit_unavailable",
            Some(&id_string),
        );
    }

    let reservation = if let Some(key) = request_key.filter(|_| {
        matches!(
            call.operation,
            Operation::CreateTask | Operation::CreateNote | Operation::CreateJournal
        )
    }) {
        match reserve_create(&bridge, &grant, &key, &call, &id_string) {
            Ok(reservation) => Some(reservation),
            Err(response) => {
                let outcome = if response.status().is_success() {
                    "replayed"
                } else {
                    "receipt_rejected"
                };
                let _ = audit(&bridge, &id_string, &grant, op, outcome);
                return response;
            }
        }
    } else {
        None
    };

    // Finish the audit and release the slot even if the HTTP caller disconnects.
    let task = tokio::spawn(async move {
        let _permit = permit;
        let (send, recv) = oneshot::channel();
        *bridge.pending.lock().unwrap() = Some((id_string.clone(), send));
        let result = if (bridge.dispatch)(Job {
            id,
            call,
            expires_at: epoch_ms() + TIMEOUT.as_millis() as u64,
        }) {
            match tokio::time::timeout(TIMEOUT, recv).await {
                Ok(Ok(result)) => result,
                _ => JobResult::Unknown,
            }
        } else {
            JobResult::Unavailable
        };
        bridge.pending.lock().unwrap().take();

        if let Some((path, mut receipt)) = reservation {
            let saved = match &result {
                JobResult::Ok { data } => {
                    receipt.data = Some(data.clone());
                    write_atomic(&path, &serde_json::to_vec(&receipt).unwrap())
                }
                JobResult::Unknown => Ok(()),
                _ => fs::remove_file(path),
            };
            if saved.is_err() {
                let _ = audit(&bridge, &id_string, &grant, op, "receipt_failed");
                return error(
                    S::INTERNAL_SERVER_ERROR,
                    "outcome_unknown",
                    Some(&id_string),
                );
            }
        }
        let (outcome, response) = match result {
            JobResult::Ok { data } => (
                "ok",
                respond(S::OK, json!({ "requestId": id_string, "data": data })),
            ),
            JobResult::Invalid => (
                "invalid_arguments",
                error(S::BAD_REQUEST, "invalid_arguments", Some(&id_string)),
            ),
            JobResult::Conflict => (
                "conflict",
                error(S::CONFLICT, "already_exists", Some(&id_string)),
            ),
            JobResult::Unavailable => (
                "planner_unavailable",
                error(
                    S::SERVICE_UNAVAILABLE,
                    "planner_unavailable",
                    Some(&id_string),
                ),
            ),
            JobResult::Unknown => (
                "outcome_unknown",
                error(S::GATEWAY_TIMEOUT, "outcome_unknown", Some(&id_string)),
            ),
        };
        if audit(&bridge, &id_string, &grant, op, outcome).is_err() {
            return error(
                S::INTERNAL_SERVER_ERROR,
                "audit_completion_failed_outcome_unknown",
                Some(&id_string),
            );
        }
        response
    });
    task.await
        .unwrap_or_else(|_| error(S::INTERNAL_SERVER_ERROR, "outcome_unknown", None))
}

fn router(bridge: Bridge) -> Router {
    Router::new()
        .route("/v1/agent", any(handle))
        .with_state(bridge)
}

#[tauri::command]
pub(crate) fn agent_api_finish(
    window: WebviewWindow,
    pending: tauri::State<'_, Pending>,
    id: String,
    result: JobResult,
) -> Result<(), &'static str> {
    if window.label() != "main" {
        return Err("main_window_required");
    }
    let mut pending = pending.lock().unwrap();
    if pending.as_ref().is_some_and(|(current, _)| *current == id) {
        if let Some((_, reply)) = pending.take() {
            let _ = reply.send(result);
        }
    }
    Ok(())
}

async fn ensure_listener(bridge: Bridge) -> Result<(), String> {
    if bridge.listening.swap(true, Ordering::SeqCst) {
        return Ok(());
    }
    let listener = match tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, PORT)).await {
        Ok(listener) => listener,
        Err(err) => {
            bridge.listening.store(false, Ordering::SeqCst);
            return Err(err.to_string());
        }
    };
    tauri::async_runtime::spawn(async move {
        if let Err(e) = axum::serve(listener, router(bridge.clone())).await {
            eprintln!("Planner Agent API stopped: {e}");
        }
        bridge.listening.store(false, Ordering::SeqCst);
    });
    Ok(())
}

fn require_main(window: &WebviewWindow) -> Result<(), &'static str> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("main_window_required")
    }
}

fn configured_grants(path: &Path) -> Result<Vec<Grant>, &'static str> {
    match fs::metadata(path) {
        Ok(_) => read_grants(path).ok_or("invalid_grants_file"),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(_) => Err("grant_storage_unavailable"),
    }
}

#[tauri::command]
pub(crate) fn agent_api_settings(
    window: WebviewWindow,
    bridge: tauri::State<'_, Bridge>,
) -> Result<Value, &'static str> {
    require_main(&window)?;
    let grants = configured_grants(&bridge.config)?;
    let clients: Vec<_> = grants
        .iter()
        .map(|g| json!({ "client": g.client, "allow": g.allow }))
        .collect();
    let _lock = bridge.audit_lock.lock().unwrap();
    let mut audit = Vec::new();
    for path in [bridge.audit.clone(), bridge.audit.with_extension("jsonl.1")] {
        let Ok(file) = fs::File::open(path) else {
            continue;
        };
        let mut raw = Vec::new();
        if file
            .take(AUDIT_LIMIT + MAX_BODY as u64)
            .read_to_end(&mut raw)
            .is_ok()
        {
            audit.extend(
                raw.split(|b| *b == b'\n')
                    .rev()
                    .filter_map(|line| serde_json::from_slice::<Value>(line).ok())
                    .take(50 - audit.len()),
            );
        }
        if audit.len() == 50 {
            break;
        }
    }
    Ok(
        json!({ "clients": clients, "audit": audit, "listening": bridge.listening.load(Ordering::SeqCst) }),
    )
}

#[tauri::command]
pub(crate) async fn agent_api_grant(
    window: WebviewWindow,
    bridge: tauri::State<'_, Bridge>,
    client: String,
    allow: Vec<Operation>,
) -> Result<Value, &'static str> {
    require_main(&window)?;
    if !valid_label(&client) || allow.is_empty() || allow.len() > 6 {
        return Err("invalid_grant");
    }
    let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
    {
        let _lock = bridge.grant_lock.lock().unwrap();
        let mut grants = configured_grants(&bridge.config)?;
        if grants.iter().any(|grant| grant.client == client) {
            return Err("client_already_exists");
        }
        if grants.len() >= 50 {
            return Err("too_many_clients");
        }
        grants.push(Grant {
            client,
            token_sha256: digest(&token),
            allow,
        });
        fs::create_dir_all(bridge.config.parent().ok_or("grant_storage_unavailable")?)
            .map_err(|_| "grant_storage_unavailable")?;
        write_atomic(
            &bridge.config,
            &serde_json::to_vec_pretty(&grants).map_err(|_| "grant_storage_unavailable")?,
        )
        .map_err(|_| "grant_storage_unavailable")?;
    }
    let listening = ensure_listener(bridge.inner().clone()).await.is_ok();
    Ok(json!({ "token": token, "listening": listening }))
}

#[tauri::command]
pub(crate) fn agent_api_revoke(
    window: WebviewWindow,
    bridge: tauri::State<'_, Bridge>,
    client: String,
) -> Result<(), &'static str> {
    require_main(&window)?;
    let _lock = bridge.grant_lock.lock().unwrap();
    let mut grants = configured_grants(&bridge.config)?;
    grants.retain(|grant| grant.client != client);
    write_atomic(
        &bridge.config,
        &serde_json::to_vec_pretty(&grants).map_err(|_| "grant_storage_unavailable")?,
    )
    .map_err(|_| "grant_storage_unavailable")
}

pub(crate) fn start(app: AppHandle) {
    let Ok(config_dir) = app.path().app_config_dir() else {
        return;
    };
    let Ok(audit_dir) = app.path().app_local_data_dir() else {
        return;
    };
    if fs::create_dir_all(&audit_dir).is_err() {
        return;
    }
    let pending = Pending::default();
    app.manage(pending.clone());
    let dispatch_app = app.clone();
    let bridge = Bridge {
        config: config_dir.join("agent-api-grants.json"),
        audit: audit_dir.join("agent-api-audit.jsonl"),
        receipts: audit_dir.join("agent-api-receipts"),
        audit_lock: Arc::default(),
        grant_lock: Arc::default(),
        listening: Arc::default(),
        host: format!("127.0.0.1:{PORT}"),
        single_call: Arc::new(Semaphore::new(1)),
        pending,
        dispatch: Arc::new(move |job| {
            dispatch_app.get_webview_window("main").is_some()
                && dispatch_app
                    .emit_to("main", "planner-agent-call", job)
                    .is_ok()
        }),
    };
    app.manage(bridge.clone());
    if configured_grants(&bridge.config).is_ok_and(|grants| !grants.is_empty()) {
        tauri::async_runtime::spawn(async move {
            if let Err(e) = ensure_listener(bridge).await {
                eprintln!("Planner Agent API unavailable: {e}");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tower::ServiceExt;

    struct TestDir(PathBuf);
    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn fixture() -> (TestDir, Bridge, Arc<AtomicUsize>, String) {
        let dir = TestDir(std::env::temp_dir().join(format!("planner-agent-{}", Uuid::new_v4())));
        fs::create_dir(&dir.0).unwrap();
        let token = "a".repeat(64);
        let config = dir.0.join("grants.json");
        fs::write(
            &config,
            json!([{
                "client": "test-client", "token_sha256": digest(&token),
                "allow": ["list_tasks", "create_task"]
            }])
            .to_string(),
        )
        .unwrap();
        let pending = Pending::default();
        let receiver = pending.clone();
        let dispatched = Arc::new(AtomicUsize::new(0));
        let count = dispatched.clone();
        let bridge = Bridge {
            config,
            audit: dir.0.join("audit.jsonl"),
            receipts: dir.0.join("receipts"),
            audit_lock: Arc::default(),
            grant_lock: Arc::default(),
            listening: Arc::default(),
            host: format!("127.0.0.1:{PORT}"),
            pending,
            single_call: Arc::new(Semaphore::new(1)),
            dispatch: Arc::new(move |job| {
                count.fetch_add(1, Ordering::SeqCst);
                let (id, reply) = receiver.lock().unwrap().take().unwrap();
                assert_eq!(id, job.id.to_string());
                reply
                    .send(JobResult::Ok {
                        data: json!({"id": "synthetic-id"}),
                    })
                    .is_ok()
            }),
        };
        (dir, bridge, dispatched, token)
    }

    fn request(bridge: &Bridge, token: &str, call: Option<Value>, origin: Option<&str>) -> Request {
        let mut b = Request::builder()
            .uri("/v1/agent")
            .method(if call.is_some() { "POST" } else { "GET" })
            .header(header::HOST, &bridge.host)
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(header::CONTENT_TYPE, "application/json");
        if let Some(origin) = origin {
            b = b.header(header::ORIGIN, origin);
        }
        b.body(call.map_or(Body::empty(), |call| Body::from(call.to_string())))
            .unwrap()
    }

    #[test]
    fn checks_token_origin_operation_scope_and_records_only_metadata() {
        tauri::async_runtime::block_on(async {
            let (_dir, bridge, dispatched, token) = fixture();
            let app = router(bridge.clone());
            let create = json!({"operation": "create_task", "arguments": {"title": "synthetic-private-title"}});
            let call = |token: &str, body, origin| {
                app.clone().oneshot(request(&bridge, token, body, origin))
            };
            assert_eq!(
                call(&"b".repeat(64), Some(create.clone()), None)
                    .await
                    .unwrap()
                    .status(),
                StatusCode::UNAUTHORIZED
            );
            assert_eq!(
                call(&token, Some(create.clone()), Some("https://example.test"))
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
            assert_eq!(
                call(&token, Some(json!({"operation":"delete_task"})), None)
                    .await
                    .unwrap()
                    .status(),
                StatusCode::BAD_REQUEST
            );
            assert_eq!(
                call(&token, Some(json!({"operation":"list_journal"})), None)
                    .await
                    .unwrap()
                    .status(),
                StatusCode::FORBIDDEN
            );
            assert_eq!(dispatched.load(Ordering::SeqCst), 0);
            let res = call(&token, None, None).await.unwrap();
            let body: Value =
                serde_json::from_slice(&to_bytes(res.into_body(), MAX_BODY).await.unwrap())
                    .unwrap();
            assert_eq!(body, json!({"operations": ["list_tasks", "create_task"]}));
            assert_eq!(
                call(&token, Some(create.clone()), None)
                    .await
                    .unwrap()
                    .status(),
                StatusCode::OK
            );
            assert_eq!(dispatched.load(Ordering::SeqCst), 1);
            let audit = fs::read_to_string(&bridge.audit).unwrap();
            assert!(!audit.contains("synthetic-private-title"));
            assert!(!audit.contains(&token));
            let entries: Vec<Value> = audit
                .lines()
                .map(|l| serde_json::from_str(l).unwrap())
                .collect();
            assert_eq!(
                entries
                    .iter()
                    .map(|v| v["outcome"].as_str().unwrap())
                    .collect::<Vec<_>>(),
                ["invalid_call", "denied", "started", "ok"]
            );
            assert_eq!(entries[2]["requestId"], entries[3]["requestId"]);
            fs::write(&bridge.config, "[]").unwrap();
            assert_eq!(
                call(&token, Some(create), None).await.unwrap().status(),
                StatusCode::UNAUTHORIZED
            );
        });
    }

    #[test]
    fn refuses_to_dispatch_if_audit_is_unavailable() {
        tauri::async_runtime::block_on(async {
            let (_dir, bridge, dispatched, token) = fixture();
            fs::create_dir(&bridge.audit).unwrap();
            let call = request(
                &bridge,
                &token,
                Some(json!({"operation":"create_task"})),
                None,
            );
            let res = router(bridge.clone()).oneshot(call).await.unwrap();
            assert_eq!(res.status(), StatusCode::SERVICE_UNAVAILABLE);
            assert_eq!(dispatched.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn replay_returns_same_receipt_and_blocks_a_different_payload() {
        tauri::async_runtime::block_on(async {
            let (_dir, bridge, dispatched, token) = fixture();
            let app = router(bridge.clone());
            let call = |title: &str| {
                let mut req = request(
                    &bridge,
                    &token,
                    Some(json!({"operation":"create_task","arguments":{"title":title}})),
                    None,
                );
                req.headers_mut()
                    .insert("idempotency-key", "a-stable-key".parse().unwrap());
                app.clone().oneshot(req)
            };
            let first = call("title").await.unwrap();
            let second = call("title").await.unwrap();
            assert_eq!(first.status(), StatusCode::OK);
            assert_eq!(second.status(), StatusCode::OK);
            let body = |raw: axum::body::Bytes| serde_json::from_slice::<Value>(&raw).unwrap();
            let first = body(to_bytes(first.into_body(), MAX_BODY).await.unwrap());
            let second = body(to_bytes(second.into_body(), MAX_BODY).await.unwrap());
            assert_eq!(first["requestId"], second["requestId"]);
            assert_eq!(second["replayed"], true);
            assert_eq!(
                call("changed").await.unwrap().status(),
                StatusCode::CONFLICT
            );
            assert_eq!(dispatched.load(Ordering::SeqCst), 1);
        });
    }

    #[test]
    fn audit_rolls_over_without_exposing_arguments() {
        let (_dir, bridge, _, _) = fixture();
        let grant = configured_grants(&bridge.config).unwrap().remove(0);
        fs::write(&bridge.audit, vec![b'x'; AUDIT_LIMIT as usize]).unwrap();
        audit(
            &bridge,
            "request",
            &grant,
            Some(Operation::CreateTask),
            "started",
        )
        .unwrap();
        assert_eq!(
            fs::metadata(bridge.audit.with_extension("jsonl.1"))
                .unwrap()
                .len(),
            AUDIT_LIMIT
        );
        assert!(fs::read_to_string(&bridge.audit)
            .unwrap()
            .contains("started"));
    }
}
