//! MeshCentral Transport Layer
//!
//! Provides a unified transport for executing operations on MeshCentral-enrolled devices.
//! Uses `meshctrl runcommand` via SSH to the Unraid server to execute shell commands
//! on target devices. This is the PRIMARY transport for all fleet operations.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;

use super::MeshCentralClient;
use crate::config::MeshCentralConfig;

/// Result of a shell command execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShellResult {
    pub device_id: String,
    pub command: String,
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// File info from remote device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileInfo {
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub modified: Option<String>,
    pub permissions: Option<String>,
}

/// Process info from remote device
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteProcess {
    pub pid: u32,
    pub name: String,
    pub cpu_percent: Option<f64>,
    pub memory_percent: Option<f64>,
    pub user: Option<String>,
    pub command: Option<String>,
}

/// System stats gathered via shell commands
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeshSystemStats {
    pub hostname: String,
    pub kernel: String,
    pub os_release: String,
    pub arch: String,
    pub uptime: String,
    pub cpu_usage: f64,
    pub cpu_cores: u32,
    pub cpu_threads: u32,
    pub cpu_brand: String,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_free_mb: u64,
    pub memory_usage_pct: f64,
    #[serde(default)]
    pub swap_total_mb: u64,
    #[serde(default)]
    pub swap_used_mb: u64,
    #[serde(default)]
    pub cpu_speed_ghz: f64,
    pub load_avg: [f64; 3],
    pub platform: String,  // "linux" | "windows"
    pub source: String,    // "meshcentral"
}

/// Transport for executing operations via MeshCentral
pub struct MeshCentralTransport {
    config: MeshCentralConfig,
    /// Cache of device IDs to avoid repeated lookups
    device_id_cache: Mutex<HashMap<String, String>>, // server_id -> meshcentral_device_id
}

impl MeshCentralTransport {
    pub fn new(config: MeshCentralConfig) -> Self {
        Self {
            config,
            device_id_cache: Mutex::new(HashMap::new()),
        }
    }

    /// Get the meshcentral device ID for a server config (stored id, or a
    /// previously resolved/cached one)
    fn get_device_id(&self, server: &crate::config::ServerConfig) -> Option<String> {
        server.meshcentral_device_id.clone().or_else(|| {
            self.device_id_cache
                .lock()
                .ok()?
                .get(&server.id)
                .cloned()
        })
    }

