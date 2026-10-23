//! MCP tool definitions and implementations for Master Control fleet operations.

use serde_json::{Value, json};

use master_control_lib::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn string(desc: &str) -> Value {
    json!({"type": "string", "description": desc})
}
fn int(desc: &str) -> Value {
    json!({"type": "integer", "description": desc})
}
fn boolean(desc: &str) -> Value {
    json!({"type": "boolean", "description": desc})
}
fn obj(props: Value, required: &[&str]) -> Value {
    let mut o = json!({"type": "object", "properties": props});
    if !required.is_empty() {
        o["required"] = json!(required);
    }
    o
}
fn tool(name: &str, title: &str, desc: &str, schema: Value, read_only: bool) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": desc,
        "inputSchema": schema,
        "annotations": {"title": title, "readOnlyHint": read_only, "openWorldHint": true}
    })
}

/// MCP tool call result: content blocks + isError flag.
#[derive(Clone, Debug)]
pub struct ToolResult {
    pub content: Vec<Value>,
    pub is_error: bool,
}

impl ToolResult {
    pub fn text(t: impl Into<String>) -> Self {
        Self { content: vec![json!({"type": "text", "text": t.into()})], is_error: false }
    }
    pub fn json(v: &Value) -> Self {
        Self::text(serde_json::to_string_pretty(v).unwrap_or_default())
    }
    pub fn error(t: impl Into<String>) -> Self {
        Self { content: vec![json!({"type": "text", "text": t.into()})], is_error: true }
    }
    pub fn to_value(&self) -> Value {
        json!({"content": self.content, "isError": self.is_error})
    }
}

/// Run an async command inside the shared runtime and map Result<T, String> → ToolResult.
macro_rules! run {
    ($fut:expr) => {{
        let rt = super::runtime();
        match rt.block_on($fut) {
            Ok(v) => ToolResult::json(&serde_json::to_value(&v).unwrap_or(Value::Null)),
            Err(e) => ToolResult::error(e),
        }
    }};
}

