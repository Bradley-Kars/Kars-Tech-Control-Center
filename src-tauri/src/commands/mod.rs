use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::process::Command;
use tauri::State;

use crate::config::{DeviceType, MeshCentralConfig, ServerConfig};
use crate::graphql::GraphQLClient;
use crate::linux_client::{LinuxClient, LinuxConfig};
use crate::meshcentral::{
    BatchCommand, BatchResult, DeviceStatus, EnrollmentInfo, MeshCentralClient, MeshCentralTransport,
    MeshDevice, MeshSystemStats, RemoteFileInfo, RemoteProcess, ShellResult, SyncResult,
};
use crate::parsers::nvidia;
use crate::parsers::smart;
use crate::services::{
    AdGuardClientWrapper, AdGuardConfig, HomeAssistantClient, HomeAssistantConfig,
    KdeConnectClient, KdeConnectConfig, LidarrClient, LidarrConfig, MySpeedClient, MySpeedConfig,
    NextcloudClient, NextcloudConfig, PhoneClient, PhoneConfig,
};
use crate::ssh::SshConnection;
use crate::AppState;

pub mod terminal;
pub mod opencode_chat;
pub mod ticketing;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServiceTestResults {
    pub graphql: bool,
    pub nextcloud: bool,
    pub lidarr: bool,
    pub homeassistant: bool,
    pub myspeed: bool,
    pub adguard: bool,
    pub phone: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
    pub hostname: String,
    pub os: String,
    pub services: ServiceTestResults,
}

fn make_graphql(
    state: &AppState,
    server_id: &str,
) -> Result<(GraphQLClient, Option<String>, ServerConfig), String> {
    let servers = state.servers.lock();
    let config = servers
        .iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| format!("Server {} not found", server_id))?;
    let api = GraphQLClient::new(&config.hostname).map_err(|e| e.to_string())?;
    Ok((api, config.api_key.clone(), config.clone()))
}

fn make_ssh(config: &ServerConfig) -> Result<SshConnection, String> {
    SshConnection::connect(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_connection(config: ServerConfig) -> Result<TestConnectionResult, String> {
    let mut services = ServiceTestResults::default();

    // Test connectivity: GraphQL for Unraid servers, SSH for everything else
    let (success, message, hostname, os) =
        if config.device_type == crate::config::DeviceType::Unraid {
            let api = GraphQLClient::new(&config.hostname).map_err(|e| e.to_string())?;
            match api
                .query(
                    r#"{ info { os { hostname distro } } }"#,
                    config.api_key.as_deref(),
                )
                .await
            {
                Ok(data) => {
                    let hostname = data
                        .pointer("/info/os/hostname")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown")
                        .to_string();
                    let os = data
                        .pointer("/info/os/distro")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unraid")
                        .to_string();
                    (true, format!("Connected to {}", hostname), hostname, os)
                }
                Err(e) => (
                    false,
                    format!("GraphQL connection failed: {}", e),
                    "unknown".to_string(),
                    "Unraid".to_string(),
                ),
            }
        } else {
            match SshConnection::connect(&config) {
                Ok(conn) => {
                    let hostname = conn
                        .exec("hostname")
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|_| config.hostname.clone());
                    let os = conn
                        .exec("uname -r")
                        .map(|s| s.trim().to_string())
                        .unwrap_or_else(|_| "unknown".to_string());
                    (true, format!("Connected to {}", hostname), hostname, os)
                }
                Err(e) => (
                    false,
                    format!("SSH connection failed: {}", e),
                    "unknown".to_string(),
                    "unknown".to_string(),
                ),
            }
        };

    // Test Nextcloud
    if let (Some(user), Some(pass)) = (
        &config.service_keys.nextcloud_user,
        &config.service_keys.nextcloud_pass,
    ) {
        let nc_config = NextcloudConfig {
            base_url: format!("https://{}:4443", config.hostname),
            username: user.clone(),
            password: pass.clone(),
        };
        if let Ok(client) = NextcloudClient::new(nc_config) {
            if client.get_server_info().await.is_ok() {
                services.nextcloud = true;
            }
        }
    }

    // Test Lidarr
    if let Some(api_key) = &config.service_keys.lidarr_api_key {
        let lidarr_config = LidarrConfig {
            base_url: format!("http://{}:8686", config.hostname),
            api_key: api_key.clone(),
        };
        if let Ok(client) = LidarrClient::new(lidarr_config) {
            if client.get_system_status().await.is_ok() {
                services.lidarr = true;
            }
        }
    }

    // Test Home Assistant
    if let Some(token) = &config.service_keys.homeassistant_token {
        let ha_config = HomeAssistantConfig {
            base_url: format!("http://{}:8123", config.hostname),
            token: token.clone(),
        };
        if let Ok(client) = HomeAssistantClient::new(ha_config) {
            if client.get_states().await.is_ok() {
                services.homeassistant = true;
            }
        }
    }

    // Test MySpeed
    let ms_config = MySpeedConfig {
        db_path: config
            .service_keys
            .myspeed_db_path
            .clone()
            .unwrap_or("/mnt/user/appdata/myspeed/storage.db".to_string()),
        api_url: config
            .service_keys
            .myspeed_url
            .clone()
            .unwrap_or(format!("http://{}:5216", config.hostname)),
    };
    if let Ok(client) = MySpeedClient::new(ms_config, config.clone()) {
        if client.get_summary(Some(1)).await.is_ok() {
            services.myspeed = true;
        }
    }

    // Test AdGuard
    if let (Some(user), Some(pass)) = (
        &config.service_keys.adguard_user,
        &config.service_keys.adguard_pass,
    ) {
        let ag_config = AdGuardConfig {
            base_url: config
                .service_keys
                .adguard_url
                .clone()
                .unwrap_or("https://adguard.tailf6d3b4.ts.net:8443".to_string()),
            username: user.clone(),
            password: pass.clone(),
        };
        if let Ok(client) = AdGuardClientWrapper::new(ag_config) {
            if client.get_status().await.is_ok() {
                services.adguard = true;
            }
        }
    }

    // Test Phone (ADB)
    if config.device_type == crate::config::DeviceType::Phone {
        let phone_config = PhoneConfig {
            hostname: config.hostname.clone(),
            port: config.port,
            adb_serial: config.service_keys.phone_adb_serial.clone(),
        };
        if let Ok(client) = PhoneClient::new(phone_config) {
            if client.connect().await.is_ok() && client.is_alive().await {
                services.phone = true;
            }
        }
    }

    Ok(TestConnectionResult {
        success,
        message,
        hostname,
        os,
        services,
    })
}

#[tauri::command]
pub async fn save_server(state: State<'_, AppState>, config: ServerConfig) -> Result<(), String> {
    let mut servers = state.servers.lock();
    if let Some(existing) = servers.iter_mut().find(|s| s.id == config.id) {
        *existing = config;
    } else {
        servers.push(config);
    }
    crate::config::save_servers(&servers);
    Ok(())
}

#[tauri::command]
pub async fn remove_server(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut servers = state.servers.lock();
    servers.retain(|s| s.id != id);
    crate::config::save_servers(&servers);
    Ok(())
}

#[tauri::command]
pub async fn get_servers(state: State<'_, AppState>) -> Result<Vec<ServerConfig>, String> {
    let servers = state.servers.lock();
    Ok(servers.clone())
}

#[tauri::command]
pub async fn get_system_stats(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    // Skip GraphQL for non-Unraid servers (phones, etc.)
    {
        let servers = state.servers.lock();
        if let Some(config) = servers.iter().find(|s| s.id == server_id) {
            if config.device_type != DeviceType::Unraid {
                return Ok(json!({}));
            }
        }
    }

    let (api, api_key, _) = make_graphql(&state, &server_id)?;

    let query = r#"{
        metrics {
            cpu { percentTotal }
            memory { total used free percentTotal swapTotal swapUsed }
            temperature { sensors { name type current { value unit } } summary { average hottest { name current { value } } } }
        }
        systemTime { timeZone }
        info {
            os { hostname kernel release arch uptime }
            cpu { manufacturer brand speed cores threads }
            system { manufacturer model }
        }
        array { state }
    }"#;

    match api.query(query, api_key.as_deref()).await {
        Ok(data) => {
            let metrics = data.pointer("/metrics").cloned().unwrap_or(json!({}));
            let info = data.pointer("/info").cloned().unwrap_or(json!({}));
            let sys_time = data.pointer("/systemTime").cloned().unwrap_or(json!({}));
            let array_state = data
                .pointer("/array/state")
                .and_then(|v| v.as_str())
                .unwrap_or("UNKNOWN")
                .to_string();

            let mut result = json!({});
            if let Some(obj) = result.as_object_mut() {
                // CPU
                obj.insert(
                    "cpu_usage".into(),
                    metrics
                        .pointer("/cpu/percentTotal")
                        .cloned()
                        .unwrap_or(json!(0.0)),
                );
                obj.insert(
                    "cpu_cores".into(),
                    info.pointer("/cpu/cores").cloned().unwrap_or(json!(1)),
                );
                obj.insert(
                    "cpu_threads".into(),
                    info.pointer("/cpu/threads").cloned().unwrap_or(json!(1)),
                );
                obj.insert(
                    "cpu_brand".into(),
                    info.pointer("/cpu/brand").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "cpu_speed".into(),
                    info.pointer("/cpu/speed").cloned().unwrap_or(json!(0.0)),
                );

                // Memory
                obj.insert(
                    "memory_total_mb".into(),
                    json!(
                        metrics
                            .pointer("/memory/total")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0)
                            / (1024.0 * 1024.0)
                    ),
                );
                obj.insert(
                    "memory_used_mb".into(),
                    json!(
                        metrics
                            .pointer("/memory/used")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0)
                            / (1024.0 * 1024.0)
                    ),
                );
                obj.insert(
                    "memory_free_mb".into(),
                    json!(
                        metrics
                            .pointer("/memory/free")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0)
                            / (1024.0 * 1024.0)
                    ),
                );
                obj.insert(
                    "memory_usage_pct".into(),
                    metrics
                        .pointer("/memory/percentTotal")
                        .cloned()
                        .unwrap_or(json!(0.0)),
                );
                obj.insert(
                    "memory_total_bytes".into(),
                    metrics
                        .pointer("/memory/total")
                        .cloned()
                        .unwrap_or(json!(0)),
                );
                obj.insert(
                    "memory_used_bytes".into(),
                    metrics.pointer("/memory/used").cloned().unwrap_or(json!(0)),
                );
                obj.insert(
                    "swap_total".into(),
                    metrics
                        .pointer("/memory/swapTotal")
                        .cloned()
                        .unwrap_or(json!(0)),
                );
                obj.insert(
                    "swap_used".into(),
                    metrics
                        .pointer("/memory/swapUsed")
                        .cloned()
                        .unwrap_or(json!(0)),
                );

                // System info
                obj.insert(
                    "hostname".into(),
                    info.pointer("/os/hostname").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "kernel".into(),
                    info.pointer("/os/kernel").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "os_release".into(),
                    info.pointer("/os/release").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "arch".into(),
                    info.pointer("/os/arch").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "uptime".into(),
                    info.pointer("/os/uptime").cloned().unwrap_or(json!("")),
                );
                obj.insert(
                    "system_manufacturer".into(),
                    info.pointer("/system/manufacturer")
                        .cloned()
                        .unwrap_or(json!("")),
                );
                obj.insert(
                    "system_model".into(),
                    info.pointer("/system/model").cloned().unwrap_or(json!("")),
                );

                // Timezone
                obj.insert(
                    "timezone".into(),
                    sys_time.pointer("/timeZone").cloned().unwrap_or(json!("")),
                );

                // Temperature
                obj.insert(
                    "temp_avg".into(),
                    metrics
                        .pointer("/temperature/summary/average")
                        .cloned()
                        .unwrap_or(json!(0.0)),
                );
                obj.insert(
                    "temp_hottest".into(),
                    metrics
                        .pointer("/temperature/summary/hottest/name")
                        .cloned()
                        .unwrap_or(json!("")),
                );
                obj.insert(
                    "temp_hottest_value".into(),
                    metrics
                        .pointer("/temperature/summary/hottest/current/value")
                        .cloned()
                        .unwrap_or(json!(0.0)),
                );
                obj.insert(
                    "sensors".into(),
                    metrics
                        .pointer("/temperature/sensors")
                        .cloned()
                        .unwrap_or(json!([])),
                );

                // Array
                obj.insert("array_state".into(), json!(array_state));
            }
            Ok(result)
        }
        Err(_) => {
            // SSH fallback
            let servers = state.servers.lock();
            let config = servers
                .iter()
                .find(|s| s.id == server_id)
                .ok_or_else(|| format!("Server {} not found", server_id))?;
            let conn = make_ssh(config)?;
            let free = conn.exec("free -m | grep Mem").unwrap_or_default();
            let uptime = conn.exec("uptime -p").unwrap_or_default();
            let load = conn.exec("cat /proc/loadavg").unwrap_or_default();
            let hostname = conn.exec("hostname").unwrap_or_default();
            let kernel = conn.exec("uname -r").unwrap_or_default();
            let cores = conn.exec("nproc").unwrap_or_default();
            let arch = conn.exec("uname -m").unwrap_or_default();
            let cpu_info = conn
                .exec("cat /proc/cpuinfo | head -20")
                .unwrap_or_default();
            let cpu_pct = conn.exec("top -bn1 | head -5").unwrap_or_default();
            let os_release = conn
                .exec("cat /etc/os-release 2>/dev/null || cat /etc/unraid-version 2>/dev/null")
                .unwrap_or_default();
            let array_state = conn
                .exec("cat /var/local/emhttp/var.cfg 2>/dev/null | grep arrayState || echo started")
                .unwrap_or_default();
            let sm_info = conn
                .exec("dmidecode -t system 2>/dev/null | grep -E 'Manufacturer|Product' || echo ''")
                .unwrap_or_default();

            let mem_total = free
                .split_whitespace()
                .nth(1)
                .unwrap_or("0")
                .parse::<u64>()
                .unwrap_or(0);
            let mem_used = free
                .split_whitespace()
                .nth(2)
                .unwrap_or("0")
                .parse::<u64>()
                .unwrap_or(0);

            // Parse CPU usage from top output: look for "%Cpu(s)" line
            let cpu_usage = cpu_pct
                .lines()
                .find(|l| l.contains("%Cpu") || l.contains("Cpu(s)"))
                .and_then(|l| {
                    // Format: "  3.7 us,  1.2 sy,  0.0 ni, 94.8 id,  0.3 wa, ..."
                    let idle = l
                        .split_whitespace()
                        .find(|s| *s == "id" || *s == "ni,")
                        .and_then(|_| l.split_whitespace().rev().find(|s| s.ends_with("id")))
                        .and_then(|s| {
                            s.trim_end_matches("id")
                                .trim_end_matches(',')
                                .parse::<f64>()
                                .ok()
                        });
                    idle.map(|i| 100.0 - i)
                })
                .unwrap_or(0.0);

            // Parse CPU brand from /proc/cpuinfo
            let cpu_brand = cpu_info
                .lines()
                .find(|l| l.starts_with("model name"))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            // Parse os-release for PRETTY_NAME
            let os_name = os_release
                .lines()
                .find(|l| l.starts_with("PRETTY_NAME") || l.starts_with("NAME"))
                .and_then(|l| l.split('=').nth(1))
                .map(|s| s.trim().trim_matches('"').to_string())
                .unwrap_or_default();

            // Parse array state from var.cfg
            let array_state_clean = array_state
                .lines()
                .find(|l| l.contains("arrayState"))
                .and_then(|l| l.split('=').nth(1))
                .map(|s| s.trim().trim_matches('"').to_string())
                .unwrap_or_else(|| "STARTED".to_string());

            // Parse system info from dmidecode
            let sys_manufacturer = sm_info
                .lines()
                .find(|l| l.contains("Manufacturer"))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            let sys_model = sm_info
                .lines()
                .find(|l| l.contains("Product"))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            Ok(json!({
                "hostname": hostname.trim(),
                "kernel": kernel.trim(),
                "os_release": os_name,
                "arch": arch.trim(),
                "uptime": uptime.trim(),
                "cpu_cores": cores.trim().parse::<u32>().unwrap_or(1),
                "cpu_threads": cores.trim().parse::<u32>().unwrap_or(1),
                "cpu_brand": cpu_brand,
                "cpu_usage": cpu_usage,
                "memory_total_mb": mem_total,
                "memory_used_mb": mem_used,
                "memory_usage_pct": if mem_total > 0 { mem_used as f64 / mem_total as f64 * 100.0 } else { 0.0 },
                "load_avg": load.split_whitespace().take(3).filter_map(|s| s.parse::<f64>().ok()).collect::<Vec<_>>(),
                "array_state": array_state_clean,
                "system_manufacturer": sys_manufacturer,
                "system_model": sys_model,
            }))
        }
    }
}