    /// Resolve a server's MeshCentral device id against the live MC inventory
    /// when servers.json has no `meshcentral_device_id` yet (fresh clone,
    /// pre-sync). Matches by tailscale IP, hostname, or display name — the
    /// same keys `sync_to_servers_json` uses — and caches the result.
    async fn resolve_device_id(&self, server: &crate::config::ServerConfig) -> Result<String> {
        if let Some(id) = self.get_device_id(server) {
            return Ok(id);
        }
        let mut client = MeshCentralClient::new(self.config.clone())
            .context("MeshCentral client for device resolution")?;
        let devices = client
            .list_devices()
            .await
            .context("MeshCentral list_devices for device resolution")?;
        let device = devices
            .iter()
            .find(|d| {
                server.service_keys.tailscale_ip.as_ref() == Some(&d.ip)
                    || super::mc_name_matches_server(&d.name, server)
            })
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "No MeshCentral device matches server '{}' (hostname '{}', name '{}')",
                    server.id,
                    server.hostname,
                    server.name
                )
            })?;
        if let Ok(mut cache) = self.device_id_cache.lock() {
            cache.insert(server.id.clone(), device.id.clone());
        }
        Ok(device.id.clone())
    }

    /// Execute a single shell command on a device via meshctrl
    pub async fn execute_shell(
        &self,
        server: &crate::config::ServerConfig,
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<ShellResult> {
        let device_id = match self.get_device_id(server) {
            Some(id) => id,
            // No stored/cached id — resolve against live MC inventory
            None => self.resolve_device_id(server).await?,
        };

        let admin_user = self.config.admin_user.as_deref().unwrap_or("");
        let admin_pass = self.config.admin_pass.as_deref().unwrap_or("");
        let unraid_host = self.get_unraid_host(server)?;

        // Build the meshctrl command (--run + --reply: without --reply
        // meshctrl fires the command and returns no output)
        let meshctrl_cmd = format!(
            "docker exec meshcentral node /opt/meshcentral/meshcentral/meshctrl.js --url wss://localhost:443/ --loginuser {} --loginpass {} runcommand --id '{}' --run '{}' --reply",
            admin_user, admin_pass, device_id, command.replace('\'', "'\\''")
        );

        // Execute via SSH to Unraid
        let output = self.execute_ssh_command(&unraid_host, &meshctrl_cmd, timeout_secs).await?;

        // Parse meshctrl output - it returns the command output
        let (exit_code, stdout, stderr) = self.parse_meshctrl_output(&output);

        Ok(ShellResult {
            device_id: device_id.clone(),
            command: command.to_string(),
            exit_code,
            stdout,
            stderr,
            success: exit_code == 0,
        })
    }

    /// Execute multiple shell commands on a device (sequential)
    pub async fn execute_shell_batch(
        &self,
        server: &crate::config::ServerConfig,
        commands: &[&str],
        timeout_secs: Option<u64>,
    ) -> Result<Vec<ShellResult>> {
        let mut results = Vec::new();
        for cmd in commands {
            let result = self.execute_shell(server, cmd, timeout_secs).await?;
            results.push(result);
        }
        Ok(results)
    }

    /// Execute the same command on multiple devices in parallel
    pub async fn execute_shell_on_devices(
        &self,
        servers: &[crate::config::ServerConfig],
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<Vec<ShellResult>> {
        // Resolve missing device ids up front so the fleet pays for one
        // list_devices round-trip instead of one per device; failures fall
        // through to per-device resolution/execution errors below.
        for server in servers {
            if self.get_device_id(server).is_none() {
                if let Err(e) = self.resolve_device_id(server).await {
                    eprintln!("meshcentral: resolve {} failed: {e}", server.id);
                }
            }
        }
        let mut handles = Vec::new();
        for server in servers {
            let transport = self.clone();
            let server = server.clone();
            let command = command.to_string();
            let timeout = timeout_secs;
            handles.push(tokio::spawn(async move {
                transport.execute_shell(&server, &command, timeout).await
            }));
        }

        let mut results = Vec::new();
        for handle in handles {
            match handle.await {
                Ok(Ok(result)) => results.push(result),
                Ok(Err(e)) => results.push(ShellResult {
                    device_id: "unknown".to_string(),
                    command: command.to_string(),
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    success: false,
                }),
                Err(e) => results.push(ShellResult {
                    device_id: "unknown".to_string(),
                    command: command.to_string(),
                    exit_code: -1,
                    stdout: String::new(),
                    stderr: e.to_string(),
                    success: false,
                }),
            }
        }
        Ok(results)
    }

    /// Read a file from a remote device
    pub async fn read_file(
        &self,
        server: &crate::config::ServerConfig,
        path: &str,
    ) -> Result<String> {
        // Use cat for text files, base64 for binary
        let cmd = format!("cat '{}' 2>/dev/null || base64 -w0 '{}' 2>/dev/null", path.replace('\'', "'\\''"), path.replace('\'', "'\\''"));
        let result = self.execute_shell(server, &cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to read file {}: {}", path, result.stderr);
        }
        Ok(result.stdout)
    }

    /// Write a file to a remote device
    pub async fn write_file(
        &self,
        server: &crate::config::ServerConfig,
        path: &str,
        content: &str,
        mode: Option<u32>,
    ) -> Result<()> {
        // Use heredoc for safe writing
        let escaped = content.replace('\'', "'\\''");
        let cmd = if let Some(m) = mode {
            format!("cat > '{}' <<'EOF'\n{}\nEOF\nchmod {:o} '{}'", path.replace('\'', "'\\''"), escaped, m, path.replace('\'', "'\\''"))
        } else {
            format!("cat > '{}' <<'EOF'\n{}\nEOF", path.replace('\'', "'\\''"), escaped)
        };
        let result = self.execute_shell(server, &cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to write file {}: {}", path, result.stderr);
        }
        Ok(())
    }

    /// List directory contents
    pub async fn list_dir(
        &self,
        server: &crate::config::ServerConfig,
        path: &str,
    ) -> Result<Vec<RemoteFileInfo>> {
        let cmd = format!("ls -la '{}' 2>/dev/null | tail -n +2", path.replace('\'', "'\\''"));
        let result = self.execute_shell(server, &cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to list dir {}: {}", path, result.stderr);
        }

        // Parse ls -la output
        let mut files = Vec::new();
        for line in result.stdout.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 9 {
                let permissions = parts[0].to_string();
                let size = parts[4].parse::<u64>().ok();
                let modified = format!("{} {} {}", parts[5], parts[6], parts[7]);
                let name = parts[8..].join(" ");
                let is_dir = permissions.starts_with('d');
                let full_path = if path.ends_with('/') { format!("{}{}", path, name) } else { format!("{}/{}", path, name) };
                files.push(RemoteFileInfo {
                    path: full_path,
                    is_dir,
                    size,
                    modified: Some(modified),
                    permissions: Some(permissions),
                });
            }
        }
        Ok(files)
    }

    /// Get system stats via shell commands (cross-platform)
    pub async fn get_system_stats(
        &self,
        server: &crate::config::ServerConfig,
    ) -> Result<MeshSystemStats> {
        // Detect platform first
        let platform_result = self.execute_shell(server, "uname -s", Some(10)).await?;
        let platform = if platform_result.stdout.trim().to_lowercase().contains("windows") {
            "windows"
        } else {
            "linux"
        };

        if platform == "linux" {
            self.get_linux_system_stats(server).await
        } else {
            self.get_windows_system_stats(server).await
        }
    }

    /// Get Linux system stats via shell commands
    async fn get_linux_system_stats(
        &self,
        server: &crate::config::ServerConfig,
    ) -> Result<MeshSystemStats> {
        // Single bundled command to get all stats (like linux_client.rs)
        let cmd = r#"echo "hostname=$(hostname)"; \
echo "kernel=$(uname -r)"; \
echo "os=$(grep PRETTY_NAME /etc/os-release 2>/dev/null | cut -d'"' -f2 || cat /etc/os-release 2>/dev/null | head -1 || echo 'Linux')"; \
echo "arch=$(uname -m)"; \
echo "uptime=$(uptime -p 2>/dev/null || uptime | sed 's/.*up //' | sed 's/,.*//')"; \
echo "cores=$(grep -c ^processor /proc/cpuinfo)"; \
echo "brand=$(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2- | sed 's/^[[:space:]]*//' 2>/dev/null || echo 'Unknown')"; \
echo "mhz=$(grep 'cpu MHz' /proc/cpuinfo | head -1 | awk '{print $4}' 2>/dev/null || echo '0')"; \
echo "load=$(cat /proc/loadavg)"; \
echo "tz=$(cat /etc/timezone 2>/dev/null || timedatectl 2>/dev/null | grep 'Time zone' | awk '{print $3}' || echo 'UTC')"; \
echo "cpu1=$(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat)"; \
sleep 0.5; \
echo "cpu2=$(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat)"; \
echo "memtotal=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)"; \
echo "memfree=$(awk '/^MemFree:/{print $2}' /proc/meminfo)"; \
echo "memavail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)"; \
echo "swaptotal=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)"; \
echo "swapfree=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)""#;

        let result = self.execute_shell(server, cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to get system stats: {}", result.stderr);
        }

        let parse = |key: &str| -> String {
            result.stdout.lines()
                .find(|l| l.starts_with(&format!("{}=", key)))
                .map(|l| l[key.len() + 1..].to_string())
                .unwrap_or_default()
        };

        let parse_kb = |key: &str| -> u64 {
            parse(key).parse::<u64>().unwrap_or(0)
        };

        // Parse CPU usage from two /proc/stat samples
        let cpu1 = parse("cpu1");
        let cpu2 = parse("cpu2");
        let cpu_usage = parse_cpu_delta(&cpu1, &cpu2);

        let mem_total_kb = parse_kb("memtotal");
        let mem_free_kb = parse_kb("memfree");
        let mem_available_kb = parse_kb("memavail");
        let swap_total_kb = parse_kb("swaptotal");
        let swap_free_kb = parse_kb("swapfree");

        let mem_used_kb = mem_total_kb.saturating_sub(mem_available_kb);
        let swap_used_kb = swap_total_kb.saturating_sub(swap_free_kb);

        let cpu_speed = parse("mhz").parse::<f64>().unwrap_or(0.0) / 1000.0;
        let cpu_cores = parse("cores").parse::<u32>().unwrap_or(1);

        Ok(MeshSystemStats {
            hostname: parse("hostname"),
            kernel: parse("kernel"),
            os_release: parse("os"),
            arch: parse("arch"),
            uptime: parse("uptime"),
            cpu_usage,
            cpu_cores,
            cpu_threads: cpu_cores,
            cpu_brand: {
                let b = parse("brand");
                if b.is_empty() { "Unknown".to_string() } else { b }
            },
            memory_total_mb: mem_total_kb / 1024,
            memory_used_mb: mem_used_kb / 1024,
            memory_free_mb: mem_free_kb / 1024,
            memory_usage_pct: if mem_total_kb > 0 {
                (mem_used_kb as f64 / mem_total_kb as f64) * 100.0
            } else { 0.0 },
            swap_total_mb: swap_total_kb / 1024,
            swap_used_mb: swap_used_kb / 1024,
            cpu_speed_ghz: cpu_speed,
            load_avg: parse_loadavg(&parse("load")),
            platform: "linux".to_string(),
            source: "meshcentral".to_string(),
        })
    }

    /// Get Windows system stats via shell commands
    async fn get_windows_system_stats(
        &self,
        server: &crate::config::ServerConfig,
    ) -> Result<MeshSystemStats> {
        let cmd = r#"powershell -NoProfile -Command "
$cs = Get-CimInstance Win32_ComputerSystem
$os = Get-CimInstance Win32_OperatingSystem
$cpu = Get-CimInstance Win32_Processor
$mem = Get-CimInstance Win32_OperatingSystem
Write-Host \"hostname=$($cs.Name)\"
Write-Host \"kernel=$($os.Version)\"
Write-Host \"os=$($os.Caption)\"
Write-Host \"arch=$($os.OSArchitecture)\"
Write-Host \"uptime=$((Get-Date) - $os.LastBootUpTime | ForEach-Object { '{0}d {1}h {2}m' -f $_.Days,$_.Hours,$_.Minutes })\"
Write-Host \"cores=$($cpu.NumberOfLogicalProcessors)\"
Write-Host \"brand=$($cpu.Name)\"
Write-Host \"mhz=$($cpu.MaxClockSpeed)\"
Write-Host \"load=0,0,0\"
Write-Host \"tz=$(Get-TimeZone).Id\"
Write-Host \"memtotal=$($mem.TotalVisibleMemorySize)\"
Write-Host \"memfree=$($mem.FreePhysicalMemory)\"
""#;

        let result = self.execute_shell(server, cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to get Windows system stats: {}", result.stderr);
        }

        let parse = |key: &str| -> String {
            result.stdout.lines()
                .find(|l| l.starts_with(&format!("{}=", key)))
                .map(|l| l[key.len() + 1..].to_string())
                .unwrap_or_default()
        };

        let cpu_usage = 0.0; // Would need two samples for Windows
        let mem_total_kb = parse("memtotal").parse::<u64>().unwrap_or(0);
        let mem_free_kb = parse("memfree").parse::<u64>().unwrap_or(0);
        let mem_used_kb = mem_total_kb.saturating_sub(mem_free_kb);

        Ok(MeshSystemStats {
            hostname: parse("hostname"),
            kernel: parse("kernel"),
            os_release: parse("os"),
            arch: parse("arch"),
            uptime: parse("uptime"),
            cpu_usage,
            cpu_cores: parse("cores").parse::<u32>().unwrap_or(1),
            cpu_threads: parse("cores").parse::<u32>().unwrap_or(1),
            cpu_brand: {
                let b = parse("brand");
                if b.is_empty() { "Unknown".to_string() } else { b }
            },
            memory_total_mb: mem_total_kb / 1024,
            memory_used_mb: mem_used_kb / 1024,
            memory_free_mb: mem_free_kb / 1024,
            memory_usage_pct: if mem_total_kb > 0 {
                (mem_used_kb as f64 / mem_total_kb as f64) * 100.0
            } else { 0.0 },
            swap_total_mb: 0,
            swap_used_mb: 0,
            cpu_speed_ghz: parse("mhz").parse::<f64>().unwrap_or(0.0) / 1000.0,
            load_avg: [0.0, 0.0, 0.0],
            platform: "windows".to_string(),
            source: "meshcentral".to_string(),
        })
    }

    /// Get running processes
    pub async fn get_processes(
        &self,
        server: &crate::config::ServerConfig,
        limit: Option<usize>,
    ) -> Result<Vec<RemoteProcess>> {
        let cmd = if server.service_keys.os.as_deref().unwrap_or("").to_lowercase().contains("windows") {
            "powershell -NoProfile -Command \"Get-Process | Sort-Object CPU -Descending | Select-Object -First 50 Id,ProcessName,CPU,WS,UserName | ConvertTo-Json\""
        } else {
            "ps aux --sort=-%cpu | head -50"
        };

        let result = self.execute_shell(server, cmd, Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to get processes: {}", result.stderr);
        }

        let mut processes = Vec::new();
        if server.service_keys.os.as_deref().unwrap_or("").to_lowercase().contains("windows") {
            // Parse JSON output
            if let Ok(json) = serde_json::from_str::<Vec<serde_json::Value>>(&result.stdout) {
                for p in json {
                    processes.push(RemoteProcess {
                        pid: p["Id"].as_u64().unwrap_or(0) as u32,
                        name: p["ProcessName"].as_str().unwrap_or("").to_string(),
                        cpu_percent: p["CPU"].as_f64(),
                        memory_percent: None, // Would need calculation
                        user: p["UserName"].as_str().map(|s| s.to_string()),
                        command: None,
                    });
                }
            }
        } else {
            // Parse ps aux output
            for line in result.stdout.lines().skip(1) {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 11 {
                    processes.push(RemoteProcess {
                        pid: parts[1].parse().unwrap_or(0),
                        name: parts[10].to_string(),
                        cpu_percent: parts[2].parse().ok(),
                        memory_percent: parts[3].parse().ok(),
                        user: Some(parts[0].to_string()),
                        command: Some(parts[10..].join(" ")),
                    });
                }
            }
        }

        if let Some(l) = limit {
            processes.truncate(l);
        }
        Ok(processes)
    }

    /// Reboot a device
    pub async fn reboot(&self, server: &crate::config::ServerConfig) -> Result<()> {
        let result = self.execute_shell(server, "reboot", Some(10)).await?;
        if !result.success {
            anyhow::bail!("Reboot failed: {}", result.stderr);
        }
        Ok(())
    }

    /// Shutdown a device
    pub async fn shutdown(&self, server: &crate::config::ServerConfig) -> Result<()> {
        let result = self.execute_shell(server, "poweroff", Some(10)).await?;
        if !result.success {
            anyhow::bail!("Shutdown failed: {}", result.stderr);
        }
        Ok(())
    }

    /// Get Docker containers on a device (if Docker is installed)
    pub async fn get_docker_containers(
        &self,
        server: &crate::config::ServerConfig,
    ) -> Result<Vec<serde_json::Value>> {
        let cmd = "docker ps -a --format 'json'";
        let result = self.execute_shell(server, cmd, Some(30)).await?;
        if !result.success {
            // Docker not available or no permission
            return Ok(Vec::new());
        }

        let mut containers = Vec::new();
        for line in result.stdout.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                containers.push(json);
            }
        }
        Ok(containers)
    }

    /// Start a Docker container
    pub async fn docker_start(
        &self,
        server: &crate::config::ServerConfig,
        container: &str,
    ) -> Result<()> {
        let result = self.execute_shell(server, &format!("docker start {}", container), Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to start container {}: {}", container, result.stderr);
        }
        Ok(())
    }

    /// Stop a Docker container
    pub async fn docker_stop(
        &self,
        server: &crate::config::ServerConfig,
        container: &str,
    ) -> Result<()> {
        let result = self.execute_shell(server, &format!("docker stop {}", container), Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to stop container {}: {}", container, result.stderr);
        }
        Ok(())
    }

    /// Restart a Docker container
    pub async fn docker_restart(
        &self,
        server: &crate::config::ServerConfig,
        container: &str,
    ) -> Result<()> {
        let result = self.execute_shell(server, &format!("docker restart {}", container), Some(30)).await?;
        if !result.success {
            anyhow::bail!("Failed to restart container {}: {}", container, result.stderr);
        }
        Ok(())
    }

    // Helper: Execute command via SSH to Unraid (where meshctrl runs)
    async fn execute_ssh_command(
        &self,
        host: &str,
        command: &str,
        timeout_secs: Option<u64>,
    ) -> Result<String> {
        use ssh2::Session;
        use std::io::Read;
        use std::net::TcpStream;

        let addr = format!("{}:22", host);
        let tcp = TcpStream::connect(&addr).context("TCP connect to Unraid")?;
        tcp.set_read_timeout(Some(Duration::from_secs(timeout_secs.unwrap_or(60))))?;
        tcp.set_write_timeout(Some(Duration::from_secs(timeout_secs.unwrap_or(60))))?;

        let mut session = Session::new().context("Create SSH session")?;
        session.set_tcp_stream(tcp);
        session.handshake().context("SSH handshake")?;

        let (unraid_user, unraid_pass) = self.get_unraid_credentials()?;
        session.userauth_password(&unraid_user, &unraid_pass)
            .context("SSH password auth")?;

        if !session.authenticated() {
            anyhow::bail!("SSH authentication failed");
        }

        let mut channel = session.channel_session().context("Open SSH channel")?;
        channel.exec(command).context("Execute command")?;

        let mut output = String::new();
        channel.read_to_string(&mut output).context("Read stdout")?;

        let mut stderr = String::new();
        channel.stderr().read_to_string(&mut stderr).context("Read stderr")?;

        channel.wait_close().ok();

        if !stderr.is_empty() && output.is_empty() {
            // Some meshctrl output goes to stderr, include it
            output.push_str("\n---STDERR---\n");
            output.push_str(&stderr);
        }

        Ok(output)
    }

    // Helper: Get Unraid host from server config (assumes Unraid is the meshctrl host)
    fn get_unraid_host(&self, _server: &crate::config::ServerConfig) -> Result<String> {
        // For now, hardcoded to Unraid. In future, could be configurable per device.
        Ok("100.103.29.63".to_string())
    }

    // Helper: Get Unraid credentials
    fn get_unraid_credentials(&self) -> Result<(String, String)> {
        Ok((
            "root".to_string(),
            "".to_string(),
        ))
    }

    // Helper: Parse meshctrl output to extract exit code, stdout, stderr
    fn parse_meshctrl_output(&self, output: &str) -> (i32, String, String) {
        // meshctrl output format varies. Typically:
        // - Success: command output on stdout
        // - Error: error message on stderr
        // The exit code isn't directly returned, so we infer from stderr
        let stderr_start = output.find("---STDERR---");
        let (stdout_part, stderr_part) = if let Some(idx) = stderr_start {
            (&output[..idx], &output[idx + 12..])
        } else {
            (output, "")
        };

        let stderr_clean = stderr_part.trim();
        let exit_code = if stderr_clean.is_empty() { 0 } else { 1 };

        (exit_code, stdout_part.trim().to_string(), stderr_clean.to_string())
    }
}

