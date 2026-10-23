//! OpenCode sidecar: spawn `opencode serve` as a child process and talk to its HTTP API.
//!
//! Flow:
//!   1. `opencode_start` spawns `opencode serve --port <p>` on a free port, waits for /global/health
//!   2. `opencode_new_session` POSTs /session → sessionID
//!   3. `opencode_send_message` POSTs /session/:id/message (blocking) → assistant reply
//!   4. `opencode_get_history` GETs /session/:id/message → full history
//!   5. `opencode_stop` kills the sidecar
//!
//! The sidecar lives in AppState.opencode (Arc<Mutex<Option<Sidecar>>>).

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

use crate::AppState;

// ── Sidecar state ─────────────────────────────────────────────────────────────

pub struct Sidecar {
    pub child: Child,
    pub port: u16,
    pub client: reqwest::Client,
}

impl Sidecar {
    pub fn base_url(&self) -> String {
        format!("http://127.0.0.1:{}", self.port)
    }
}

// Extend AppState with an opencode sidecar slot.
// We use a newtype wrapper so we don't have to change AppState's existing fields.
// Actually we just add a field via a trait-free approach: store in AppState directly.
// AppState is in lib.rs; we'll add `opencode` field there.

// ── Public Tauri commands ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct OpencodeStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub pid: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String, // "user" | "assistant" | "tool" | "system"
    pub text: String,
}

#[tauri::command]
pub async fn opencode_start(state: State<'_, AppState>) -> Result<OpencodeStatus, String> {
    // Already running?
    {
        let guard = state.opencode.lock();
        if let Some(sc) = guard.as_ref() {
            return Ok(OpencodeStatus {
                running: true,
                port: Some(sc.port),
                pid: Some(sc.child.id()),
            });
        }
    }

    let port = find_free_port().map_err(|e| format!("no free port: {e}"))?;

    let child = Command::new("opencode")
        .arg("serve")
        .arg("--port")
        .arg(port.to_string())
        .arg("--hostname")
        .arg("127.0.0.1")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to spawn opencode serve: {e}"))?;

    let pid = child.id();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    // Wait for health (up to 8s)
    let base = format!("http://127.0.0.1:{port}");
    let mut ready = false;
    for _ in 0..40 {
        tokio::time::sleep(Duration::from_millis(200)).await;
        match client
            .get(format!("{base}/global/health"))
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                ready = true;
                break;
            }
            _ => continue,
        }
    }

    if !ready {
        // Kill the child we just spawned
        let _ = Command::new("kill")
            .arg("-TERM")
            .arg(pid.to_string())
            .status();
        return Err(format!("opencode serve did not become healthy on port {port} within 8s"));
    }

    let sidecar = Sidecar {
        child,
        port,
        client,
    };
    *state.opencode.lock() = Some(sidecar);

    Ok(OpencodeStatus {
        running: true,
        port: Some(port),
        pid: Some(pid),
    })
}

#[tauri::command]
pub async fn opencode_stop(state: State<'_, AppState>) -> Result<OpencodeStatus, String> {
    let sidecar = state.opencode.lock().take();
    if let Some(mut sc) = sidecar {
        let _ = sc.child.kill();
        let _ = sc.child.wait();
        Ok(OpencodeStatus {
            running: false,
            port: None,
            pid: None,
        })
    } else {
        Ok(OpencodeStatus {
            running: false,
            port: None,
            pid: None,
        })
    }
}

#[tauri::command]
pub async fn opencode_status(state: State<'_, AppState>) -> Result<OpencodeStatus, String> {
    // Extract what we need under the lock, then drop the guard before any await.
    let snapshot = {
        let guard = state.opencode.lock();
        guard.as_ref().map(|sc| {
            let client = sc.client.clone();
            let base = sc.base_url();
            let pid = sc.child.id();
            (client, base, pid)
        })
    };

    if let Some((client, base, pid)) = snapshot {
        let healthy = client
            .get(format!("{base}/global/health"))
            .timeout(Duration::from_secs(3))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false);

        let running = healthy;
        Ok(OpencodeStatus {
            running,
            port: Some(
                base
                    .rsplit(':')
                    .next()
                    .and_then(|p| p.parse().ok())
                    .unwrap_or(0),
            ),
            pid: Some(pid),
        })
    } else {
        Ok(OpencodeStatus {
            running: false,
            port: None,
            pid: None,
        })
    }
}