#[tauri::command]
pub async fn get_docker_containers(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;

    let query = r#"{
        docker {
            containers {
                id
                names
                image
                state
                status
                autoStart
            }
        }
    }"#;

    let data = api
        .query(query, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let containers = data
        .pointer("/docker/containers")
        .cloned()
        .unwrap_or(json!([]));

    // Transform to frontend-friendly format
    let transformed: Vec<Value> = containers.as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|c| {
            let names = c.pointer("/names").and_then(|n| n.as_array()).cloned().unwrap_or_default();
            let name = names.first().and_then(|n| n.as_str()).unwrap_or("unknown");
            // Strip leading "/" from Docker names
            let name = name.strip_prefix('/').unwrap_or(name);
            json!({
                "id": c.get("id").and_then(|v| v.as_str()).unwrap_or(""),
                "name": name,
                "image": c.get("image").and_then(|v| v.as_str()).unwrap_or(""),
                "state": c.get("state").and_then(|v| v.as_str()).unwrap_or("UNKNOWN").to_lowercase(),
                "status": c.get("status").and_then(|v| v.as_str()).unwrap_or(""),
                "autoStart": c.get("autoStart").and_then(|v| v.as_bool()).unwrap_or(false),
            })
        })
        .collect();

    Ok(json!(transformed))
}