impl Clone for MeshCentralTransport {
    fn clone(&self) -> Self {
        Self {
            config: self.config.clone(),
            device_id_cache: Mutex::new(
                self.device_id_cache
                    .lock()
                    .map(|c| c.clone())
                    .unwrap_or_default(),
            ),
        }
    }
}

/// Parse CPU usage from two /proc/stat samples
fn parse_cpu_delta(cpu1: &str, cpu2: &str) -> f64 {
    let parse_cpu = |s: &str| -> Option<(u64, u64)> {
        let parts: Vec<u64> = s.split_whitespace()
            .filter_map(|x| x.parse().ok())
            .collect();
        if parts.len() >= 10 {
            let idle = parts[3] + parts[4]; // idle + iowait
            let total: u64 = parts.iter().sum();
            Some((idle, total))
        } else { None }
    };

    let Some((idle1, total1)) = parse_cpu(cpu1) else { return 0.0; };
    let Some((idle2, total2)) = parse_cpu(cpu2) else { return 0.0; };

    let total_diff = total2.saturating_sub(total1);
    let idle_diff = idle2.saturating_sub(idle1);

    if total_diff > 0 {
        100.0 * (1.0 - (idle_diff as f64 / total_diff as f64))
    } else {
        0.0
    }
}

fn parse_loadavg(s: &str) -> [f64; 3] {
    let parts: Vec<f64> = s.split_whitespace()
        .take(3)
        .filter_map(|x| x.parse().ok())
        .collect();
    [parts.get(0).copied().unwrap_or(0.0),
     parts.get(1).copied().unwrap_or(0.0),
     parts.get(2).copied().unwrap_or(0.0)]
}