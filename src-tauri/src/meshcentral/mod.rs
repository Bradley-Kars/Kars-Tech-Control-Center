//! MeshCentral client for KTS Master Control
//!
//! Provides HTTP/WebSocket API access to MeshCentral server for device management,
//! telemetry, and remote operations. Uses `meshctrl runcommand` via SSH to execute
//! shell commands on target devices — this is the PRIMARY transport for fleet ops.

pub mod transport;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::config::MeshCentralConfig;

pub use transport::{
    MeshCentralTransport, MeshSystemStats, RemoteFileInfo, RemoteProcess, ShellResult,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshDevice {
    pub id: String,
    pub name: String,
    pub group: String,
    pub conn: i32,           // 0=offline, 1=online, 2=connected
    pub pwr: i32,            // power state
    pub platform: String,    // Windows, Linux, etc.
    pub ip: String,          // MeshCentral-reported IP
    pub last_connect: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub connected: bool,
    pub cpu_usage: Option<f64>,
    pub memory_usage_pct: Option<f64>,
    pub uptime: Option<String>,
    pub source: String,      // "meshcentral" | "ssh" | "graphql" | "adb"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchCommand {
    pub command: String,
    pub args: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub device_id: String,
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnrollmentInfo {
    pub agent_url: String,
    pub settings_url: String,
    pub group_id: String,
    pub install_command_linux: String,
    pub install_command_windows: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub devices_found: usize,
    pub devices_matched: usize,
    pub devices_new: usize,
    pub devices_updated: usize,
    pub errors: Vec<String>,
}

pub struct MeshCentralClient {
    config: MeshCentralConfig,
    base_url: String,
}

impl MeshCentralClient {
    pub fn new(config: MeshCentralConfig) -> Result<Self> {
        let base_url = config.server_url.clone().unwrap_or_else(|| "https://100.103.29.63:8444".to_string()).trim_end_matches('/').to_string();

        Ok(Self {
            config,
            base_url,
        })
    }

    /// Verify admin credentials for real by running `meshctrl ServerInfo`
    /// over SSH. MeshCentral's HTTP `/login` returns 200 for ANY
    /// credentials (it just serves the login page), so a status check
    /// proves nothing; meshctrl prints `Invalid login.` on bad creds and
    /// `serverTime:` on success (its exit code is 0 either way).
    pub async fn authenticate(&mut self) -> Result<()> {
        let (host, user, pass) = crate::commands::unraid_creds_from_servers()
            .map_err(|e| anyhow::anyhow!("Locating Unraid host for meshctrl: {e}"))?;
        let admin_user = self.config.admin_user.as_deref().unwrap_or("");
        let admin_pass = self.config.admin_pass.as_deref().unwrap_or("");
        let full_cmd = format!(
            "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js \
             --url wss://localhost:443/ --loginuser {} --loginpass {} ServerInfo",
            admin_user, admin_pass
        );

        let output = tokio::task::spawn_blocking(move || {
            run_ssh_command(&host, &user, &pass, &full_cmd, 30)
        })
        .await
        .context("meshctrl ServerInfo task join")?
        .map_err(|e| anyhow::anyhow!("meshctrl ServerInfo over SSH: {e}"))?;

        if output.contains("Invalid login") {
            anyhow::bail!("MeshCentral login rejected (bad admin credentials)");
        }
        if !output.contains("serverTime:") {
            anyhow::bail!(
                "MeshCentral ServerInfo unexpected output: {}",
                output.trim()
            );
        }
        Ok(())
    }

    /// List all devices in the configured group via `meshctrl ListDevices`
    /// executed over SSH on the Unraid host (the container can reach the
    /// local MeshCentral over wss://localhost:443).
    ///
    /// MeshCentral has no HTTP `/api/Devices` endpoint — that path 404s.
    /// `meshctrl` is the supported client; we reuse the same SSH hop as
    /// `execute_batch_via_ssh`.
    pub async fn list_devices(&mut self) -> Result<Vec<MeshDevice>> {
        let unraid = crate::commands::unraid_creds_from_servers()
            .map_err(|e| anyhow::anyhow!("Locating Unraid host for meshctrl: {e}"))?;

        let admin_user = self.config.admin_user.as_deref().unwrap_or("");
        let admin_pass = self.config.admin_pass.as_deref().unwrap_or("");
        let full_cmd = format!(
            "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js \
             --url wss://localhost:443/ --loginuser {} --loginpass {} ListDevices",
            admin_user, admin_pass
        );

        let output = tokio::task::spawn_blocking(move || {
            let (host, user, pass) = unraid;
            run_ssh_command(&host, &user, &pass, &full_cmd, 60)
        })
        .await
        .context("meshctrl ListDevices task join")??;

        parse_meshctrl_list_devices(&output)
    }

    /// Get device status (basic connectivity + telemetry if available)
    pub async fn get_device_status(&mut self, device_id: &str) -> Result<DeviceStatus> {
        let devices = self.list_devices().await?;
        let device = devices.iter().find(|d| d.id == device_id)
            .ok_or_else(|| anyhow::anyhow!("Device {} not found in MeshCentral", device_id))?;

        Ok(DeviceStatus {
            connected: device.conn >= 1,
            cpu_usage: None,      // Would need meshctrl for detailed telemetry
            memory_usage_pct: None,
            uptime: None,
            source: "meshcentral".to_string(),
        })
    }

    /// Execute batch commands on multiple devices via meshctrl over SSH
    /// This runs on the Unraid server where meshcentral container lives
    pub async fn execute_batch_via_ssh(
        &self,
        unraid_host: &str,
        unraid_user: &str,
        unraid_pass: &str,
        device_ids: &[String],
        commands: &[BatchCommand],
    ) -> Result<Vec<BatchResult>> {
        use ssh2::Session;
        use std::io::Read;
        use std::net::TcpStream;
        use std::time::Duration;

        let addr = format!("{}:22", unraid_host);
        let tcp = TcpStream::connect(&addr).context("TCP connect to Unraid")?;
        tcp.set_read_timeout(Some(Duration::from_secs(60)))?;
        tcp.set_write_timeout(Some(Duration::from_secs(60)))?;

        let mut session = Session::new().context("Create SSH session")?;
        session.set_tcp_stream(tcp);
        session.handshake().context("SSH handshake")?;

        session.userauth_password(unraid_user, unraid_pass)
            .context("SSH password auth")?;

        if !session.authenticated() {
            anyhow::bail!("SSH authentication failed");
        }

        let mut results = Vec::new();

        for device_id in device_ids {
            for cmd in commands {
                let admin_user = self.config.admin_user.as_deref().unwrap_or("");
                let admin_pass = self.config.admin_pass.as_deref().unwrap_or("");
                // --run + --reply: without --reply meshctrl returns no output
                let remote_cmd = if let Some(args) = &cmd.args {
                    format!("{} {}", cmd.command, args.join(" ")).trim().to_string()
                } else {
                    cmd.command.clone()
                };
                let full_cmd = format!(
                    "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js --url wss://localhost:443/ --loginuser {} --loginpass {} runcommand --id '{}' --run '{}' --reply",
                    admin_user, admin_pass, device_id,
                    remote_cmd.replace('\'', "'\\''")
                );

                let mut channel = session.channel_session().context("Open SSH channel")?;
                channel.exec(&full_cmd).context("Execute meshctrl command")?;

                let mut output = String::new();
                channel.read_to_string(&mut output).context("Read stdout")?;

                let mut stderr = String::new();
                channel.stderr().read_to_string(&mut stderr).context("Read stderr")?;

                channel.wait_close().ok();

                // meshctrl prints arg-help errors on stdout with empty
                // stderr — exclude those from the success heuristic.
                let success = (stderr.is_empty() || output.contains("ok"))
                    && !output.contains("Missing ")
                    && !output.contains("use --");
                results.push(BatchResult {
                    device_id: device_id.clone(),
                    success,
                    output,
                    error: if stderr.is_empty() { None } else { Some(stderr) },
                });
            }
        }

        Ok(results)
    }

    /// Get MeshCentral web terminal URL for a device
    pub fn get_terminal_url(&self, device_id: &str) -> String {
        format!("{}/terminal?device={}", self.base_url, device_id)
    }

    /// Get MeshCentral file manager URL for a device
    pub fn get_file_manager_url(&self, device_id: &str) -> String {
        format!("{}/filemanager?device={}", self.base_url, device_id)
    }

    /// Generate enrollment information for a new device
    pub fn get_enrollment_info(&self, device_type: &str) -> EnrollmentInfo {
        let group_id = self.config.group_id.as_deref().unwrap_or("Ue@jnclbq6C$Kog76Aje3z$jrFkuFGESAZWFQT1W74Ot@fWcTP9AG04Q2Na1TlpD");
        let group_id_encoded = urlencoding::encode(group_id);
        let agent_id = match device_type {
            "linux" | "bazzite" | "htpc" | "laptop" => "6",      // Linux x64
            "windows" => "4",                                       // Windows x64
            _ => "6",
        };

        let agent_url = format!("{}/meshagents?id={}&meshid={}", self.base_url, agent_id, group_id_encoded);
        let settings_url = format!("{}/meshsettings?id={}", self.base_url, group_id_encoded);

        let install_command_linux = format!(
            "BASE={}\nD=/usr/local/mesh_services/meshagent\nmkdir -p \"$D\"\ncurl -k -o \"$D/meshagent\" \"$BASE/meshagents?id=6\"\ncurl -k -o \"$D/meshagent.msh\" \"$BASE/meshsettings?id={}\"\nchmod 755 \"$D/meshagent\"\ncat > /etc/systemd/system/meshagent.service <<'UNIT'\n[Unit]\nDescription=MeshCentral Agent\nAfter=network-online.target\nWants=network-online.target\n[Service]\nType=simple\nWorkingDirectory=/usr/local/mesh_services/meshagent\nExecStart=/usr/local/mesh_services/meshagent/meshagent\nRestart=always\nRestartSec=10\n[Install]\nWantedBy=multi-user.target\nUNIT\nsystemctl daemon-reload && systemctl enable --now meshagent",
            self.base_url, group_id_encoded
        );

        let install_command_windows = format!(
            r#"$u = '{}/meshagents?id=4&meshid={}&installflags=1'
$exe = Join-Path $env:TEMP 'meshagent.exe'
curl.exe -k -sS -o $exe $u
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$elev = (New-Object Security.Principal.WindowsPrincipal($id)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $elev) {{ Write-Output 'NOT_ELEVATED'; exit 1 }}
$pr = Start-Process -FilePath $exe -ArgumentList '-fullinstall' -Wait -PassThru
Write-Output ('install_exit=' + $pr.ExitCode)
Start-Sleep -Seconds 6
(Get-Service 'Mesh Agent').Status"#,
            self.base_url, group_id_encoded
        );

        EnrollmentInfo {
            agent_url,
            settings_url,
            group_id: group_id.to_string(),
            install_command_linux,
            install_command_windows,
        }
    }

    /// Sync MeshCentral device inventory to servers.json
    /// Matches by hostname/IP and updates meshcentral_device_id, status, enrolled_at
    pub async fn sync_to_servers_json(
        &mut self,
        servers: &mut [crate::config::ServerConfig],
    ) -> Result<SyncResult> {
        let mc_devices = self.list_devices().await?;
        let mut result = SyncResult {
            devices_found: mc_devices.len(),
            devices_matched: 0,
            devices_new: 0,
            devices_updated: 0,
            errors: Vec::new(),
        };

        for mc_device in &mc_devices {
            // Match by tailscale IP, or by normalized name/id/hostname
            let matched = servers.iter_mut().find(|s| {
                s.service_keys.tailscale_ip.as_ref() == Some(&mc_device.ip)
                    || mc_name_matches_server(&mc_device.name, s)
            });

            if let Some(server) = matched {
                result.devices_matched += 1;
                let mut updated = false;

                if server.meshcentral_device_id.as_ref() != Some(&mc_device.id) {
                    server.meshcentral_device_id = Some(mc_device.id.clone());
                    updated = true;
                }

                let new_status = match mc_device.conn {
                    0 => "offline",
                    1 => "online",
                    2 => "connected",
                    _ => "unknown",
                };
                if server.meshcentral_status.as_ref() != Some(&new_status.to_string()) {
                    server.meshcentral_status = Some(new_status.to_string());
                    updated = true;
                }

                if server.meshcentral_enrolled_at.is_none() && mc_device.conn >= 1 {
                    server.meshcentral_enrolled_at = Some(chrono::Utc::now().to_rfc3339());
                    updated = true;
                }

                if updated {
                    result.devices_updated += 1;
                }
            } else {
                result.devices_new += 1;
                result.errors.push(format!(
                    "unmatched (no servers.json entry for '{}')",
                    mc_device.name
                ));
            }
        }

        Ok(result)
    }
}

/// Normalize a fleet name for matching: lowercase, alphanumeric only
/// ("Harley's Laptop (MSI, teen)" -> "harleyslaptopmsiteen").
pub fn norm_fleet_key(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

/// True if a MeshCentral device name refers to this server.
/// Checks normalized id / name / hostname (short and full) for equality,
/// and containment for parenthetical aliases such as a display name
/// "ROG Ally (LGBTAlly)" matching MC device "LGBTAlly". Containment only
/// applies at >= 4 normalized chars to avoid tiny false positives.
pub fn mc_name_matches_server(mc_name: &str, server: &crate::config::ServerConfig) -> bool {
    let mc = norm_fleet_key(mc_name);
    if mc.is_empty() {
        return false;
    }
    let short_host = server.hostname.split('.').next().unwrap_or("");
    let keys = [
        norm_fleet_key(&server.id),
        norm_fleet_key(&server.name),
        norm_fleet_key(short_host),
        norm_fleet_key(&server.hostname),
    ];
    keys.iter().any(|k| {
        if k.is_empty() {
            return false;
        }
        if *k == mc {
            return true;
        }
        mc.len() >= 4 && k.len() >= 4 && (k.contains(&mc) || mc.contains(k))
    })
}

/// Run one command over SSH (password auth) and return its stdout.
/// Blocking — call from `spawn_blocking`. Fails with stderr when the command
/// produced no stdout but did print an error.
pub fn run_ssh_command(
    host: &str,
    user: &str,
    pass: &str,
    cmd: &str,
    timeout_secs: u64,
) -> Result<String> {
    use ssh2::Session;
    use std::io::Read;
    use std::net::TcpStream;
    use std::time::Duration;

    let addr = format!("{}:22", host);
    let tcp = TcpStream::connect(&addr).context("TCP connect")?;
    tcp.set_read_timeout(Some(Duration::from_secs(timeout_secs)))?;
    tcp.set_write_timeout(Some(Duration::from_secs(timeout_secs)))?;

    let mut session = Session::new().context("Create SSH session")?;
    session.set_tcp_stream(tcp);
    session.handshake().context("SSH handshake")?;
    session.userauth_password(user, pass).context("SSH password auth")?;
    if !session.authenticated() {
        anyhow::bail!("SSH authentication failed");
    }

    let mut channel = session.channel_session().context("Open SSH channel")?;
    channel.exec(cmd).context("Execute SSH command")?;

    let mut stdout = String::new();
    channel.read_to_string(&mut stdout).context("Read SSH stdout")?;
    let mut stderr = String::new();
    let _ = channel.stderr().read_to_string(&mut stderr);
    channel.wait_close().ok();

    if stdout.trim().is_empty() && !stderr.trim().is_empty() {
        anyhow::bail!("SSH command failed: {}", stderr.trim());
    }
    Ok(stdout)
}

/// Parse `meshctrl ListDevices` output into `MeshDevice` records.
///
/// Shape (CSV-ish, human-formatted):
/// ```text
/// Device group: "Home"
/// id, name, icon, conn, pwr
/// -------------------------
/// "QZUw...", "HTPC", 1, 1, 1
/// ```
/// Platform/IP aren't in this listing; name matching drives servers.json sync.
fn parse_meshctrl_list_devices(output: &str) -> Result<Vec<MeshDevice>> {
    let mut devices = Vec::new();
    let mut group = String::new();

    for line in output.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("Device group:") {
            group = rest.trim().trim_matches('"').to_string();
            continue;
        }
        if line.is_empty() || line.starts_with('"') == false {
            continue; // headers, dashes, notes
        }

        // "id", "name", icon, conn, pwr
        let Some(mut rest) = line.strip_prefix('"') else { continue };
        let Some(end) = rest.find('"') else { continue };
        let id = rest[..end].to_string();
        rest = &rest[end + 1..];

        let Some(rest2) = rest.trim_start().strip_prefix(',') else { continue };
        let mut rest = rest2.trim_start();
        let Some(rest2) = rest.strip_prefix('"') else { continue };
        let Some(end) = rest2.find('"') else { continue };
        let name = rest2[..end].to_string();
        rest = &rest2[end + 1..];

        let nums: Vec<i32> = rest
            .split(',')
            .filter_map(|s| s.trim().parse::<i32>().ok())
            .collect();
        if nums.len() < 3 {
            continue;
        }

        devices.push(MeshDevice {
            id,
            name,
            group: group.clone(),
            conn: nums[1],
            pwr: nums[2],
            platform: String::new(),
            ip: String::new(),
            last_connect: None,
        });
    }

    if devices.is_empty() {
        anyhow::bail!("No devices parsed from meshctrl ListDevices output:\n{output}");
    }
    Ok(devices)
}