/// Transmute `&AppState` → `tauri::State<'_, AppState>`, call the async command with it,
/// and block_on inside the expansion (so State and the future both live on this stack frame).
/// Must be a macro: `async fn` futures capture the State lifetime in their type, which a
/// `FnOnce(State<'_>) -> impl Future` bound cannot express.
/// Safe: State is a transparent newtype around `&T`; lifetime bounded by `$state`.
macro_rules! run_with_state {
    ($state:expr, $call:expr) => {{
        #[allow(clippy::missing_transmute_annotations)]
        let __s: tauri::State<'_, AppState> = unsafe { std::mem::transmute($state) };
        let __fut = $call(__s);
        let __rt = super::runtime();
        match __rt.block_on(__fut) {
            Ok(v) => ToolResult::json(&serde_json::to_value(&v).unwrap_or(Value::Null)),
            Err(e) => ToolResult::error(e),
        }
    }};
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

pub fn tool_definitions() -> Vec<Value> {
    vec![
        // ---- Fleet overview ----
        tool(
            "mc_list_servers",
            "List servers",
            "List every configured server with id, name, hostname, device_type, and MeshCentral status (online/offline). Use the `id` field as server_id for other tools.",
            obj(json!({}), &[]),
            true,
        ),
        tool(
            "mc_list_devices",
            "List MeshCentral devices",
            "List all devices known to MeshCentral: id, name, group, connection state (0=offline, 1=online, 2=connected), platform, IP.",
            obj(json!({}), &[]),
            true,
        ),
        tool(
            "mc_fleet_stats",
            "Fleet statistics",
            "Aggregate fleet stats: server count, MeshCentral online/offline counts, device types.",
            obj(json!({}), &[]),
            true,
        ),
        tool(
            "mc_sync_fleet",
            "Sync MeshCentral fleet",
            "Sync MeshCentral device inventory into servers.json. Matches devices by hostname/IP, enrolls new ones. Returns counts of found/matched/new/updated.",
            obj(json!({}), &[]),
            false,
        ),
        // ---- Device operations ----
        tool(
            "mc_device_status",
            "Device status",
            "Get live status of a MeshCentral device: connected, CPU usage, memory usage, uptime, data source.",
            obj(json!({"device_id": string("MeshCentral device id (from mc_list_devices or servers.json meshcentral_device_id)")}), &["device_id"]),
            true,
        ),
        tool(
            "mc_shell_exec",
            "Execute shell command",
            "Execute a shell command on a server via MeshCentral. Returns stdout/stderr and exit code. server_id is the short id from mc_list_servers.",
            obj(json!({
                "server_id": string("Server id (e.g. \"unraid-main\")"),
                "command": string("Shell command to execute"),
                "timeout_secs": int("Timeout in seconds (default 30)")
            }), &["server_id", "command"]),
            false,
        ),
        tool(
            "mc_shell_fleet",
            "Execute shell on multiple servers",
            "Execute the same shell command on several servers in parallel via MeshCentral. Returns per-server results.",
            obj(json!({
                "server_ids": {"type": "array", "items": string("Server id"), "description": "List of server ids"},
                "command": string("Shell command"),
                "timeout_secs": int("Timeout in seconds (default 30)")
            }), &["server_ids", "command"]),
            false,
        ),
        tool(
            "mc_system_stats",
            "System stats",
            "Get detailed system stats for a server (Unraid): CPU, memory, disks, network, uptime. Runs locally via GraphQL, not SSH.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            true,
        ),
        // ---- Power (MeshCentral PRIMARY — never SSH for reboot/shutdown) ----
        tool(
            "mc_reboot",
            "Reboot server",
            "Reboot a server via MeshCentral. This is the PRIMARY reboot method — do not use SSH.",
            obj(json!({"server_id": string("Server id to reboot")}), &["server_id"]),
            false,
        ),
        tool(
            "mc_shutdown",
            "Shutdown server",
            "Shutdown a server via MeshCentral. This is the PRIMARY shutdown method — do not use SSH.",
            obj(json!({"server_id": string("Server id to shutdown")}), &["server_id"]),
            false,
        ),
        // ---- Docker ----
        tool(
            "mc_docker_containers",
            "List Docker containers",
            "List Docker containers on a server via MeshCentral: name, image, state, status.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            true,
        ),
        tool(
            "mc_docker_start",
            "Start Docker container",
            "Start a Docker container on a server via MeshCentral.",
            obj(json!({"server_id": string("Server id"), "container": string("Container name or id")}), &["server_id", "container"]),
            false,
        ),
        tool(
            "mc_docker_stop",
            "Stop Docker container",
            "Stop a Docker container on a server via MeshCentral.",
            obj(json!({"server_id": string("Server id"), "container": string("Container name or id")}), &["server_id", "container"]),
            false,
        ),
        tool(
            "mc_docker_restart",
            "Restart Docker container",
            "Restart a Docker container on a server via MeshCentral.",
            obj(json!({"server_id": string("Server id"), "container": string("Container name or id")}), &["server_id", "container"]),
            false,
        ),
        // ---- Alerts ----
        tool(
            "mc_alert_list",
            "List alerts",
            "List alerts from the local alert store. Optional filters: severity (critical|warning|info), device_id, acknowledged (true/false).",
            obj(json!({
                "severity": string("Filter: critical, warning, or info"),
                "device_id": string("Filter by device id"),
                "acknowledged": boolean("Filter by acknowledged state")
            }), &[]),
            true,
        ),
        tool(
            "mc_alert_get",
            "Get alert",
            "Get a single alert by id.",
            obj(json!({"id": int("Alert id")}), &["id"]),
            true,
        ),
        tool(
            "mc_alert_create",
            "Create alert",
            "Create a new alert. severity: critical|warning|info. source identifies the producer (e.g. \"manual\", \"meshcentral\", \"prometheus\").",
            obj(json!({
                "severity": string("critical, warning, or info"),
                "title": string("Alert title"),
                "message": string("Alert message"),
                "device_id": string("Optional device id"),
                "source": string("Alert source (e.g. \"manual\")"),
                "auto_ack_rule": string("Optional JSON auto-ack rule")
            }), &["severity", "title", "message", "source"]),
            false,
        ),
        tool(
            "mc_alert_acknowledge",
            "Acknowledge alert",
            "Acknowledge a single alert by id.",
            obj(json!({"id": int("Alert id"), "acknowledged_by": string("Who acknowledged (e.g. \"hermes\")")}), &["id", "acknowledged_by"]),
            false,
        ),
        tool(
            "mc_alert_acknowledge_all",
            "Acknowledge all matching alerts",
            "Acknowledge all alerts matching optional filters (severity, device_id). Returns count acknowledged.",
            obj(json!({
                "severity": string("Filter: critical, warning, or info"),
                "device_id": string("Filter by device id"),
                "acknowledged_by": string("Who acknowledged")
            }), &["acknowledged_by"]),
            false,
        ),
        tool(
            "mc_alert_auto_ack",
            "Run auto-acknowledgment rules",
            "Run the auto-acknowledgment rules (auto-ack info alerts older than 1 hour). Returns count auto-acknowledged.",
            obj(json!({}), &[]),
            false,
        ),
        // ---- Prometheus / Monitoring ----
        tool(
            "mc_prometheus_health",
            "Prometheus health",
            "Check if a Prometheus server is reachable and ready. Returns true/false.",
            obj(json!({"base_url": string("Prometheus base URL (e.g. http://localhost:9090)")}), &["base_url"]),
            true,
        ),
        tool(
            "mc_prometheus_query",
            "Prometheus range query",
            "Run a PromQL range query. start/end are RFC3339 or unix timestamps; step is a duration string (e.g. \"1m\").",
            obj(json!({
                "base_url": string("Prometheus base URL"),
                "query": string("PromQL query"),
                "start": string("Start time (RFC3339 or unix seconds)"),
                "end": string("End time"),
                "step": string("Step duration (e.g. \"1m\", \"15s\")")
            }), &["base_url", "query", "start", "end", "step"]),
            true,
        ),
        // ---- Services ----
        tool(
            "mc_adguard_status",
            "AdGuard status",
            "Get AdGuard Home DNS protection status for a server.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            true,
        ),
        tool(
            "mc_adguard_enable",
            "Enable AdGuard protection",
            "Enable AdGuard DNS protection on a server.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            false,
        ),
        tool(
            "mc_adguard_disable",
            "Disable AdGuard protection",
            "Disable AdGuard DNS protection on a server.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            false,
        ),
        tool(
            "mc_tailscale_peers",
            "Tailscale peers",
            "List Tailscale peers on a server (via SSH tailscale status).",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            true,
        ),
        tool(
            "mc_array_info",
            "Unraid array info",
            "Get Unraid array status: drives, health, capacity, parity.",
            obj(json!({"server_id": string("Server id")}), &["server_id"]),
            true,
        ),
        tool(
            "mc_test_connection",
            "Test server connection",
            "Test SSH and service connectivity to a server. Takes a full server config object (from mc_list_servers).",
            obj(json!({"config": {"type": "object", "description": "ServerConfig object (from mc_list_servers)"} }), &["config"]),
            true,
        ),
    ]
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

pub fn call_tool(state: &AppState, name: &str, args: &Value) -> ToolResult {
    use master_control_lib::commands as c;

    let str_arg = |key: &str| -> Result<String, ToolResult> {
        args.get(key).and_then(Value::as_str).map(String::from)
            .ok_or_else(|| ToolResult::error(format!("missing required argument `{key}`")))
    };
    let opt_str = |key: &str| -> Option<String> {
        args.get(key).and_then(Value::as_str).map(String::from)
    };
    let opt_u64 = |key: &str| -> Option<u64> {
        args.get(key).and_then(Value::as_u64)
    };
    let opt_bool = |key: &str| -> Option<bool> {
        args.get(key).and_then(Value::as_bool)
    };

    match name {
        // ---- Fleet overview ----
        "mc_list_servers" => run_with_state!(state, |s| c::get_servers(s)),

        "mc_list_devices" => run!(c::meshcentral_list_devices()),

        "mc_fleet_stats" => {
            let servers = master_control_lib::config::load_servers();
            let total = servers.len();
            let mc_online = servers.iter().filter(|s| s.meshcentral_status.as_deref() == Some("online")).count();
            let mc_offline = servers.iter().filter(|s| s.meshcentral_status.as_deref() == Some("offline")).count();
            let types: std::collections::HashMap<String, usize> = servers
                .iter()
                .map(|s| format!("{:?}", s.device_type))
                .fold(std::collections::HashMap::new(), |mut acc, t| {
                    *acc.entry(t).or_insert(0) += 1;
                    acc
                });
            ToolResult::json(&json!({
                "total_servers": total,
                "meshcentral_online": mc_online,
                "meshcentral_offline": mc_offline,
                "device_types": types,
                "servers": servers.iter().map(|s| json!({
                    "id": s.id,
                    "name": s.name,
                    "hostname": s.hostname,
                    "device_type": format!("{:?}", s.device_type),
                    "meshcentral_status": s.meshcentral_status,
                })).collect::<Vec<_>>(),
            }))
        }

        "mc_sync_fleet" => {
            let mut local = master_control_lib::config::load_servers();
            let rt = super::runtime();
            match rt.block_on(c::meshcentral_sync_fleet_core(&mut local)) {
                Ok(r) => {
                    master_control_lib::config::save_servers(&local);
                    *state.servers.lock() = local;
                    ToolResult::json(&serde_json::to_value(&r).unwrap_or(Value::Null))
                }
                Err(e) => ToolResult::error(e),
            }
        }

        // ---- Device operations ----
        "mc_device_status" => {
            let device_id = match str_arg("device_id") { Ok(v) => v, Err(e) => return e };
            run!(c::meshcentral_get_device_status(device_id))
        }

        "mc_shell_exec" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            let command = match str_arg("command") { Ok(v) => v, Err(e) => return e };
            let timeout = opt_u64("timeout_secs");
            run_with_state!(state, |s| c::meshcentral_shell_exec(s, server_id, command, timeout))
        }

        "mc_shell_fleet" => {
            let server_ids = match args.get("server_ids").and_then(Value::as_array) {
                Some(arr) => arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>(),
                None => return ToolResult::error("missing required argument `server_ids`"),
            };
            let command = match str_arg("command") { Ok(v) => v, Err(e) => return e };
            let timeout = opt_u64("timeout_secs");
            run_with_state!(state, |s| c::meshcentral_shell_fleet(s, server_ids, command, timeout))
        }

        "mc_system_stats" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::get_system_stats(s, server_id))
        }

        // ---- Power ----
        "mc_reboot" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_reboot(s, server_id))
        }
        "mc_shutdown" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_shutdown(s, server_id))
        }

        // ---- Docker ----
        "mc_docker_containers" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_docker_containers(s, server_id))
        }
        "mc_docker_start" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            let container = match str_arg("container") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_docker_start(s, server_id, container))
        }
        "mc_docker_stop" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            let container = match str_arg("container") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_docker_stop(s, server_id, container))
        }
        "mc_docker_restart" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            let container = match str_arg("container") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::meshcentral_docker_restart(s, server_id, container))
        }

        // ---- Alerts ----
        "mc_alert_list" => {
            let filter = {
                let mut f = master_control_lib::commands::AlertFilter::default();
                if let Some(sev) = opt_str("severity") {
                    f.severity = Some(sev);
                }
                if let Some(dev) = opt_str("device_id") {
                    f.device_id = Some(dev);
                }
                if let Some(ack) = opt_bool("acknowledged") {
                    f.acknowledged = Some(ack);
                }
                f
            };
            run!(c::alert_list(Some(filter)))
        }

        "mc_alert_get" => {
            let id = match args.get("id").and_then(Value::as_i64) {
                Some(v) => v,
                None => return ToolResult::error("missing required argument `id`"),
            };
            run!(c::alert_get(id))
        }

        "mc_alert_create" => {
            let severity = match str_arg("severity") { Ok(v) => v, Err(e) => return e };
            let title = match str_arg("title") { Ok(v) => v, Err(e) => return e };
            let message = match str_arg("message") { Ok(v) => v, Err(e) => return e };
            let device_id = opt_str("device_id");
            let source = match str_arg("source") { Ok(v) => v, Err(e) => return e };
            let auto_ack_rule = opt_str("auto_ack_rule");
            run!(c::alert_create(severity, title, message, device_id, source, auto_ack_rule))
        }

        "mc_alert_acknowledge" => {
            let id = match args.get("id").and_then(Value::as_i64) {
                Some(v) => v,
                None => return ToolResult::error("missing required argument `id`"),
            };
            let by = match str_arg("acknowledged_by") { Ok(v) => v, Err(e) => return e };
            run!(c::alert_acknowledge(id, by))
        }

        "mc_alert_acknowledge_all" => {
            let by = match str_arg("acknowledged_by") { Ok(v) => v, Err(e) => return e };
            let device_id = opt_str("device_id");
            let severity = opt_str("severity");
            // alert_acknowledge_all takes device_id + acknowledged_by;
            // severity filter is applied by first listing then acknowledging each.
            if let Some(sev) = severity {
                let filter = {
                    let mut f = master_control_lib::commands::AlertFilter::default();
                    f.severity = Some(sev);
                    f.device_id = device_id.clone();
                    f.acknowledged = Some(false);
                    f
                };
                let rt = super::runtime();
                match rt.block_on(c::alert_list(Some(filter))) {
                    Ok(alerts) => {
                        let mut count = 0i64;
                        for a in alerts {
                            if let Some(id) = a.id {
                                if rt.block_on(c::alert_acknowledge(id, by.clone())).is_ok() {
                                    count += 1;
                                }
                            }
                        }
                        ToolResult::json(&json!({"acknowledged": count}))
                    }
                    Err(e) => ToolResult::error(e),
                }
            } else {
                run!(c::alert_acknowledge_all(device_id, by))
            }
        }

        "mc_alert_auto_ack" => run!(c::alert_auto_ack_run()),

        // ---- Prometheus ----
        "mc_prometheus_health" => {
            let base_url = match str_arg("base_url") { Ok(v) => v, Err(e) => return e };
            run!(c::prometheus_health(base_url))
        }

        "mc_prometheus_query" => {
            let base_url = match str_arg("base_url") { Ok(v) => v, Err(e) => return e };
            let query = match str_arg("query") { Ok(v) => v, Err(e) => return e };
            let start = match str_arg("start") { Ok(v) => v, Err(e) => return e };
            let end = match str_arg("end") { Ok(v) => v, Err(e) => return e };
            let step = match str_arg("step") { Ok(v) => v, Err(e) => return e };
            run!(c::prom_query_range(base_url, query, start, end, step))
        }

        // ---- Services ----
        "mc_adguard_status" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::get_adguard_status(s, server_id))
        }
        "mc_adguard_enable" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::adguard_enable(s, server_id))
        }
        "mc_adguard_disable" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::adguard_disable(s, server_id))
        }
        "mc_tailscale_peers" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::get_tailscale_peers(s, server_id))
        }
        "mc_array_info" => {
            let server_id = match str_arg("server_id") { Ok(v) => v, Err(e) => return e };
            run_with_state!(state, |s| c::get_array_info(s, server_id))
        }
        "mc_test_connection" => {
            let config: master_control_lib::config::ServerConfig =
                match serde_json::from_value(args.get("config").cloned().unwrap_or(Value::Null)) {
                    Ok(v) => v,
                    Err(e) => return ToolResult::error(format!("bad config object: {e}")),
                };
            run!(c::test_connection(config))
        }

        other => ToolResult::error(format!("unknown tool: {other}")),
    }
}