#[tauri::command]
pub async fn docker_start(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;
    let mutation = format!(
        r#"mutation {{ docker {{ start(id: "{}") {{ id names state }} }} }}"#,
        container
    );
    api.query(&mutation, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Started {}", container))
}

#[tauri::command]
pub async fn docker_stop(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;
    let mutation = format!(
        r#"mutation {{ docker {{ stop(id: "{}") {{ id names state }} }} }}"#,
        container
    );
    api.query(&mutation, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Stopped {}", container))
}

#[tauri::command]
pub async fn docker_restart(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;
    let mutation = format!(
        r#"mutation {{ docker {{ restart(id: "{}") {{ id names state }} }} }}"#,
        container
    );
    api.query(&mutation, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Restarted {}", container))
}

#[tauri::command]
pub async fn docker_logs(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
    lines: u32,
) -> Result<String, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;
    let query = format!(
        r#"{{ docker {{ logs(id: "{}", tail: {}) {{ lines {{ timestamp message }} }} }} }}"#,
        container, lines
    );
    let data = api
        .query(&query, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let log_lines = data
        .pointer("/docker/logs/lines")
        .and_then(|l| l.as_array())
        .cloned()
        .unwrap_or_default();
    let output: String = log_lines
        .iter()
        .filter_map(|line| {
            let ts = line.get("timestamp").and_then(|t| t.as_str()).unwrap_or("");
            let msg = line.get("message").and_then(|m| m.as_str()).unwrap_or("");
            if msg.is_empty() {
                None
            } else {
                Some(format!("{} {}", ts, msg))
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(output)
}

#[tauri::command]
pub async fn docker_remove(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;
    let mutation = format!(
        r#"mutation {{ docker {{ removeContainer(id: "{}") }} }}"#,
        container
    );
    api.query(&mutation, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(format!("Removed {}", container))
}

#[tauri::command]
pub async fn get_docker_container_info(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec(&format!("docker inspect {}", container))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_smart_data(
    state: State<'_, AppState>,
    server_id: String,
    device: String,
) -> Result<smart::SmartInfo, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    let output = conn
        .exec(&format!("smartctl -i {}", device))
        .map_err(|e| e.to_string())?;
    Ok(smart::parse_smartctl(&output, &device))
}

#[tauri::command]
pub async fn get_disks(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    let (api, api_key, _config) = make_graphql(&state, &server_id)?;

    let disk_query = r#"{
        disks {
            name
            device
            type
            size
            vendor
            temperature
            smartStatus
            isSpinning
        }
    }"#;

    let array_query = r#"{
        array {
            disks {
                name
                device
                fsSize
                fsFree
                fsUsed
            }
        }
    }"#;

    let disk_data = api
        .query(disk_query, api_key.as_deref())
        .await
        .map_err(|e| format!("GraphQL disks query failed: {}", e))?;
    let disks = disk_data.pointer("/disks").cloned().unwrap_or(json!([]));

    // Try to get filesystem data from array query
    let mut fs_map: std::collections::HashMap<String, serde_json::Value> =
        std::collections::HashMap::new();
    if let Ok(array_data) = api.query(array_query, api_key.as_deref()).await {
        if let Some(array_disks) = array_data
            .pointer("/array/disks")
            .and_then(|d| d.as_array())
        {
            for ad in array_disks {
                if let Some(name) = ad.get("name").and_then(|n| n.as_str()) {
                    fs_map.insert(name.to_string(), ad.clone());
                }
            }
        }
    }

    // Merge filesystem data into disk entries
    let merged: Vec<serde_json::Value> = disks
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .map(|d| {
            let mut disk = d.clone();
            if let Some(name) = d.get("name").and_then(|n| n.as_str()) {
                if let Some(fs) = fs_map.get(name) {
                    if let Some(fs_free) = fs.get("fsFree") {
                        disk["free"] = fs_free.clone();
                    }
                    if let Some(fs_size) = fs.get("fsSize") {
                        disk["fsSize"] = fs_size.clone();
                    }
                    if let Some(fs_used) = fs.get("fsUsed") {
                        disk["fsUsed"] = fs_used.clone();
                    }
                }
            }
            disk
        })
        .collect();

    Ok(json!(merged))
}

#[tauri::command]
pub async fn get_shares(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    let (api, api_key, _config) = make_graphql(&state, &server_id)?;

    let query = r#"{
        shares {
            name
            comment
            allocator
            cache
            size
            free
            used
        }
    }"#;

    match api.query(query, api_key.as_deref()).await {
        Ok(data) => {
            let shares = data.pointer("/shares").cloned().unwrap_or(json!([]));

            // Compute size = used + free when size is 0 (Unraid GraphQL bug)
            let fixed: Vec<serde_json::Value> = shares
                .as_array()
                .unwrap_or(&vec![])
                .iter()
                .map(|s| {
                    let mut share = s.clone();
                    let size = share.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
                    if size == 0 {
                        let used = share.get("used").and_then(|v| v.as_u64()).unwrap_or(0);
                        let free = share.get("free").and_then(|v| v.as_u64()).unwrap_or(0);
                        if used > 0 || free > 0 {
                            share["size"] = json!(used + free);
                        }
                    }
                    share
                })
                .collect();

            Ok(json!(fixed))
        }
        Err(e) => Err(format!("GraphQL shares query failed: {}", e)),
    }
}

#[tauri::command]
pub async fn get_gpu_info(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Option<nvidia::GpuInfo>, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    let output = conn.exec("nvidia-smi").map_err(|e| e.to_string())?;
    Ok(nvidia::parse_nvidia_smi(&output))
}

#[tauri::command]
pub async fn get_processes(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("ps aux --sort=-%cpu | head -25")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_syslog(
    state: State<'_, AppState>,
    server_id: String,
    lines: u32,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec(&format!(
        "tail -{} /var/log/syslog 2>/dev/null || journalctl -n {} --no-pager",
        lines, lines
    ))
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_user_scripts(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("ls /boot/config/plugins/user.scripts/scripts/ 2>/dev/null")
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_plugins(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    let (api, api_key, _config) = make_graphql(&state, &server_id)?;
    let query = r#"{ installedUnraidPlugins }"#;
    match api.query(query, api_key.as_deref()).await {
        Ok(data) => {
            let plugins = data
                .get("installedUnraidPlugins")
                .cloned()
                .unwrap_or(json!([]));
            Ok(plugins)
        }
        Err(e) => Err(format!("GraphQL plugins query failed: {}", e)),
    }
}

#[tauri::command]
pub async fn get_network_interfaces(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("ip -br addr show").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tailscale_peers(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("tailscale status").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reboot_server(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    if std::env::var("SAFE_MODE").is_ok() {
        return Err("Reboot disabled in SAFE_MODE (CI/test environment)".into());
    }
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("reboot").map_err(|e| e.to_string())?;
    Ok("Rebooting".to_string())
}

#[tauri::command]
pub async fn shutdown_server(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    if std::env::var("SAFE_MODE").is_ok() {
        return Err("Shutdown disabled in SAFE_MODE (CI/test environment)".into());
    }
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    conn.exec("poweroff").map_err(|e| e.to_string())?;
    Ok("Shutting down".to_string())
}

#[tauri::command]
pub async fn run_user_script(
    state: State<'_, AppState>,
    server_id: String,
    script: String,
) -> Result<String, String> {
    let (_, _, config) = make_graphql(&state, &server_id)?;
    let conn = make_ssh(&config)?;
    let path = format!(
        "/boot/config/plugins/user.scripts/scripts/{}/run_script.sh",
        script
    );
    conn.exec(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_array_info(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<serde_json::Value, String> {
    let (api, api_key, _) = make_graphql(&state, &server_id)?;

    let query = r#"{
        array {
            state
            capacity {
                disks { free used total }
            }
            disks {
                name
                device
                status
                size
                temp
                type
                fsType
                fsSize
                fsFree
                fsUsed
            }
            caches {
                name
                device
                status
                size
                temp
                type
            }
        }
    }"#;

    let data = api
        .query(query, api_key.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    let array = data.get("array").cloned().unwrap_or(json!({}));
    Ok(array)
}

fn get_server_config(state: &AppState, server_id: &str) -> Result<ServerConfig, String> {
    let servers = state.servers.lock();
    servers
        .iter()
        .find(|s| s.id == server_id)
        .cloned()
        .ok_or_else(|| format!("Server {} not found", server_id))
}

fn make_nextcloud(state: &AppState, server_id: &str) -> Result<NextcloudClient, String> {
    let config = get_server_config(state, server_id)?;
    let nc_config = NextcloudConfig {
        base_url: format!("https://{}:4443", config.hostname),
        username: config
            .service_keys
            .nextcloud_user
            .clone()
            .unwrap_or(config.username.clone()),
        password: config
            .service_keys
            .nextcloud_pass
            .clone()
            .unwrap_or(config.auth.get_password().unwrap_or_default()),
    };
    NextcloudClient::new(nc_config).map_err(|e| e.to_string())
}

fn make_lidarr(state: &AppState, server_id: &str) -> Result<LidarrClient, String> {
    let config = get_server_config(state, server_id)?;
    let lidarr_config = LidarrConfig {
        base_url: format!("http://{}:8686", config.hostname),
        api_key: config
            .service_keys
            .lidarr_api_key
            .clone()
            .unwrap_or(config.api_key.clone().unwrap_or_default()),
    };
    LidarrClient::new(lidarr_config).map_err(|e| e.to_string())
}

fn make_homeassistant(state: &AppState, server_id: &str) -> Result<HomeAssistantClient, String> {
    let config = get_server_config(state, server_id)?;
    let ha_config = HomeAssistantConfig {
        base_url: format!("http://{}:8123", config.hostname),
        token: config
            .service_keys
            .homeassistant_token
            .clone()
            .unwrap_or(config.api_key.clone().unwrap_or_default()),
    };
    HomeAssistantClient::new(ha_config).map_err(|e| e.to_string())
}

fn make_myspeed(state: &AppState, server_id: &str) -> Result<MySpeedClient, String> {
    let server_config = get_server_config(state, server_id)?;
    let ms_config = MySpeedConfig {
        db_path: server_config
            .service_keys
            .myspeed_db_path
            .clone()
            .unwrap_or("/mnt/user/appdata/myspeed/storage.db".to_string()),
        api_url: server_config
            .service_keys
            .myspeed_url
            .clone()
            .unwrap_or(format!("http://{}:5216", server_config.hostname)),
    };
    MySpeedClient::new(ms_config, server_config).map_err(|e| e.to_string())
}

fn make_adguard(state: &AppState, server_id: &str) -> Result<AdGuardClientWrapper, String> {
    let config = get_server_config(state, server_id)?;
    let ag_config = AdGuardConfig {
        base_url: config
            .service_keys
            .adguard_url
            .clone()
            .unwrap_or("https://adguard.tailf6d3b4.ts.net:8443".to_string()),
        username: config
            .service_keys
            .adguard_user
            .clone()
            .unwrap_or(config.username.clone()),
        password: config
            .service_keys
            .adguard_pass
            .clone()
            .unwrap_or(config.auth.get_password().unwrap_or_default()),
    };
    AdGuardClientWrapper::new(ag_config).map_err(|e| e.to_string())
}

fn make_phone(state: &AppState, server_id: &str) -> Result<PhoneClient, String> {
    let config = get_server_config(state, server_id)?;
    let phone_config = PhoneConfig {
        hostname: config.hostname.clone(),
        port: config.port,
        adb_serial: config.service_keys.phone_adb_serial.clone(),
    };
    PhoneClient::new(phone_config).map_err(|e| e.to_string())
}

fn make_kdeconnect(state: &AppState, server_id: &str) -> Result<KdeConnectClient, String> {
    let config = get_server_config(state, server_id)?;
    let kde_config = KdeConnectConfig {
        device_id: config
            .service_keys
            .kdeconnect_device_id
            .clone()
            .unwrap_or_else(|| format!("{}:{}", config.hostname, config.port)),
    };
    KdeConnectClient::new(kde_config).map_err(|e| e.to_string())
}

/// Telemetry for the machine running KTS Master Control itself ("This System"
/// on the dashboard). Runs the probes locally instead of over SSH.
#[tauri::command]
pub async fn get_local_system_stats() -> Result<Value, String> {
    // The local probe samples /proc/stat twice ~0.5s apart; run it off the
    // async runtime so it doesn't stall other invocations.
    let (system, thermal, gpu) = tokio::task::spawn_blocking(|| {
        let system = crate::local_stats::get_system_stats().map_err(|e| e.to_string())?;
        let thermal = crate::local_stats::get_thermal().ok();
        let gpu = crate::local_stats::get_gpu_info().ok();
        Ok::<_, String>((system, thermal, gpu))
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(json!({
        "system": system,
        "thermal": thermal,
        "gpu": gpu,
    }))
}

#[tauri::command]
pub async fn get_nextcloud_info(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_nextcloud(&state, &server_id)?;
    let info = client.get_server_info().await.map_err(|e| e.to_string())?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_nextcloud_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_nextcloud(&state, &server_id)?;
    let status = client
        .get_system_status()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_nextcloud_storage(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_nextcloud(&state, &server_id)?;
    let stats = client
        .get_storage_stats()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_nextcloud_users(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_nextcloud(&state, &server_id)?;
    let users = client.get_users().await.map_err(|e| e.to_string())?;
    serde_json::to_value(users).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_nextcloud_activity(
    state: State<'_, AppState>,
    server_id: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let client = make_nextcloud(&state, &server_id)?;
    let activity = client
        .get_activity(None, limit)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(activity).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let status = client
        .get_system_status()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_health(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let health = client.get_health().await.map_err(|e| e.to_string())?;
    serde_json::to_value(health).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_artists(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let artists = client.get_artists().await.map_err(|e| e.to_string())?;
    serde_json::to_value(artists).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_albums(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let albums = client
        .get_albums(None, Some(true))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(albums).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_wanted(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let wanted = client
        .get_wanted_missing(1, 50)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(wanted).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_queue(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let queue = client.get_queue(1, 50).await.map_err(|e| e.to_string())?;
    serde_json::to_value(queue).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_lidarr_diskspace(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_lidarr(&state, &server_id)?;
    let diskspace = client.get_disk_space().await.map_err(|e| e.to_string())?;
    serde_json::to_value(diskspace).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn lidarr_refresh_artist(
    state: State<'_, AppState>,
    server_id: String,
    artist_id: u32,
) -> Result<(), String> {
    let client = make_lidarr(&state, &server_id)?;
    client
        .refresh_series(artist_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn lidarr_search_missing(
    state: State<'_, AppState>,
    server_id: String,
    artist_id: u32,
) -> Result<(), String> {
    let client = make_lidarr(&state, &server_id)?;
    client
        .search_missing(artist_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_homeassistant_states(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_homeassistant(&state, &server_id)?;
    let states = client.get_states().await.map_err(|e| e.to_string())?;
    serde_json::to_value(states).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_homeassistant_config(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_homeassistant(&state, &server_id)?;
    let config = client.get_config().await.map_err(|e| e.to_string())?;
    serde_json::to_value(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_homeassistant_areas(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_homeassistant(&state, &server_id)?;
    let areas = client.get_areas().await.map_err(|e| e.to_string())?;
    serde_json::to_value(areas).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_homeassistant_devices(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_homeassistant(&state, &server_id)?;
    let devices = client.get_devices().await.map_err(|e| e.to_string())?;
    serde_json::to_value(devices).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_homeassistant_entities(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_homeassistant(&state, &server_id)?;
    let entities = client
        .get_entity_registry()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(entities).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn homeassistant_toggle(
    state: State<'_, AppState>,
    server_id: String,
    entity_id: String,
) -> Result<(), String> {
    let client = make_homeassistant(&state, &server_id)?;
    client
        .toggle_entity(&entity_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn homeassistant_turn_on(
    state: State<'_, AppState>,
    server_id: String,
    entity_id: String,
) -> Result<(), String> {
    let client = make_homeassistant(&state, &server_id)?;
    client
        .turn_on_entity(&entity_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn homeassistant_turn_off(
    state: State<'_, AppState>,
    server_id: String,
    entity_id: String,
) -> Result<(), String> {
    let client = make_homeassistant(&state, &server_id)?;
    client
        .turn_off_entity(&entity_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_myspeed_summary(
    state: State<'_, AppState>,
    server_id: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let client = make_myspeed(&state, &server_id)?;
    let summary = client.get_summary(limit).await.map_err(|e| e.to_string())?;
    serde_json::to_value(summary).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_myspeed_tests(
    state: State<'_, AppState>,
    server_id: String,
    limit: u32,
) -> Result<Value, String> {
    let client = make_myspeed(&state, &server_id)?;
    let tests = client
        .get_recent_tests(limit)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(tests).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_myspeed_servers(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_myspeed(&state, &server_id)?;
    let servers = client.get_servers().await.map_err(|e| e.to_string())?;
    serde_json::to_value(servers).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let status = client.get_status().await.map_err(|e| e.to_string())?;
    serde_json::to_value(status).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_stats(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let stats = client.get_stats().await.map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_query_log(
    state: State<'_, AppState>,
    server_id: String,
    limit: u32,
    offset: u32,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let log = client
        .get_query_log(limit, offset, None)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(log).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_clients(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let clients = client.get_clients().await.map_err(|e| e.to_string())?;
    serde_json::to_value(clients).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_filters(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let filters = client.get_filters().await.map_err(|e| e.to_string())?;
    serde_json::to_value(filters).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_adguard_dhcp(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_adguard(&state, &server_id)?;
    let dhcp = client.get_dhcp().await.map_err(|e| e.to_string())?;
    serde_json::to_value(dhcp).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn adguard_enable(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let client = make_adguard(&state, &server_id)?;
    client
        .enable_protection()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn adguard_disable(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let client = make_adguard(&state, &server_id)?;
    client
        .disable_protection()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Phone commands
#[tauri::command]
pub async fn get_phone_device_info(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let info = client.get_device_info().await.map_err(|e| e.to_string())?;
    serde_json::to_value(info).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_battery(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let battery = client.get_battery().await.map_err(|e| e.to_string())?;
    serde_json::to_value(battery).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_thermal(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let thermal = client.get_thermal().await.map_err(|e| e.to_string())?;
    serde_json::to_value(thermal).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_storage(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let storage = client.get_storage().await.map_err(|e| e.to_string())?;
    serde_json::to_value(storage).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_memory(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let memory = client.get_memory().await.map_err(|e| e.to_string())?;
    serde_json::to_value(memory).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_cpu(state: State<'_, AppState>, server_id: String) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let cpu = client.get_cpu_usage().await.map_err(|e| e.to_string())?;
    serde_json::to_value(cpu).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_screen(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let screen = client.get_screen().await.map_err(|e| e.to_string())?;
    serde_json::to_value(screen).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_network(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let network = client.get_network().await.map_err(|e| e.to_string())?;
    serde_json::to_value(network).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_apps(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let apps = client
        .get_installed_apps()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(apps).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_processes(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let processes = client
        .get_running_processes()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(processes).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_phone_activity(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let activity = client
        .get_current_activity()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(activity).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn phone_set_screen(
    state: State<'_, AppState>,
    server_id: String,
    on: bool,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client
        .set_screen_state(on)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_set_brightness(
    state: State<'_, AppState>,
    server_id: String,
    value: u32,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client
        .set_brightness(value)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_set_auto_brightness(
    state: State<'_, AppState>,
    server_id: String,
    enabled: bool,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client
        .set_auto_brightness(enabled)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_volume_up(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client.volume_up().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_volume_down(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client.volume_down().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_reboot(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client.reboot().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_screenshot(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<u8>, String> {
    let client = make_phone(&state, &server_id)?;
    let screenshot = client.screenshot().await.map_err(|e| e.to_string())?;
    Ok(screenshot)
}

/// Capture a phone screenshot and save it to ~/Pictures, returning the path.
#[tauri::command]
pub async fn phone_screenshot_save(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let client = make_phone(&state, &server_id)?;
    let screenshot = client.screenshot().await.map_err(|e| e.to_string())?;
    let dir = dirs::picture_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Pictures")))
        .ok_or_else(|| "No Pictures directory available".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let path = dir.join(format!("kts-phone-{ts}.png"));
    std::fs::write(&path, &screenshot).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn phone_force_stop_app(
    state: State<'_, AppState>,
    server_id: String,
    package: String,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client
        .force_stop_app(&package)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_get_sms_inbox(
    state: State<'_, AppState>,
    server_id: String,
    limit: Option<u32>,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let messages = client
        .get_sms_inbox(limit.unwrap_or(50))
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(messages).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn phone_get_sms_by_address(
    state: State<'_, AppState>,
    server_id: String,
    address: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let messages = client
        .get_sms_by_address(&address)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(messages).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn phone_get_sms_conversations(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let conversations = client
        .get_sms_conversations()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(conversations).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn phone_send_sms(
    state: State<'_, AppState>,
    server_id: String,
    address: String,
    body: String,
) -> Result<(), String> {
    let client = make_phone(&state, &server_id)?;
    client
        .send_sms(&address, &body)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn launch_rustdesk(state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    let config = get_server_config(&state, &server_id)?;
    let rustdesk_id = config
        .service_keys
        .phone_rustdesk_id
        .ok_or_else(|| "RustDesk ID not configured".to_string())?;

    tokio::task::spawn_blocking(move || {
        std::process::Command::new("rustdesk")
            .args(["--connect", &rustdesk_id])
            .spawn()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(())
}

// KDE Connect commands
#[tauri::command]
pub async fn get_kdeconnect_battery(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let battery = client.get_battery().await.map_err(|e| e.to_string())?;
    serde_json::to_value(battery).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_kdeconnect_notifications(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let notifications = client
        .get_active_notifications()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(notifications).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_kdeconnect_notification(
    state: State<'_, AppState>,
    server_id: String,
    id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let notification = client
        .get_notification(&id)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(notification).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_kdeconnect_mpris(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let mpris = client.get_mpris_status().await.map_err(|e| e.to_string())?;
    serde_json::to_value(mpris).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_mpris_play(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.mpris_play().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_mpris_pause(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.mpris_pause().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_mpris_play_pause(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.mpris_play_pause().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_mpris_next(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.mpris_next().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_mpris_previous(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.mpris_previous().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_mpris_set_volume(
    state: State<'_, AppState>,
    server_id: String,
    volume: f64,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .mpris_set_volume(volume)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_kdeconnect_connectivity(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let connectivity = client.get_connectivity().await.map_err(|e| e.to_string())?;
    serde_json::to_value(connectivity).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_kdeconnect_telephony(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let telephony = client.get_telephony().await.map_err(|e| e.to_string())?;
    serde_json::to_value(telephony).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_ring_device(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.ring_device().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_send_ping(
    state: State<'_, AppState>,
    server_id: String,
    message: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .send_ping(&message)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_send_sms(
    state: State<'_, AppState>,
    server_id: String,
    number: String,
    message: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .send_sms(&number, &message)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_send_clipboard(
    state: State<'_, AppState>,
    server_id: String,
    text: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .send_clipboard(&text)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_get_clipboard(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<String, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let clipboard = client.get_clipboard().await.map_err(|e| e.to_string())?;
    Ok(clipboard)
}

#[tauri::command]
pub async fn get_kdeconnect_contacts(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let contacts = client.get_contacts().await.map_err(|e| e.to_string())?;
    serde_json::to_value(contacts).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_sftp_list(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let files = client
        .sftp_list_files(&path)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(files).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_share_file(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.share_file(&path).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_share_url(
    state: State<'_, AppState>,
    server_id: String,
    url: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.share_url(&url).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_share_text(
    state: State<'_, AppState>,
    server_id: String,
    text: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client.share_text(&text).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_get_conversations(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let conversations = client
        .get_conversations()
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(conversations).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_reply_conversation(
    state: State<'_, AppState>,
    server_id: String,
    thread_id: i64,
    message: String,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .reply_to_conversation(thread_id, &message)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kdeconnect_request_conversation(
    state: State<'_, AppState>,
    server_id: String,
    thread_id: i64,
) -> Result<(), String> {
    let client = make_kdeconnect(&state, &server_id)?;
    client
        .request_conversation(thread_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn phone_get_contacts(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let contacts = client.get_contacts().await.map_err(|e| e.to_string())?;
    serde_json::to_value(contacts).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn phone_get_call_log(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_phone(&state, &server_id)?;
    let call_log = client.get_call_log().await.map_err(|e| e.to_string())?;
    serde_json::to_value(call_log).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn kdeconnect_list_devices(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_kdeconnect(&state, &server_id)?;
    let devices = client.list_devices().await.map_err(|e| e.to_string())?;
    serde_json::to_value(devices).map_err(|e| e.to_string())
}

// Steam Deck / Linux handheld commands
fn make_linux(state: &AppState, server_id: &str) -> Result<LinuxClient, String> {
    let servers = state.servers.lock();
    let config = servers
        .iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| "Server not found".to_string())?;

    let password = match &config.auth {
        crate::config::AuthConfig::Password { password } => password.clone(),
        _ => return Err("Password auth required".to_string()),
    };
    let sudo_password = match &config.auth {
        crate::config::AuthConfig::Password { password } => Some(password.clone()),
        _ => None,
    };

    let linux_config = LinuxConfig {
        hostname: config.hostname.clone(),
        port: config.port,
        username: config.username.clone(),
        password,
        sudo_password,
    };

    LinuxClient::new(linux_config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_system_stats(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let stats = client.get_system_stats().await.map_err(|e| e.to_string())?;
    serde_json::to_value(stats).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_battery(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let battery = client.get_battery().await.map_err(|e| e.to_string())?;
    serde_json::to_value(battery).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_thermal(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let thermal = client.get_thermal().await.map_err(|e| e.to_string())?;
    serde_json::to_value(thermal).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_disk(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let disk = client.get_disk_usage().await.map_err(|e| e.to_string())?;
    serde_json::to_value(disk).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_network(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let network = client.get_network().await.map_err(|e| e.to_string())?;
    serde_json::to_value(network).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_get_gpu(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let gpu = client.get_gpu_info().await.map_err(|e| e.to_string())?;
    serde_json::to_value(gpu).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn steamdeck_launch_rustdesk(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    let rustdesk_id;
    let rustdesk_password;
    let hostname;
    let username;
    let port;
    let password;

    {
        let servers = state.servers.lock();
        let config = servers
            .iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| "Server not found".to_string())?;

        rustdesk_id = config
            .service_keys
            .steamdeck_rustdesk_id
            .as_ref()
            .ok_or_else(|| "RustDesk ID not configured".to_string())?
            .clone();
        rustdesk_password = config
            .service_keys
            .steamdeck_rustdesk_password
            .as_ref()
            .cloned()
            .unwrap_or_default();
        hostname = config.hostname.clone();
        username = config.username.clone();
        port = config.port;
        password = match &config.auth {
            crate::config::AuthConfig::Password { password } => password.clone(),
            _ => return Err("Password auth required".to_string()),
        };
    }

    tokio::task::spawn_blocking(move || {
        let mut args = vec![
            "-o".to_string(),
            "StrictHostKeyChecking=no".to_string(),
            "-o".to_string(),
            "UserKnownHostsFile=/dev/null".to_string(),
            "-o".to_string(),
            "ConnectTimeout=10".to_string(),
        ];

        if port != 22 {
            args.push("-p".to_string());
            args.push(port.to_string());
        }

        args.push(format!("{}@{}", username, hostname));
        args.push(format!(
            "rustdesk --connect {} --password {} &",
            rustdesk_id, rustdesk_password
        ));

        let mut cmd = Command::new("sshpass");
        cmd.arg("-p").arg(&password).arg("ssh").args(&args);
        cmd.output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn steamdeck_get_deskflow_status(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;
    let connected = client
        .get_deskflow_status()
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "connected": connected }))
}

/// Provision the handheld (Ally/Bazzite) for stable stats + passwordless SSH:
/// installs monitoring tools, enables sshd on boot, and pushes this host's SSH
/// public key so the connection stays up without interactive password prompts.
#[tauri::command]
pub async fn ally_provision(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    let client = make_linux(&state, &server_id)?;

    // Gather the first available SSH public key on this host so the Ally trusts us.
    let pubkey = std::fs::read_dir(format!(
        "{}/.ssh",
        std::env::var("HOME").unwrap_or_default()
    ))
    .map(|rd| {
        rd.filter_map(|e| e.ok())
            .filter_map(|e| {
                let p = e.path();
                if p.extension().map(|x| x == "pub").unwrap_or(false) {
                    std::fs::read_to_string(&p).ok()
                } else {
                    None
                }
            })
            .find(|c| !c.trim().is_empty())
            .map(|c| c.trim().to_string())
            .unwrap_or_default()
    })
    .unwrap_or_default();

    let log = client
        .ally_provision(&pubkey)
        .await
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "log": log, "pubkey_installed": !pubkey.is_empty() }))
}

/// Launch the opencode AI agent ("Summon Agent") to catalog the Ally's Steam
/// library and produce (and, when reachable, apply) per-game launch options.
///
/// Opens the interactive opencode TUI in a visible terminal window (foot,
/// falling back to xterm) inside the pre-configured `ally-agent` workspace,
/// with the catalog prompt preloaded. Returns immediately after the terminal
/// is spawned so the user can watch the agent work and approve prompts live.
#[tauri::command]
pub async fn ally_launch_agent(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Value, String> {
    // Resolve the connection target so the prompt is grounded in reality.
    let (host, user, port, password) = {
        let servers = state.servers.lock();
        let config = servers
            .iter()
            .find(|s| s.id == server_id)
            .ok_or_else(|| "Server not found".to_string())?;
        (
            config.hostname.clone(),
            config.username.clone(),
            config.port,
            config.auth.get_password().unwrap_or_default(),
        )
    };

    let workspace = std::env::var("HOME")
        .map(|h| format!("{}/.config/master-control/ally-agent", h))
        .unwrap_or_else(|_| "/tmp/ally-agent".to_string());
    // The workspace ships with the user-authored AGENTS.md / catalog.sh;
    // just make sure the scripts dir exists before we reference it.
    let _ = std::fs::create_dir_all(format!("{}/scripts", workspace));

    let opencode = resolve_opencode()?;
    let script_path = format!("{}/scripts/catalog.sh", workspace);

    let prompt = format!(
        concat!(
            "You are the KTS ROG Ally optimization agent. Catalog the Steam library ",
            "on host {} (user {}, ssh port {}) by running `bash {}` over SSH, ",
            "then produce per-game launch options as defined in your AGENTS.md. ",
            "Return the full Markdown report.\n",
            "Connection details: host {}, username {}, ssh port {}.\n",
            "Auth: prefer key-based SSH first. If that fails, use sshpass with ",
            "password '{}'. NEVER print or echo the password."
        ),
        host, user, port, script_path, host, user, port, password
    );

    // Spawn the interactive opencode TUI in a visible terminal window so the
    // user can watch progress and approve permission prompts live. `--prompt`
    // preloads the message into the interactive TUI; `opencode run
    // --message --interactive` is not valid for current opencode versions.
    let inner = format!(
        "cd -- {} && exec {} --prompt {}",
        shell_quote(&workspace),
        shell_quote(&opencode),
        shell_quote(&prompt),
    );

    let mut last_err: Option<String> = None;
    for (terminal, args) in [
        ("foot", vec!["bash", "-lc"]),
        ("xterm", vec!["-e", "bash", "-lc"]),
    ] {
        let mut cmd = Command::new(terminal);
        cmd.args(&args)
            .arg(&inner)
            .env("OPENCODE_WORKSPACE", &workspace);
        match cmd.spawn() {
            Ok(_) => return Ok(json!({ "ok": true, "terminal": terminal })),
            Err(e) => last_err = Some(format!("{}: {}", terminal, e)),
        }
    }

    Err(last_err.unwrap_or_else(|| {
        "No terminal emulator available (need foot or xterm) to open the agent box".into()
    }))
}

/// Locate the opencode binary: OPENCODE_BIN override, then known install
/// locations, then a PATH lookup (mise shims etc.). Returns a clear error
/// when it can't be found.
fn resolve_opencode() -> Result<String, String> {
    if let Ok(p) = std::env::var("OPENCODE_BIN") {
        let p = p.trim().to_string();
        if !p.is_empty() {
            return Ok(p);
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!(
            "{}/.local/share/mise/installs/opencode/latest/opencode",
            home
        ),
        format!("{}/.local/bin/opencode", home),
        "/usr/bin/opencode".to_string(),
        "/usr/local/bin/opencode".to_string(),
        format!("{}/.npm-global/bin/opencode", home),
    ];
    for path in candidates {
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }
    // PATH lookup (mise shims, npm/bun/npx globals, etc.).
    if let Ok(output) = Command::new("sh")
        .args(["-c", "command -v opencode 2>/dev/null || true"])
        .output()
    {
        let found = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !found.is_empty() {
            return Ok(found);
        }
    }
    Err(
        "opencode binary not found. Install it (mise, npm, or ~/.local/bin) \
         or set OPENCODE_BIN."
            .to_string(),
    )
}

/// Single-quote shell-escape a string so it is safe to embed in `bash -lc`.
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

// ---------------------------------------------------------------------------
// REST services (plex, scrutiny, uptime kuma, invoice ninja, aurral, ...)
// ---------------------------------------------------------------------------

/// Look up a server's stored config.
fn find_server(state: &AppState, server_id: &str) -> Result<ServerConfig, String> {
    let servers = state.servers.lock();
    servers
        .iter()
        .find(|s| s.id == server_id)
        .cloned()
        .ok_or_else(|| format!("Server {} not found", server_id))
}

/// Probe every REST service configured for a server.
///
/// Probes run concurrently and a dead service never fails the call — the
/// dashboard needs to show "5 of 8 up", not throw on the first dead one.
#[tauri::command]
pub async fn get_rest_service_health(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<crate::services::ServiceHealth>, String> {
    let config = find_server(&state, &server_id)?;
    let keys = config.service_keys.clone();

    let mut set = tokio::task::JoinSet::new();
    for service in crate::services::RestService::ALL {
        let keys = keys.clone();
        set.spawn(async move { crate::services::probe(service, &keys).await });
    }

    let mut out = Vec::new();
    while let Some(joined) = set.join_next().await {
        if let Ok(health) = joined {
            out.push(health);
        }
    }
    out.sort_by(|a, b| a.service.cmp(&b.service));
    Ok(out)
}

/// Plex server identity (version, machine id, claimed).
#[tauri::command]
pub async fn get_plex_identity(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<crate::services::PlexIdentity, String> {
    let config = find_server(&state, &server_id)?;
    let service = crate::services::ServiceConfig::from_keys(
        crate::services::RestService::Plex,
        &config.service_keys,
    )
    .map_err(|e| e.to_string())?;
    let client = crate::services::HttpServiceClient::new(service).map_err(|e| e.to_string())?;
    crate::services::plex_identity(&client)
        .await
        .map_err(|e| e.to_string())
}

/// Plex library sections, flattened from the MediaContainer envelope.
#[tauri::command]
pub async fn get_plex_libraries(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<crate::services::PlexLibrary>, String> {
    let config = find_server(&state, &server_id)?;
    let service = crate::services::ServiceConfig::from_keys(
        crate::services::RestService::Plex,
        &config.service_keys,
    )
    .map_err(|e| e.to_string())?;
    let client = crate::services::HttpServiceClient::new(service).map_err(|e| e.to_string())?;
    crate::services::plex_libraries(&client)
        .await
        .map_err(|e| e.to_string())
}

/// ────────────────────────────────────────────────────────────────
/// MeshCentral Commands (2026-10-07)
/// ────────────────────────────────────────────────────────────────

/// MeshCentral admin config. `~/.config/master-control/meshcentral.json` takes
/// precedence when present; otherwise the built-in fleet defaults.
fn get_meshcentral_config() -> Result<MeshCentralConfig, String> {
    let mut cfg = MeshCentralConfig {
        server_url: None,
        admin_user: None,
        admin_pass: None,
        group_id: None,
        group_name: None,
    };
    let path = crate::config::config_dir().join("meshcentral.json");
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(String::from);
            if let Some(x) = s("server_url") { cfg.server_url = Some(x); }
            if let Some(x) = s("admin_user") { cfg.admin_user = Some(x); }
            if let Some(x) = s("admin_pass") { cfg.admin_pass = Some(x); }
            if let Some(x) = s("group_id") { cfg.group_id = Some(x); }
            if let Some(x) = s("group_name") { cfg.group_name = Some(x); }
        }
    }
    Ok(cfg)
}

fn get_unraid_credentials(state: &AppState) -> Result<(String, String, String), String> {
    let servers = state.servers.lock();
    let unraid = servers.iter().find(|s| s.device_type == DeviceType::Unraid)
        .ok_or_else(|| "No Unraid server configured".to_string())?;
    let host = unraid.hostname.clone();
    let user = unraid.username.clone();
    let pass = unraid.auth.get_password().unwrap_or_default();
    Ok((host, user, pass))
}

/// Locate the Unraid server in `servers.json` (fresh load) and return
/// (host, user, pass). For MeshCentral helpers that don't hold AppState —
/// e.g. `list_devices` resolving the SSH hop to the meshctrl container.
pub fn unraid_creds_from_servers() -> Result<(String, String, String), String> {
    let servers = crate::config::load_servers();
    let unraid = servers.iter().find(|s| s.device_type == DeviceType::Unraid)
        .ok_or_else(|| "No Unraid server configured".to_string())?;
    Ok((
        unraid.hostname.clone(),
        unraid.username.clone(),
        unraid.auth.get_password().unwrap_or_default(),
    ))
}

#[tauri::command]
pub async fn meshcentral_list_devices() -> Result<Vec<MeshDevice>, String> {
    let mut client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    client.list_devices().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn meshcentral_get_device_status(
    device_id: String,
) -> Result<DeviceStatus, String> {
    let mut client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    client.get_device_status(&device_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn meshcentral_execute_batch(
    state: State<'_, AppState>,
    device_ids: Vec<String>,
    commands: Vec<BatchCommand>,
) -> Result<Vec<BatchResult>, String> {
    let config = get_meshcentral_config()?;
    let (host, user, pass) = get_unraid_credentials(&state)?;
    let client = MeshCentralClient::new(config).map_err(|e| e.to_string())?;
    client.execute_batch_via_ssh(&host, &user, &pass, &device_ids, &commands).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn meshcentral_get_terminal_url(
    device_id: String,
) -> Result<String, String> {
    let client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    Ok(client.get_terminal_url(&device_id))
}

#[tauri::command]
pub async fn meshcentral_get_file_manager_url(
    device_id: String,
) -> Result<String, String> {
    let client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    Ok(client.get_file_manager_url(&device_id))
}

#[tauri::command]
pub async fn meshcentral_get_enrollment_info(
    device_type: String,
) -> Result<EnrollmentInfo, String> {
    let client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    Ok(client.get_enrollment_info(&device_type))
}

#[tauri::command]
pub async fn meshcentral_sync_fleet(
    state: State<'_, AppState>,
) -> Result<SyncResult, String> {
    // Clone out of the Mutex BEFORE awaiting: parking_lot::MutexGuard is
    // !Send, and Tauri commands must return Send futures (audit fix
    // 2026-10-10). Write the merged result back after the await.
    let mut local = state.servers.lock().clone();
    let result = meshcentral_sync_fleet_core(&mut local).await?;
    *state.servers.lock() = local;
    Ok(result)
}

/// Sync MeshCentral inventory into `servers` AND persist `servers.json`.
///
/// The persist step is what makes `meshcentral_device_id` survive restarts —
/// without it every app launch forgot the fleet and all transport commands
/// failed with "not enrolled" (found by `examples/mc_e2e.rs`, 2026-10-09).
pub async fn meshcentral_sync_fleet_core(
    servers: &mut Vec<ServerConfig>,
) -> Result<SyncResult, String> {
    let mut client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    let result = client.sync_to_servers_json(servers).await.map_err(|e| e.to_string())?;
    crate::config::save_servers(servers);
    Ok(result)
}

#[tauri::command]
pub async fn meshcentral_get_fleet_stats(
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let mut client = MeshCentralClient::new(get_meshcentral_config()?)
        .map_err(|e| e.to_string())?;
    let mc_devices = client.list_devices().await.map_err(|e| e.to_string())?;

    let servers = state.servers.lock();
    let mut results = serde_json::Map::new();

    for server in servers.iter() {
        let mc_device = mc_devices.iter().find(|d| {
            server.service_keys.tailscale_ip.as_ref() == Some(&d.ip) ||
            server.hostname == d.name ||
            server.name == d.name
        });

        let stats = if let Some(mc) = mc_device {
            json!({
                "connected": mc.conn >= 1,
                "meshcentral_status": match mc.conn { 0 => "offline", 1 => "online", 2 => "connected", _ => "unknown" },
                "source": "meshcentral",
                "meshcentral_device_id": mc.id,
                "platform": mc.platform,
                "ip": mc.ip,
            })
        } else {
            json!({
                "connected": false,
                "source": "none",
            })
        };

        results.insert(server.id.clone(), stats);
    }

    Ok(serde_json::Value::Object(results))
}

/// ────────────────────────────────────────────────────────────────
/// MeshCentral Transport Commands (2026-10-08) — PRIMARY transport
/// ────────────────────────────────────────────────────────────────

fn get_transport() -> Result<MeshCentralTransport, String> {
    Ok(MeshCentralTransport::new(get_meshcentral_config()?))
}

/// Execute a shell command on a device via MeshCentral
#[tauri::command]
pub async fn meshcentral_shell_exec(
    state: State<'_, AppState>,
    server_id: String,
    command: String,
    timeout_secs: Option<u64>,
) -> Result<ShellResult, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.execute_shell(&server, &command, timeout_secs).await.map_err(|e| e.to_string())
}

/// Execute multiple shell commands sequentially on a device
#[tauri::command]
pub async fn meshcentral_shell_batch(
    state: State<'_, AppState>,
    server_id: String,
    commands: Vec<String>,
    timeout_secs: Option<u64>,
) -> Result<Vec<ShellResult>, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    let cmd_refs: Vec<&str> = commands.iter().map(|s| s.as_str()).collect();
    transport.execute_shell_batch(&server, &cmd_refs, timeout_secs).await.map_err(|e| e.to_string())
}

/// Execute the same command on multiple devices in parallel
#[tauri::command]
pub async fn meshcentral_shell_fleet(
    state: State<'_, AppState>,
    server_ids: Vec<String>,
    command: String,
    timeout_secs: Option<u64>,
) -> Result<Vec<ShellResult>, String> {
    let transport = get_transport()?;
    // Resolve targets and DROP the guard before awaiting (MutexGuard is !Send).
    let target_servers: Vec<ServerConfig> = {
        let servers = state.servers.lock();
        server_ids.iter()
            .filter_map(|id| servers.iter().find(|s| s.id == *id).cloned())
            .collect()
    };
    transport.execute_shell_on_devices(&target_servers, &command, timeout_secs).await.map_err(|e| e.to_string())
}

/// Read a file from a remote device
#[tauri::command]
pub async fn meshcentral_read_file(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<String, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.read_file(&server, &path).await.map_err(|e| e.to_string())
}

/// Write a file to a remote device
#[tauri::command]
pub async fn meshcentral_write_file(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
    content: String,
    mode: Option<u32>,
) -> Result<(), String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.write_file(&server, &path, &content, mode).await.map_err(|e| e.to_string())
}

/// List directory contents on a remote device
#[tauri::command]
pub async fn meshcentral_list_dir(
    state: State<'_, AppState>,
    server_id: String,
    path: String,
) -> Result<Vec<RemoteFileInfo>, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.list_dir(&server, &path).await.map_err(|e| e.to_string())
}

/// Get system stats from a device via shell commands
#[tauri::command]
pub async fn meshcentral_get_system_stats(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<MeshSystemStats, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.get_system_stats(&server).await.map_err(|e| e.to_string())
}

/// Get running processes on a device
#[tauri::command]
pub async fn meshcentral_get_processes(
    state: State<'_, AppState>,
    server_id: String,
    limit: Option<usize>,
) -> Result<Vec<RemoteProcess>, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.get_processes(&server, limit).await.map_err(|e| e.to_string())
}

/// Reboot a device via MeshCentral
#[tauri::command]
pub async fn meshcentral_reboot(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    if std::env::var("SAFE_MODE").is_ok() {
        return Err("Reboot disabled in SAFE_MODE (CI/test environment)".into());
    }
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.reboot(&server).await.map_err(|e| e.to_string())
}

/// Shutdown a device via MeshCentral
#[tauri::command]
pub async fn meshcentral_shutdown(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<(), String> {
    if std::env::var("SAFE_MODE").is_ok() {
        return Err("Shutdown disabled in SAFE_MODE (CI/test environment)".into());
    }
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.shutdown(&server).await.map_err(|e| e.to_string())
}

/// Get Docker containers on a device via MeshCentral
#[tauri::command]
pub async fn meshcentral_docker_containers(
    state: State<'_, AppState>,
    server_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.get_docker_containers(&server).await.map_err(|e| e.to_string())
}

/// Start a Docker container via MeshCentral
#[tauri::command]
pub async fn meshcentral_docker_start(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.docker_start(&server, &container).await.map_err(|e| e.to_string())?;
    Ok(format!("Started {}", container))
}

/// Stop a Docker container via MeshCentral
#[tauri::command]
pub async fn meshcentral_docker_stop(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.docker_stop(&server, &container).await.map_err(|e| e.to_string())?;
    Ok(format!("Stopped {}", container))
}

/// Restart a Docker container via MeshCentral
#[tauri::command]
pub async fn meshcentral_docker_restart(
    state: State<'_, AppState>,
    server_id: String,
    container: String,
) -> Result<String, String> {
    let transport = get_transport()?;
    let server = find_server(&state, &server_id)?;
    transport.docker_restart(&server, &container).await.map_err(|e| e.to_string())?;
    Ok(format!("Restarted {}", container))
}

/// ────────────────────────────────────────────────────────────────
/// Alert Center (2026-10-08) — Persistent alerts with SQLite backend
/// ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Alert {
    pub id: Option<i64>,
    pub severity: String,      // "critical" | "warning" | "info"
    pub title: String,
    pub message: String,
    pub device_id: Option<String>,
    pub source: String,        // "meshcentral" | "graphql" | "ssh" | "task" | "manual"
    pub acknowledged: bool,
    pub acknowledged_by: Option<String>,
    pub acknowledged_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub auto_ack_rule: Option<String>, // JSON rule for auto-acknowledgment
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AlertFilter {
    pub severity: Option<String>,
    pub device_id: Option<String>,
    pub acknowledged: Option<bool>,
    pub since: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

fn get_alerts_db_path() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let path = std::path::PathBuf::from(home).join(".config").join("master-control").join("alerts.db");
    Ok(path.to_string_lossy().to_string())
}

fn init_alerts_db() -> Result<rusqlite::Connection, String> {
    let path = get_alerts_db_path()?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            severity TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            device_id TEXT,
            source TEXT NOT NULL,
            acknowledged INTEGER NOT NULL DEFAULT 0,
            acknowledged_by TEXT,
            acknowledged_at TEXT,
            auto_ack_rule TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_alerts_device ON alerts(device_id)",
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at)",
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)",
        [],
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

#[tauri::command]
pub async fn alert_create(
    severity: String,
    title: String,
    message: String,
    device_id: Option<String>,
    source: String,
    auto_ack_rule: Option<String>,
) -> Result<Alert, String> {
    let conn = init_alerts_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "INSERT INTO alerts (severity, title, message, device_id, source, auto_ack_rule, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        rusqlite::params![severity, title, message, device_id, source, auto_ack_rule, now],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();
    Ok(Alert {
        id: Some(id),
        severity,
        title,
        message,
        device_id,
        source,
        acknowledged: false,
        acknowledged_by: None,
        acknowledged_at: None,
        created_at: now.clone(),
        updated_at: now,
        auto_ack_rule,
    })
}

#[tauri::command]
pub async fn alert_list(filter: Option<AlertFilter>) -> Result<Vec<Alert>, String> {
    let conn = init_alerts_db()?;
    let f = filter.unwrap_or_default();
    let mut query = "SELECT id, severity, title, message, device_id, source, acknowledged, acknowledged_by, acknowledged_at, auto_ack_rule, created_at, updated_at FROM alerts WHERE 1=1".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(s) = f.severity {
        query.push_str(" AND severity = ?");
        params.push(Box::new(s));
    }
    if let Some(d) = f.device_id {
        query.push_str(" AND device_id = ?");
        params.push(Box::new(d));
    }
    if let Some(a) = f.acknowledged {
        query.push_str(" AND acknowledged = ?");
        params.push(Box::new(a as i64));
    }
    if let Some(s) = f.since {
        query.push_str(" AND created_at >= ?");
        params.push(Box::new(s));
    }
    query.push_str(" ORDER BY created_at DESC");
    if let Some(l) = f.limit {
        query.push_str(" LIMIT ?");
        params.push(Box::new(l));
    }
    if let Some(o) = f.offset {
        query.push_str(" OFFSET ?");
        params.push(Box::new(o));
    }

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())), |row| {
        Ok(Alert {
            id: row.get(0)?,
            severity: row.get(1)?,
            title: row.get(2)?,
            message: row.get(3)?,
            device_id: row.get(4)?,
            source: row.get(5)?,
            acknowledged: row.get::<_, i64>(6)? != 0,
            acknowledged_by: row.get(7)?,
            acknowledged_at: row.get(8)?,
            auto_ack_rule: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut alerts = Vec::new();
    for row in rows {
        alerts.push(row.map_err(|e| e.to_string())?);
    }
    Ok(alerts)
}

#[tauri::command]
pub async fn alert_acknowledge(id: i64, acknowledged_by: String) -> Result<Alert, String> {
    let conn = init_alerts_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE alerts SET acknowledged = 1, acknowledged_by = ?1, acknowledged_at = ?2, updated_at = ?2 WHERE id = ?3",
        rusqlite::params![acknowledged_by, now, id],
    ).map_err(|e| e.to_string())?;
    alert_get(id).await
}

#[tauri::command]
pub async fn alert_acknowledge_all(device_id: Option<String>, acknowledged_by: String) -> Result<i64, String> {
    let conn = init_alerts_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    let mut query = "UPDATE alerts SET acknowledged = 1, acknowledged_by = ?1, acknowledged_at = ?2, updated_at = ?2 WHERE acknowledged = 0".to_string();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(acknowledged_by), Box::new(now.clone())];
    if let Some(d) = device_id {
        query.push_str(" AND device_id = ?");
        params.push(Box::new(d));
    }
    let changed = conn.execute(&query, rusqlite::params_from_iter(params.iter().map(|p| p.as_ref()))).map_err(|e| e.to_string())?;
    Ok(changed as i64)
}

#[tauri::command]
pub async fn alert_get(id: i64) -> Result<Alert, String> {
    let conn = init_alerts_db()?;
    let mut stmt = conn.prepare(
        "SELECT id, severity, title, message, device_id, source, acknowledged, acknowledged_by, acknowledged_at, auto_ack_rule, created_at, updated_at FROM alerts WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    let alert = stmt.query_row([id], |row| {
        Ok(Alert {
            id: row.get(0)?,
            severity: row.get(1)?,
            title: row.get(2)?,
            message: row.get(3)?,
            device_id: row.get(4)?,
            source: row.get(5)?,
            acknowledged: row.get::<_, i64>(6)? != 0,
            acknowledged_by: row.get(7)?,
            acknowledged_at: row.get(8)?,
            auto_ack_rule: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }).map_err(|e| e.to_string())?;
    Ok(alert)
}

#[tauri::command]
pub async fn alert_delete(id: i64) -> Result<(), String> {
    let conn = init_alerts_db()?;
    conn.execute("DELETE FROM alerts WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
    Ok(())
}

/// Auto-acknowledgment rules evaluator
#[tauri::command]
pub async fn alert_auto_ack_run() -> Result<i64, String> {
    let conn = init_alerts_db()?;
    let now = chrono::Utc::now().to_rfc3339();
    // Simple rule: auto-ack info alerts older than 1 hour
    let changed = conn.execute(
        "UPDATE alerts SET acknowledged = 1, acknowledged_by = 'auto', acknowledged_at = ?1, updated_at = ?1 
         WHERE acknowledged = 0 AND severity = 'info' AND datetime(created_at) < datetime('now', '-1 hour')",
        [now.clone()],
    ).map_err(|e| e.to_string())?;
    // CPU > 90% for 5m rule would need more complex evaluation
    Ok(changed as i64)
}

/// ────────────────────────────────────────────────────────────────
/// Historical Metrics (2026-10-08) — Time-series data for charts
/// ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricPoint {
    pub timestamp: String,
    pub value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetricSeries {
    pub metric: String,
    pub device_id: String,
    pub points: Vec<MetricPoint>,
}

fn get_metrics_db_path() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let path = std::path::PathBuf::from(home).join(".config").join("master-control").join("metrics.db");
    Ok(path.to_string_lossy().to_string())
}

fn init_metrics_db() -> Result<rusqlite::Connection, String> {
    let path = get_metrics_db_path()?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = rusqlite::Connection::open(&path).map_err(|e| e.to_string())?;
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id TEXT NOT NULL,
            metric TEXT NOT NULL,
            value REAL NOT NULL,
            timestamp TEXT NOT NULL DEFAULT (datetime('now'))
        )
        "#,
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_device_metric ON metrics(device_id, metric)",
        [],
    ).map_err(|e| e.to_string())?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp)",
        [],
    ).map_err(|e| e.to_string())?;
    // One-time normalization: legacy rows used datetime('now')
    // ("2026-10-09 14:23:05") or chrono RFC3339 with nanos/offsets, which
    // broke string BETWEEN against RFC3339 query bounds. All timestamps are
    // now fixed-format Zulu ("2026-10-09T14:23:05Z") — lexicographic order
    // matches chronological order.
    conn.execute(
        "UPDATE metrics SET timestamp = strftime('%Y-%m-%dT%H:%M:%SZ', timestamp) \
         WHERE timestamp NOT LIKE '%Z' AND strftime('%Y-%m-%dT%H:%M:%SZ', timestamp) IS NOT NULL",
        [],
    ).map_err(|e| e.to_string())?;
    Ok(conn)
}

/// Normalize any RFC3339 / SQLite timestamp the caller passes as a query
/// bound to the stored format: UTC, seconds precision, `Z` suffix.
fn normalize_metric_ts(s: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(s)
        .map(|d| {
            d.with_timezone(&chrono::Utc)
                .to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
        })
        .unwrap_or_else(|_| s.to_string())
}

#[tauri::command]
pub async fn metric_record(device_id: String, metric: String, value: f64) -> Result<(), String> {
    let conn = init_metrics_db()?;
    conn.execute(
        "INSERT INTO metrics (device_id, metric, value, timestamp) VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%SZ','now'))",
        rusqlite::params![device_id, metric, value],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn metric_query(device_id: String, metric: String, from: String, to: Option<String>, limit: Option<i64>) -> Result<Vec<MetricPoint>, String> {
    let conn = init_metrics_db()?;
    let from = normalize_metric_ts(&from);
    let to = normalize_metric_ts(&to.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()));
    let limit = limit.unwrap_or(1000);
    let mut stmt = conn.prepare(
        "SELECT timestamp, value FROM metrics WHERE device_id = ?1 AND metric = ?2 AND timestamp BETWEEN ?3 AND ?4 ORDER BY timestamp ASC LIMIT ?5"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params![device_id, metric, from, to, limit], |row| {
        Ok(MetricPoint { timestamp: row.get(0)?, value: row.get(1)? })
    }).map_err(|e| e.to_string())?;
    let mut points = Vec::new();
    for row in rows {
        points.push(row.map_err(|e| e.to_string())?);
    }
    Ok(points)
}

#[tauri::command]
pub async fn metric_query_multi(device_ids: Vec<String>, metrics: Vec<String>, from: String, to: Option<String>) -> Result<Vec<MetricSeries>, String> {
    let conn = init_metrics_db()?;
    let from = normalize_metric_ts(&from);
    let to = normalize_metric_ts(&to.unwrap_or_else(|| chrono::Utc::now().to_rfc3339()));
    let mut results = Vec::new();
    for device_id in device_ids {
        for metric in &metrics {
            let mut stmt = conn.prepare(
                "SELECT timestamp, value FROM metrics WHERE device_id = ?1 AND metric = ?2 AND timestamp BETWEEN ?3 AND ?4 ORDER BY timestamp ASC"
            ).map_err(|e| e.to_string())?;
            let rows = stmt.query_map(rusqlite::params![device_id, metric, from, to], |row| {
                Ok(MetricPoint { timestamp: row.get(0)?, value: row.get(1)? })
            }).map_err(|e| e.to_string())?;
            let mut points = Vec::new();
            for row in rows {
                points.push(row.map_err(|e| e.to_string())?);
            }
            if !points.is_empty() {
                results.push(MetricSeries { metric: metric.clone(), device_id: device_id.clone(), points });
            }
        }
    }
    Ok(results)
}

/// Background metrics collector - call periodically from frontend or systemd timer
#[tauri::command]
pub async fn metric_collect_all(state: State<'_, AppState>) -> Result<i64, String> {
    let transport = get_transport()?;
    let servers = state.servers.lock().clone();
    let conn = init_metrics_db()?;
    let mut recorded = 0i64;

    for server in servers {
        if server.meshcentral_device_id.is_none() {
            continue;
        }
        // Collect system stats via MeshCentral
        if let Ok(stats) = transport.get_system_stats(&server).await {
            let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
            let metrics = vec![
                ("cpu_usage", stats.cpu_usage),
                ("memory_usage_pct", stats.memory_usage_pct),
                ("cpu_cores", stats.cpu_cores as f64),
                ("load_1", stats.load_avg[0]),
                ("load_5", stats.load_avg[1]),
                ("load_15", stats.load_avg[2]),
            ];
            for (metric, value) in metrics {
                conn.execute(
                    "INSERT INTO metrics (device_id, metric, value, timestamp) VALUES (?1, ?2, ?3, ?4)",
                    rusqlite::params![server.id, metric, value, now],
                ).ok();
                recorded += 1;
            }
        }
    }

    // Retention: keep 30 days of history (timestamp is RFC3339 Zulu, lexicographic-safe)
    let cutoff = (chrono::Utc::now() - chrono::Duration::days(30))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    conn.execute("DELETE FROM metrics WHERE timestamp < ?1", rusqlite::params![cutoff]).ok();

    Ok(recorded)
}

/* ------------------------------------------------------------------ */
/* Prometheus query path (W6c-4) — app ← Unraid Prometheus (1y ret.)   */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Serialize)]
pub struct PromSeries {
    pub instance: String,
    pub points: Vec<MetricPoint>,
}

/// Range query against a Prometheus server. `base_url` comes from the
/// frontend (derived from servers.json → Unraid tailscale_ip) so no host
/// is hardcoded here. Unreachable/non-2xx/query errors → Err(...).
#[tauri::command]
pub async fn prom_query_range(
    base_url: String,
    query: String,
    start: String,
    end: String,
    step: String,
) -> Result<Vec<PromSeries>, String> {
    let url = format!("{}/api/v1/query_range", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .query(&[
            ("query", query.as_str()),
            ("start", start.as_str()),
            ("end", end.as_str()),
            ("step", step.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("prometheus unreachable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("prometheus http error: {e}"))?;
    let v: Value = resp.json().await.map_err(|e| e.to_string())?;
    if v.get("status").and_then(|s| s.as_str()) != Some("success") {
        let err = v
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("unknown prometheus error");
        return Err(format!("prometheus query failed: {err}"));
    }
    let none: Vec<Value> = Vec::new();
    let mut out = Vec::new();
    for r in v["data"]["result"].as_array().unwrap_or(&none) {
        let instance = r["metric"]["instance"]
            .as_str()
            .unwrap_or("unknown")
            .to_string();
        let mut points = Vec::new();
        for val in r["values"].as_array().unwrap_or(&none) {
            let ts = val.get(0).and_then(|t| t.as_f64()).unwrap_or(0.0);
            // Prometheus may return "NaN"/"+Inf" strings — parse, then keep
            // only finite values so charts stay clean.
            let num = val
                .get(1)
                .and_then(|x| x.as_str())
                .and_then(|s| s.parse::<f64>().ok());
            if let Some(value) = num {
                if value.is_finite() && ts > 0.0 {
                    points.push(MetricPoint {
                        timestamp: chrono::DateTime::from_timestamp(ts as i64, 0)
                            .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
                            .unwrap_or_default(),
                        value,
                    });
                }
            }
        }
        out.push(PromSeries { instance, points });
    }
    Ok(out)
}

/// Cheap readiness probe (GET /-/ready). Returns Ok(false) on any network
/// failure instead of Err — "not ready" is a normal state, not an error.
#[tauri::command]
pub async fn prometheus_health(base_url: String) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/-/ready", base_url.trim_end_matches('/'));
    match client.get(&url).send().await {
        Ok(r) => Ok(r.status().is_success()),
        Err(_) => Ok(false),
    }
}

/* ------------------------------------------------------------------ */
/* Unified Alert Intake (W6d) — Poll Prometheus + MC status changes    */
/* ------------------------------------------------------------------ */

#[derive(Debug, Clone, Deserialize)]
struct PromAlertLabels {
    alertname: String,
    // others passed through as JSON
    #[serde(flatten)]
    extra: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct PromAlertAnnotations {
    #[serde(flatten)]
    extra: std::collections::HashMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
struct PromAlert {
    labels: PromAlertLabels,
    annotations: PromAlertAnnotations,
    state: String,        // "firing" | "pending" | "inactive"
    fingerprint: String,  // unique key for dedup
    startsAt: String,
    endsAt: Option<String>,
    generatorURL: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PromAlertsResponse {
    status: String,
    data: PromAlertsData,
}

#[derive(Debug, Clone, Deserialize)]
struct PromAlertsData {
    alerts: Vec<PromAlert>,
}

/// Internal: check if we already have an alert for this fingerprint
fn alert_exists_by_fingerprint(conn: &rusqlite::Connection, fp: &str) -> Result<bool, String> {
    let mut stmt = conn.prepare(
        "SELECT 1 FROM alerts WHERE auto_ack_rule LIKE ?1 LIMIT 1"
    ).map_err(|e| e.to_string())?;
    // Store fingerprint in auto_ack_rule as "fp:<fingerprint>" for dedup
    let exists = stmt.query_row([format!("fp:%{}", fp)], |_| Ok(())).is_ok();
    Ok(exists)
}

/// Poll Prometheus `/api/v1/alerts` and create alerts for firing ones.
/// `base_url` is the Prometheus base (e.g., http://100.103.29.63:9090).
/// Returns created alerts.
#[tauri::command]
pub async fn poll_prometheus_alerts(base_url: String) -> Result<Vec<Alert>, String> {
    let url = format!("{}/api/v1/alerts", base_url.trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("prometheus alerts unreachable: {e}"))?
        .error_for_status()
        .map_err(|e| format!("prometheus alerts http error: {e}"))?;
    let v: PromAlertsResponse = resp.json().await.map_err(|e| e.to_string())?;
    if v.status != "success" {
        return Err(format!("prometheus alerts status: {}", v.status));
    }

    let conn = init_alerts_db()?;
    let mut created = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    for a in v.data.alerts {
        if a.state != "firing" {
            continue; // only create for firing alerts
        }
        // Dedup by fingerprint stored in auto_ack_rule
        if alert_exists_by_fingerprint(&conn, &a.fingerprint)? {
            continue;
        }
        let severity = match a.labels.extra.get("severity").map(|s| s.as_str()) {
            Some("critical") => "critical",
            Some("warning") => "warning",
            _ => "info",
        };
        let device_id = a.labels.extra.get("device")
            .or_else(|| a.labels.extra.get("instance"))
            .or_else(|| a.labels.extra.get("job"))
            .cloned();
        let title = a.labels.alertname.clone();
        let message = a.annotations.extra.get("description")
            .cloned()
            .or_else(|| a.annotations.extra.get("summary").cloned())
            .unwrap_or_else(|| format!("Prometheus alert: {}", a.labels.alertname));
        let auto_ack_rule = format!("fp:{}", a.fingerprint);

        conn.execute(
            "INSERT INTO alerts (severity, title, message, device_id, source, auto_ack_rule, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            rusqlite::params![severity, title, message, device_id, "prometheus", auto_ack_rule, now],
        ).map_err(|e| e.to_string())?;

        let id = conn.last_insert_rowid();
        created.push(Alert {
            id: Some(id),
            severity: severity.to_string(),
            title,
            message,
            device_id,
            source: "prometheus".to_string(),
            acknowledged: false,
            acknowledged_by: None,
            acknowledged_at: None,
            created_at: now.clone(),
            updated_at: now.clone(),
            auto_ack_rule: Some(format!("fp:{}", a.fingerprint)),
        });
    }
    Ok(created)
}

/// Store last-known MC device statuses for change detection.
/// Table: mc_device_status (device_id TEXT PRIMARY KEY, status TEXT, updated_at TEXT)
fn ensure_mc_status_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute(
        r#"
        CREATE TABLE IF NOT EXISTS mc_device_status (
            device_id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        "#,
        [],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_last_mc_status(conn: &rusqlite::Connection, device_id: &str) -> Result<Option<String>, String> {
    let mut stmt = conn.prepare("SELECT status FROM mc_device_status WHERE device_id = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query_map([device_id], |row| row.get(0)).map_err(|e| e.to_string())?;
    let status = rows.next().transpose().map_err(|e| e.to_string())?.flatten();
    Ok(status)
}

fn set_mc_status(conn: &rusqlite::Connection, device_id: &str, status: &str, now: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO mc_device_status (device_id, status, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(device_id) DO UPDATE SET status = ?2, updated_at = ?3",
        rusqlite::params![device_id, status, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Poll MeshCentral device statuses and create alerts on transitions.
/// Uses the existing transport layer to get current statuses.
/// Returns created alerts.
/// Internal: check MeshCentral status changes given transport + servers + conn.
/// (NOT a Tauri command — private helper; poll_meshcentral_status_changes wraps it.)
async fn poll_meshcentral_status_changes_inner(
    transport: &crate::meshcentral::transport::MeshCentralTransport,
    servers: &[crate::config::ServerConfig],
) -> Result<Vec<Alert>, String> {
    // Phase 1: collect statuses WITHOUT holding DB connection
    let now = chrono::Utc::now().to_rfc3339();
    let mut transitions = Vec::new(); // (mc_id, server_id, server_name, last_str, current_str)
    let mut status_updates = Vec::new(); // (mc_id, current_str)

    for server in servers {
        let mc_id = server.meshcentral_device_id.as_ref().map(|s| s.clone());
        let Some(mc_id) = mc_id else { continue; };
        let current_str = match transport.execute_shell(&server, "echo ok", Some(5)).await {
            Ok(_) => "online",
            Err(_) => "offline",
        };
        status_updates.push((mc_id.clone(), current_str.to_string()));
        // We'll check last status in phase 2 with DB
        transitions.push((mc_id, server.id.clone(), server.name.clone(), current_str.to_string()));
    }

    // Phase 2: with DB connection, check for changes and insert
    let conn = init_alerts_db()?;
    ensure_mc_status_table(&conn)?;
    let mut created = Vec::new();

    for (mc_id, server_id, server_name, current_str) in transitions {
        let last = get_last_mc_status(&conn, &mc_id)?;
        if let Some(last_str) = last {
            if last_str != current_str {
                let severity = if current_str == "offline" { "critical" } else { "info" };
                let title = format!("MeshCentral: {} is now {}", server_name, current_str);
                let message = format!("Device {} ({}) transitioned from {} to {}",
                    server_name, mc_id, last_str, current_str);
                let auto_ack_rule = format!("mc:{}:{}", mc_id, current_str);

                conn.execute(
                    "INSERT INTO alerts (severity, title, message, device_id, source, auto_ack_rule, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                    rusqlite::params![severity, title, message, Some(server_id.clone()), "meshcentral", auto_ack_rule, now],
                ).map_err(|e| e.to_string())?;

                let id = conn.last_insert_rowid();
                created.push(Alert {
                    id: Some(id),
                    severity: severity.to_string(),
                    title,
                    message,
                    device_id: Some(server_id.clone()),
                    source: "meshcentral".to_string(),
                    acknowledged: false,
                    acknowledged_by: None,
                    acknowledged_at: None,
                    created_at: now.clone(),
                    updated_at: now.clone(),
                    auto_ack_rule: Some(auto_ack_rule),
                });
            }
        }
    }

    // Phase 3: update stored statuses
    for (mc_id, current_str) in status_updates {
        set_mc_status(&conn, &mc_id, &current_str, &now)?;
    }

    Ok(created)
}

/// Poll MeshCentral device statuses and create alerts on transitions.
/// Uses the existing transport layer to get current statuses.
/// Returns created alerts.
#[tauri::command]
pub async fn poll_meshcentral_status_changes(state: State<'_, AppState>) -> Result<Vec<Alert>, String> {
    let transport = get_transport()?;
    let servers = state.servers.lock().clone();
    poll_meshcentral_status_changes_inner(&transport, &servers).await
}

/// Combined poller for all alert sources — call from frontend on interval.
/// Each sub-poller manages its own DB connection and transport (rusqlite::Connection
/// and any non-Send types cannot live across .await points in a Tauri command).
#[tauri::command]
pub async fn poll_all_alert_sources(
    state: State<'_, AppState>,
    prometheus_base_url: String,
) -> Result<Vec<Alert>, String> {
    let mut all = Vec::new();
    // Prometheus (creates own transport + DB connection)
    match poll_prometheus_alerts(prometheus_base_url).await {
        Ok(mut v) => all.append(&mut v),
        Err(e) => eprintln!("prometheus alert poll failed: {}", e),
    }
    // MeshCentral (creates own transport + DB connection internally)
    match poll_meshcentral_status_changes(state).await {
        Ok(mut v) => all.append(&mut v),
        Err(e) => eprintln!("meshcentral status poll failed: {}", e),
    }
    Ok(all)
}