#[tauri::command]
pub async fn opencode_new_session(
    state: State<'_, AppState>,
    title: Option<String>,
) -> Result<String, String> {
    let (client, base) = {
        let guard = state.opencode.lock();
        let sc = guard.as_ref().ok_or("opencode server not running — call opencode_start first")?;
        (sc.client.clone(), sc.base_url())
    };

    let body = json!({ "title": title.unwrap_or_else(|| "Master Control Chat".into()) });
    let resp = client
        .post(format!("{base}/session"))
        .json(&body)
        .timeout(Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("create session: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("create session HTTP {status}: {text}"));
    }

    let session: Value = resp.json().await.map_err(|e| format!("parse session: {e}"))?;
    let id = session
        .get("id")
        .and_then(Value::as_str)
        .ok_or("session response missing id")?
        .to_string();
    Ok(id)
}

#[tauri::command]
pub async fn opencode_send_message(
    state: State<'_, AppState>,
    session_id: String,
    message: String,
    agent: Option<String>,
) -> Result<Vec<ChatMessage>, String> {
    let (client, base) = {
        let guard = state.opencode.lock();
        let sc = guard.as_ref().ok_or("opencode server not running — call opencode_start first")?;
        (sc.client.clone(), sc.base_url())
    };

    let body = json!({
        "parts": [{ "type": "text", "text": message }],
        "agent": agent.unwrap_or_else(|| "hermes".into()),
    });

    let resp = client
        .post(format!("{base}/session/{}/message", session_id))
        .json(&body)
        .timeout(Duration::from_secs(120)) // LLM responses can be slow
        .send()
        .await
        .map_err(|e| format!("send message: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("send message HTTP {status}: {text}"));
    }

    let msg: Value = resp.json().await.map_err(|e| format!("parse response: {e}"))?;
    Ok(extract_messages(&msg))
}

#[tauri::command]
pub async fn opencode_get_history(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<Vec<ChatMessage>, String> {
    let (client, base) = {
        let guard = state.opencode.lock();
        let sc = guard.as_ref().ok_or("opencode server not running — call opencode_start first")?;
        (sc.client.clone(), sc.base_url())
    };

    let resp = client
        .get(format!("{base}/session/{}/message", session_id))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("get history: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("get history HTTP {status}: {text}"));
    }

    let history: Value = resp.json().await.map_err(|e| format!("parse history: {e}"))?;
    Ok(flatten_history(&history))
}

#[tauri::command]
pub async fn opencode_abort(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<bool, String> {
    let (client, base) = {
        let guard = state.opencode.lock();
        let sc = guard.as_ref().ok_or("opencode server not running")?;
        (sc.client.clone(), sc.base_url())
    };

    let resp = client
        .post(format!("{base}/session/{}/abort", session_id))
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .map_err(|e| format!("abort: {e}"))?;

    Ok(resp.status().is_success())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

fn find_free_port() -> std::io::Result<u16> {
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

/// Extract chat messages from a single `{ info, parts }` response
/// (the shape returned by POST /session/:id/message).
fn extract_messages(msg: &Value) -> Vec<ChatMessage> {
    let mut out = Vec::new();

    // The user message (echoed back in info)
    if let Some(info) = msg.get("info") {
        let role = info
            .get("role")
            .and_then(Value::as_str)
            .unwrap_or("unknown")
            .to_string();
        // Extract text from parts
        if let Some(parts) = msg.get("parts").and_then(Value::as_array) {
            let text = parts
                .iter()
                .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
                .filter_map(|p| p.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("");
            if !text.is_empty() {
                out.push(ChatMessage { role, text });
            }
        }
    }

    out
}

/// Flatten a history array (list of `{ info, parts }`) into ChatMessage list.
fn flatten_history(history: &Value) -> Vec<ChatMessage> {
    let mut out = Vec::new();
    if let Some(items) = history.as_array() {
        for item in items {
            let role = item
                .pointer("/info/role")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
                .to_string();
            if let Some(parts) = item.get("parts").and_then(Value::as_array) {
                let text = parts
                    .iter()
                    .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
                    .filter_map(|p| p.get("text").and_then(Value::as_str))
                    .collect::<Vec<_>>()
                    .join("");
                if !text.is_empty() {
                    out.push(ChatMessage { role, text });
                }
            }
        }
    }
    out
}
