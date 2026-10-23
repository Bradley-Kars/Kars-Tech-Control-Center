//! KTS Master Control CLI and MCP server.
//!
//! ```text
//! master-control-cli mcp        # MCP server over stdio (headless, no Tauri app needed)
//! master-control-cli --version
//! ```
//!
//! Exposes Master Control fleet operations as MCP tools. Standalone headless mode:
//! initializes its own AppState (loads servers.json) and calls `master_control_lib`
//! command functions directly — no control channel, no running Tauri app required.
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::io::{BufRead, Write};

use serde_json::{Value, json};

use master_control_lib::AppState;

mod tools;
use tools::{call_tool, tool_definitions};

// ---------------------------------------------------------------------------
// Shared tokio runtime — every command is async; we block_on from the stdio loop.
// ---------------------------------------------------------------------------
fn runtime() -> &'static tokio::runtime::Runtime {
    use std::sync::OnceLock;
    static RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .thread_name("mc-cli")
            .build()
            .expect("tokio runtime")
    })
}

// ---------------------------------------------------------------------------
// MCP protocol (stdio, newline-delimited JSON-RPC 2.0) — deckcraft pattern.
// ---------------------------------------------------------------------------
const PROTOCOL_VERSION: &str = "2025-06-18";
const SUPPORTED_VERSIONS: &[&str] = &[PROTOCOL_VERSION, "2025-03-26", "2024-11-05"];

const PARSE_ERROR: i64 = -32700;
const INVALID_REQUEST: i64 = -32600;
const METHOD_NOT_FOUND: i64 = -32601;
const INVALID_PARAMS: i64 = -32602;

const INSTRUCTIONS: &str = "KTS Master Control — fleet management for the Kars Tech Solutions \
home lab. Devices: Unraid servers, Windows PCs, Galaxy S24 Ultra, ROG Ally, MSI laptop, phones. \
MeshCentral is the PRIMARY transport for reboot/shutdown/shell — never use SSH directly for \
power operations. Typical flow: mc_list_servers to see the fleet → mc_device_status or \
mc_shell_exec for details → mc_reboot/mc_shutdown for power ops. Alerts live in a local \
SQLite db; mc_alert_list/mc_alert_acknowledge manage them. Prometheus metrics are queried \
with mc_prometheus_query. All server IDs are the short ids from servers.json (e.g. \
\"unraid-main\", \"harley\", \"jean\").";

struct McServer {
    state: AppState,
    initialized: bool,
}

fn response(id: Value, result: Value) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "result": result})
}

fn error(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({"jsonrpc": "2.0", "id": id, "error": {"code": code, "message": message.into()}})
}

impl McServer {
    fn new() -> Self {
        Self { state: AppState::new(), initialized: false }
    }

    fn serve(&mut self, input: impl BufRead, mut output: impl Write) -> std::io::Result<()> {
        for line in input.lines() {
            let line = line?;
            if let Some(reply) = self.handle_line(&line) {
                output.write_all(reply.as_bytes())?;
                output.write_all(b"\n")?;
                output.flush()?;
            }
        }
        Ok(())
    }

    fn handle_line(&mut self, line: &str) -> Option<String> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        let reply = match serde_json::from_str::<Value>(line) {
            Ok(msg) => self.handle(msg),
            Err(e) => Some(error(Value::Null, PARSE_ERROR, format!("parse error: {e}"))),
        };
        reply.map(|r| r.to_string())
    }

    fn handle(&mut self, msg: Value) -> Option<Value> {
        let Value::Object(o) = &msg else {
            return Some(error(Value::Null, INVALID_REQUEST, "message must be an object"))
        };
        let id = o.get("id").cloned();
        let Some(method) = o.get("method").and_then(Value::as_str) else {
            if o.contains_key("result") || o.contains_key("error") {
                return None;
            }
            return Some(error(id.unwrap_or(Value::Null), INVALID_REQUEST, "missing `method`"));
        };
        let params = o.get("params").cloned().unwrap_or(Value::Null);
        let Some(id) = id else {
            self.notification(method);
            return None;
        };
        Some(match self.request(method, &params) {
            Ok(r) => response(id, r),
            Err((code, m)) => error(id, code, m),
        })
    }

    fn notification(&mut self, method: &str) {
        match method {
            "notifications/initialized" => self.initialized = true,
            _ => {}
        }
    }

    fn request(&mut self, method: &str, params: &Value) -> Result<Value, (i64, String)> {
        match method {
            "initialize" => {
                let asked =
                    params.get("protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL_VERSION);
                let version =
                    if SUPPORTED_VERSIONS.contains(&asked) { asked } else { PROTOCOL_VERSION };
                Ok(json!({
                    "protocolVersion": version,
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": "master-control",
                        "title": "KTS Master Control",
                        "version": env!("CARGO_PKG_VERSION")
                    },
                    "instructions": INSTRUCTIONS,
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({"tools": tool_definitions()})),
            "tools/call" => {
                let name = params
                    .get("name")
                    .and_then(Value::as_str)
                    .ok_or((INVALID_PARAMS, "missing tool `name`".to_string()))?;
                let args = params.get("arguments").cloned().unwrap_or(Value::Null);
                // call_tool is synchronous: each command block_ons on the shared runtime
                // internally (nested block_on would panic if this were async).
                let result = call_tool(&self.state, name, &args);
                Ok(result.to_value())
            }
            other => Err((METHOD_NOT_FOUND, format!("method not found: {other}"))),
        }
    }
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------
const USAGE: &str = "usage: master-control-cli mcp
       master-control-cli --version";

fn main() -> std::process::ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.first().map(String::as_str) {
        Some("--version" | "-V" | "version") => {
            println!("master-control-cli {}", env!("CARGO_PKG_VERSION"));
            std::process::ExitCode::SUCCESS
        }
        Some("mcp") => {
            let mut server = McServer::new();
            let stdin = std::io::stdin();
            match server.serve(stdin.lock(), std::io::stdout()) {
                Ok(()) => std::process::ExitCode::SUCCESS,
                Err(e) => {
                    eprintln!("master-control-cli: mcp server error: {e}");
                    std::process::ExitCode::FAILURE
                }
            }
        }
        _ => {
            eprintln!("{USAGE}");
            std::process::ExitCode::FAILURE
        }
    }
}
