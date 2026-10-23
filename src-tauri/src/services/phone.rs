use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr, TcpStream, ToSocketAddrs};
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

/// Cache of a *working* serial per phone hostname, shared process-wide.
///
/// Android's wireless-debugging port rotates whenever wireless debugging is
/// toggled or the device reboots. When a probe fails we scan the host for the
/// live ADB port, update this cache, and reuse it until the next failure —
/// so a port rotation no longer bricks every phone command until restart.
static SERIAL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn serial_cache() -> &'static Mutex<HashMap<String, String>> {
    SERIAL_CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cached_serial(host: &str) -> Option<String> {
    serial_cache()
        .lock()
        .ok()
        .and_then(|c| c.get(host).cloned())
}

fn set_cached_serial(host: &str, serial: &str) {
    if let Ok(mut c) = serial_cache().lock() {
        c.insert(host.to_string(), serial.to_string());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneConfig {
    pub hostname: String,
    pub port: u16,
    pub adb_serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneDeviceInfo {
    pub model: String,
    pub android_version: String,
    pub api_level: String,
    pub serial: String,
    pub oneui_version: Option<String>,
    pub manufacturer: String,
    pub brand: String,
    pub build_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneBattery {
    pub level: u32,
    pub status: String,
    pub health: String,
    pub temperature: f64,
    pub voltage: u32,
    pub technology: String,
    pub charging: bool,
    pub plugged: String,
    pub current_ua: Option<i64>,
    /// Battery charge cycle count, when the kernel/driver exposes it
    /// (via the ACTION_BATTERY_CHANGED history record).
    pub cycle_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneThermal {
    pub battery_temp_c: Option<f64>,
    pub cpu_temp_c: Option<f64>,
    pub gpu_temp_c: Option<f64>,
    pub ambient_temp_c: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneStorage {
    pub total_gb: f64,
    pub free_gb: f64,
    pub used_gb: f64,
    pub used_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneMemory {
    pub total_mb: u64,
    pub available_mb: u64,
    pub free_mb: u64,
    pub cached_mb: u64,
    pub buffers_mb: u64,
    pub used_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneCpu {
    pub usage_pct: f64,
    pub cores: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneScreen {
    pub on: bool,
    pub brightness: u32,
    pub max_brightness: u32,
    pub auto_brightness: bool,
    pub resolution: String,
    pub density: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneNetwork {
    pub wifi_ssid: Option<String>,
    pub wifi_ip: Option<String>,
    pub wifi_rssi: Option<String>,
    pub wifi_link_speed: Option<String>,
    pub bluetooth_on: bool,
    pub mobile_data: bool,
    pub airplane_mode: bool,
    pub cellular_type: Option<String>,
    pub cellular_level: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneApp {
    pub package: String,
    pub version: Option<String>,
    pub version_code: Option<String>,
    pub path: Option<String>,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneProcess {
    pub pid: u32,
    pub name: String,
    pub cpu_pct: Option<f32>,
    pub memory_kb: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhoneActivity {
    pub package: String,
    pub activity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsMessage {
    pub id: u64,
    pub address: String,
    pub body: String,
    pub date: u64,
    pub read: bool,
    pub type_: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmsConversation {
    pub address: String,
    pub contact_name: Option<String>,
    pub last_message: String,
    pub last_timestamp: u64,
    pub unread_count: u32,
    pub message_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactInfo {
    pub id: i64,
    pub display_name: String,
    pub phone_numbers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallLogEntry {
    pub id: i64,
    pub number: String,
    pub name: Option<String>,
    pub type_: String,
    pub date: i64,
    pub duration: i64,
}

pub struct PhoneClient {
    host: String,
    configured_serial: String,
}

impl PhoneClient {
    pub fn new(config: PhoneConfig) -> Result<Self> {
        let configured_serial = config
            .adb_serial
            .clone()
            .unwrap_or_else(|| format!("{}:{}", config.hostname, config.port));
        Ok(Self {
            host: config.hostname.clone(),
            configured_serial,
        })
    }

    /// Best-known serial for the device: cached discovered serial, else the
    /// one out of config. The auto-discovery path updates the cache.
    fn effective_serial(&self) -> String {
        cached_serial(&self.host).unwrap_or_else(|| self.configured_serial.clone())
    }

    /// Run a shell command once with an explicit serial (no discovery).
    async fn adb_shell_with(&self, serial: &str, cmd: &str) -> Result<String> {
        let serial = serial.to_string();
        let cmd = cmd.to_string();
        let output = tokio::task::spawn_blocking(move || {
            Command::new("adb")
                .args(["-s", &serial, "shell", &cmd])
                .output()
        })
        .await
        .context("ADB command failed")??;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB shell failed: {}", stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Run an adb subcommand once with an explicit serial (no discovery).
    async fn adb_exec_with(&self, serial: &str, args: &[&str]) -> Result<String> {
        let serial = serial.to_string();
        let args = args.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let output = tokio::task::spawn_blocking(move || {
            let mut cmd = Command::new("adb");
            cmd.arg("-s").arg(&serial).args(&args);
            cmd.output()
        })
        .await
        .context("ADB command failed")??;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("ADB exec failed: {}", stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    /// Ports Android's wireless-debugging listener may sit on. The UI picks a
    /// random high port (observed 35k-46k, can rotate anywhere into the
    /// ephemeral range), so sweep the whole dynamic range.
    const CANDIDATE_PORTS: std::ops::RangeInclusive<u16> = 30000..=65535;

    /// Resolve the phone hostname (Tailscale MagicDNS works fine).
    fn resolve(host: &str) -> Vec<IpAddr> {
        (host, 1u16)
            .to_socket_addrs()
            .ok()
            .into_iter()
            .flatten()
            .map(|a| a.ip())
            .collect()
    }

    /// `Some(online)` when the tailnet has an opinion about this IP, `None`
    /// when we cannot tell (tailscale CLI unavailable, peer unknown). Matched
    /// by IP: HostName strings differ from the MagicDNS name and there may be
    /// several phones on the tailnet.
    fn tailnet_online(ip: &IpAddr) -> Option<bool> {
        let out = Command::new("tailscale")
            .args(["status", "--json"])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let value: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
        let ip_str = ip.to_string();
        let peers = value.get("Peer")?.as_object()?;
        for (_, peer) in peers {
            let Some(ips) = peer.get("TailscaleIPs").and_then(|v| v.as_array()) else {
                continue;
            };
            if ips.iter().any(|x| x.as_str() == Some(ip_str.as_str())) {
                return peer.get("Online").and_then(|o| o.as_bool());
            }
        }
        None
    }

    /// Probe a phone IP concurrently for open TCP ports in range. Cheap:
    /// refused connections (the common case) fail in milliseconds.
    async fn scan_open_ports(ip: IpAddr) -> Vec<u16> {
        tokio::task::spawn_blocking(move || {
            let ports: Vec<u16> = Self::CANDIDATE_PORTS.collect();
            let open = Mutex::new(Vec::new());
            let next = AtomicUsize::new(0);

            let total = ports.len();
            let workers = 128;
            std::thread::scope(|scope| {
                for _ in 0..workers {
                    scope.spawn(|| loop {
                        let idx = next.fetch_add(1, Ordering::Relaxed);
                        if idx >= total {
                            break;
                        }
                        let port = ports[idx];
                        let addr = SocketAddr::new(ip, port);
                        if TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok() {
                            open.lock().expect("open mutex").push(port);
                        }
                    });
                }
            });

            let open_ports = open.lock().expect("open mutex").clone();
            open_ports
        })
        .await
        .unwrap_or_default()
    }

    /// Port out of a "host:port" serial, when it has one.
    fn port_of(serial: &str) -> Option<u16> {
        serial.rsplit_once(':').and_then(|(_, p)| p.parse().ok())
    }

    /// Global `adb connect HOST[:PORT]`. `-s <serial> connect` is invalid adb
    /// syntax (HOST is a positional argument), and adb exits 0 even when the
    /// connection fails, so the textual result decides success here.
    async fn adb_connect(target: &str) -> Result<String> {
        let target = target.to_string();
        let output = tokio::task::spawn_blocking(move || {
            Command::new("adb").args(["connect", &target]).output()
        })
        .await
        .context("adb connect failed to run")??;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        // Success: "connected to X" / "already connected to X".
        // Failure: "failed to connect to X" / "cannot connect to X".
        if text.contains("connected to") {
            Ok(text.trim().to_string())
        } else {
            anyhow::bail!("adb connect failed: {}", text.trim());
        }
    }

    /// Connect and prove the shell answers. adb keys every transport by the
    /// exact string used at connect time (the hostname and IP forms of the
    /// same endpoint never match each other), so try both `target` and `twin`
    /// and cache whichever one actually works.
    async fn connect_and_alive(&self, target: &str, twin: Option<&str>) -> Result<()> {
        Self::adb_connect(target).await?;
        for candidate in [Some(target), twin].into_iter().flatten() {
            if self.adb_shell_with(candidate, "echo alive").await.is_ok() {
                set_cached_serial(&self.host, candidate);
                return Ok(());
            }
        }
        anyhow::bail!("adb connect {target} reported success but the shell stayed dead")
    }

    /// Ensure we have a working serial: cached/configured serial first, then a
    /// tailnet online-check (fail fast instead of sweeping an absent phone),
    /// then a direct connect on the configured port, then a scan for the
    /// rotated wireless-debugging port. Working serials land in the shared
    /// cache so later calls skip all of this.
    pub async fn ensure_connected(&self) -> Result<()> {
        // 1) Already-cached or configured serial that answers.
        let serial = self.effective_serial();
        if self.adb_shell_with(&serial, "echo alive").await.is_ok() {
            set_cached_serial(&self.host, &serial);
            return Ok(());
        }

        let Some(ip) = Self::resolve(&self.host).first().copied() else {
            anyhow::bail!("Cannot resolve phone hostname {}", self.host);
        };

        // Fail fast when the phone is gone from the tailnet — otherwise every
        // probe against an offline device becomes a multi-second port sweep.
        let online = tokio::task::spawn_blocking(move || Self::tailnet_online(&ip))
            .await
            .unwrap_or(None);
        if matches!(online, Some(false)) {
            anyhow::bail!("Phone {} is offline on the tailnet", self.host);
        }

        // 2) Connect the configured serial (with its IP twin — the transport
        //    may be keyed by either form).
        let twin = Self::port_of(&self.configured_serial).map(|p| format!("{ip}:{p}"));
        if self
            .connect_and_alive(&self.configured_serial, twin.as_deref())
            .await
            .is_ok()
        {
            return Ok(());
        }

        // 3) Scan for the rotated wireless-debugging port.
        for port in Self::scan_open_ports(ip).await {
            let target = format!("{}:{}", self.host, port);
            let twin = format!("{ip}:{port}");
            if self.connect_and_alive(&target, Some(&twin)).await.is_ok() {
                return Ok(());
            }
        }

        anyhow::bail!(
            "No ADB device found for {} (configured serial {} unreachable, scanned {}-{})",
            self.host,
            self.configured_serial,
            Self::CANDIDATE_PORTS.start(),
            Self::CANDIDATE_PORTS.end()
        )
    }

    /// Shell a command against the device, reconnecting (and if needed
    /// rediscovering the port) when the current serial has gone stale.
    async fn adb_shell(&self, cmd: &str) -> Result<String> {
        match self.adb_shell_with(&self.effective_serial(), cmd).await {
            Ok(out) => Ok(out),
            Err(_) => {
                self.ensure_connected().await?;
                self.adb_shell_with(&self.effective_serial(), cmd).await
            }
        }
    }

    /// Run an adb subcommand against the device, reconnecting (and if needed
    /// rediscovering) when the current serial has gone stale.
    async fn adb_exec(&self, args: &[&str]) -> Result<String> {
        match self.adb_exec_with(&self.effective_serial(), args).await {
            Ok(out) => Ok(out),
            Err(_) => {
                self.ensure_connected().await?;
                self.adb_exec_with(&self.effective_serial(), args).await
            }
        }
    }

    pub async fn connect(&self) -> Result<()> {
        self.ensure_connected().await
    }

    pub async fn is_alive(&self) -> bool {
        self.adb_shell_with(&self.effective_serial(), "echo alive")
            .await
            .is_ok()
    }

    pub async fn get_device_info(&self) -> Result<PhoneDeviceInfo> {
        let props = self.adb_shell("getprop ro.product.model; getprop ro.build.version.release; getprop ro.build.version.sdk; getprop ro.serialno; getprop ro.build.version.oneui; getprop ro.product.manufacturer; getprop ro.product.brand; getprop ro.build.fingerprint").await?;
        let lines: Vec<&str> = props.lines().collect();

        Ok(PhoneDeviceInfo {
            model: lines.first().unwrap_or(&"Unknown").to_string(),
            android_version: lines.get(1).unwrap_or(&"Unknown").to_string(),
            api_level: lines.get(2).unwrap_or(&"Unknown").to_string(),
            serial: lines.get(3).unwrap_or(&"Unknown").to_string(),
            oneui_version: lines.get(4).map(|s| s.to_string()),
            manufacturer: lines.get(5).unwrap_or(&"Unknown").to_string(),
            brand: lines.get(6).unwrap_or(&"Unknown").to_string(),
            build_fingerprint: lines.get(7).unwrap_or(&"Unknown").to_string(),
        })
    }

    pub async fn get_battery(&self) -> Result<PhoneBattery> {
        let output = self.adb_shell("dumpsys battery").await?;

        let parse_field = |key: &str| -> Option<String> {
            output
                .lines()
                .find(|l| {
                    let trimmed = l.trim();
                    trimmed.starts_with(key) && trimmed[key.len()..].trim_start().starts_with(':')
                })
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
        };

        let level = parse_field("level")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let status = parse_field("status").unwrap_or_else(|| "Unknown".to_string());
        let health = parse_field("health").unwrap_or_else(|| "Unknown".to_string());
        let temp_str = parse_field("temperature").unwrap_or("0".to_string());
        let temperature = (temp_str.parse::<f64>().unwrap_or(0.0) / 10.0 * 10.0).round() / 10.0;
        let voltage = parse_field("voltage")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        let technology = parse_field("technology").unwrap_or_else(|| "Li-ion".to_string());
        let current_str = parse_field("current now").unwrap_or("0".to_string());
        let current_ua = current_str.parse::<i64>().ok();

        // Samsung (and some other OEMs) omit "current now" from dumpsys battery;
        // fall back to the latest ACTION_BATTERY_CHANGED history line, which
        // carries current_avg (µA) plus cycle_count.
        let last_battery_event = output
            .lines()
            .rev()
            .find(|l| l.contains("ACTION_BATTERY_CHANGED"));
        let current_ua = current_ua.filter(|v| *v != 0).or_else(|| {
            last_battery_event
                .and_then(|l| l.split("current_avg:").nth(1))
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse::<i64>().ok())
        });
        let cycle_count = last_battery_event
            .and_then(|l| l.split("cycle_count:").nth(1))
            .and_then(|s| s.split(',').next())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .filter(|v| *v > 0);

        let charging = status == "2" || status == "5";

        let plugged_str = parse_field("plugged").unwrap_or("0".to_string());
        let plugged = match plugged_str.as_str() {
            "1" => "AC",
            "2" => "USB",
            "4" => "Wireless",
            _ => "None",
        }
        .to_string();

        Ok(PhoneBattery {
            level,
            status,
            health,
            temperature,
            voltage,
            technology,
            charging,
            plugged,
            current_ua,
            cycle_count,
        })
    }

    /// Temperatures from the SoC's thermal zones (battery/CPU/GPU/ambient).
    /// Zones report millicelsius; `dumpsys battery` temperature (tenths of °C)
    /// is the fallback for battery when no battery zone is exposed.
    pub async fn get_thermal(&self) -> Result<PhoneThermal> {
        let zones = self
            .adb_shell(
                "for z in /sys/class/thermal/thermal_zone*; do \
                   t=$(cat $z/type 2>/dev/null); \
                   v=$(cat $z/temp 2>/dev/null); \
                   [ -n \"$t\" ] && [ -n \"$v\" ] && echo \"$t=$v\"; \
                 done",
            )
            .await
            .unwrap_or_default();

        let mut battery = None;
        let mut cpu = None;
        let mut gpu = None;
        let mut ambient = None;
        let mut cpu_readings: Vec<f64> = Vec::new();

        for line in zones.lines() {
            let Some((ty, val)) = line.split_once('=') else {
                continue;
            };
            let Ok(milli) = val.trim().parse::<f64>() else {
                continue;
            };
            let deg = milli / 1000.0;
            if deg <= 0.0 || deg > 120.0 {
                continue;
            }
            let ty_l = ty.to_lowercase();
            if ty_l.contains("gpu") {
                if gpu.is_none() {
                    gpu = Some(deg);
                }
            } else if ty_l.contains("batt") || ty_l.contains("charger") || ty_l.contains("pmic") {
                if battery.is_none() {
                    battery = Some(deg);
                }
            } else if ty_l.contains("ambient") {
                if ambient.is_none() {
                    ambient = Some(deg);
                }
            } else if ty_l.contains("cpu") {
                cpu_readings.push(deg);
            }
        }
        if cpu.is_none() && !cpu_readings.is_empty() {
            cpu = Some(cpu_readings.iter().copied().fold(f64::MAX, f64::min));
        }

        // Battery fallback: dumpsys reports temperature in tenths of a degree.
        if battery.is_none() {
            if let Ok(out) = self.adb_shell("dumpsys battery").await {
                if let Some(l) = out
                    .lines()
                    .find(|l| l.trim_start().starts_with("temperature"))
                {
                    if let Some(v) = l
                        .split(':')
                        .nth(1)
                        .and_then(|s| s.trim().parse::<f64>().ok())
                    {
                        if v > 0.0 {
                            battery = Some(v / 10.0);
                        }
                    }
                }
            }
        }

        Ok(PhoneThermal {
            battery_temp_c: battery,
            cpu_temp_c: cpu,
            gpu_temp_c: gpu,
            ambient_temp_c: ambient,
        })
    }

    pub async fn get_storage(&self) -> Result<PhoneStorage> {
        let output = self.adb_shell("df -h /data").await?;
        let lines: Vec<&str> = output.lines().collect();

        if lines.len() >= 2 {
            let parts: Vec<&str> = lines[1].split_whitespace().collect();
            if parts.len() >= 4 {
                let total = parse_size(parts[1]);
                let used = parse_size(parts[2]);
                let free = parse_size(parts[3]);
                let used_pct = if total > 0.0 {
                    (used / total) * 100.0
                } else {
                    0.0
                };

                return Ok(PhoneStorage {
                    total_gb: total,
                    free_gb: free,
                    used_gb: used,
                    used_pct,
                });
            }
        }

        Ok(PhoneStorage {
            total_gb: 0.0,
            free_gb: 0.0,
            used_gb: 0.0,
            used_pct: 0.0,
        })
    }

    pub async fn get_memory(&self) -> Result<PhoneMemory> {
        let output = self.adb_shell("cat /proc/meminfo").await?;

        let parse_kb = |key: &str| -> u64 {
            output
                .lines()
                .find(|l| l.starts_with(key))
                .and_then(|l| l.split_whitespace().nth(1))
                .and_then(|s| s.parse().ok())
                .unwrap_or(0)
        };

        let total = parse_kb("MemTotal:");
        let free = parse_kb("MemFree:");
        let available = parse_kb("MemAvailable:");
        let cached = parse_kb("Cached:");
        let buffers = parse_kb("Buffers:");
        let used = total.saturating_sub(available);
        let used_pct = if total > 0 {
            (used as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        Ok(PhoneMemory {
            total_mb: total / 1024,
            available_mb: available / 1024,
            free_mb: free / 1024,
            cached_mb: cached / 1024,
            buffers_mb: buffers / 1024,
            used_pct,
        })
    }

    /// Overall CPU usage across all cores over a ~1s window, plus core count.
    /// One ADB round-trip: sample `/proc/stat`, sleep 1s, sample again, then
    /// count cores (falling back to a grep if `nproc` is missing).
    pub async fn get_cpu_usage(&self) -> Result<PhoneCpu> {
        let output = self
            .adb_shell(
                "cat /proc/stat | head -1; sleep 1; cat /proc/stat | head -1; \
                 (nproc 2>/dev/null || grep -c '^cpu[0-9]' /proc/stat)",
            )
            .await?;
        let lines: Vec<&str> = output.lines().collect();
        if lines.len() < 3 {
            anyhow::bail!("unexpected /proc/stat output");
        }

        // Line format: "cpu  user nice system idle iowait irq softirq steal ..."
        let parse_cpu = |line: &str| -> Option<(u64, u64)> {
            let mut parts = line.split_whitespace();
            parts.next()?; // "cpu"
            let vals: Vec<u64> = parts.filter_map(|s| s.parse().ok()).collect();
            if vals.len() < 4 {
                return None;
            }
            let idle = vals[3] + vals.get(4).copied().unwrap_or(0); // idle + iowait
            let total: u64 = vals.iter().sum();
            Some((idle, total))
        };

        let (idle0, total0) =
            parse_cpu(lines[0]).ok_or_else(|| anyhow::anyhow!("bad cpu sample"))?;
        let (idle1, total1) =
            parse_cpu(lines[1]).ok_or_else(|| anyhow::anyhow!("bad cpu sample"))?;
        let cores = lines[2].trim().parse::<u32>().unwrap_or(1).max(1);

        let idle_delta = idle1.saturating_sub(idle0);
        let total_delta = total1.saturating_sub(total0);
        let usage_pct = if total_delta > 0 {
            ((1.0 - idle_delta as f64 / total_delta as f64) * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };

        Ok(PhoneCpu { usage_pct, cores })
    }

    pub async fn get_screen(&self) -> Result<PhoneScreen> {
        let wakefulness = self.adb_shell("dumpsys power | grep mWakefulness=").await?;
        let on = wakefulness.contains("Awake");

        let brightness_str = self
            .adb_shell("settings get system screen_brightness")
            .await?;
        let brightness = brightness_str.parse().unwrap_or(0);

        let max_brightness_str = self
            .adb_shell("settings get system screen_brightness_max")
            .await
            .unwrap_or("255".to_string());
        let max_brightness = max_brightness_str.parse().unwrap_or(255);

        let auto_str = self
            .adb_shell("settings get system screen_brightness_mode")
            .await?;
        let auto_brightness = auto_str.trim() == "1";

        let size = self.adb_shell("wm size").await?;
        let resolution = size.replace("Physical size: ", "");

        let density_str = self.adb_shell("wm density").await?;
        let density = density_str
            .replace("Physical density: ", "")
            .parse()
            .unwrap_or(0);

        Ok(PhoneScreen {
            on,
            brightness,
            max_brightness,
            auto_brightness,
            resolution,
            density,
        })
    }

    pub async fn get_network(&self) -> Result<PhoneNetwork> {
        let wifi_output = self.adb_shell("dumpsys wifi | grep 'mWifiInfo'").await?;

        let wifi_line = wifi_output
            .lines()
            .find(|l| l.contains("mWifiInfo"))
            .unwrap_or("");

        // All fields are comma-separated on one line: SSID: "Batcave", BSSID: ..., RSSI: -50, Link speed: 1297Mbps
        let ssid = wifi_line
            .split("SSID: ")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().trim_matches('"').to_string());

        let rssi = wifi_line
            .split("RSSI: ")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().to_string())
            .filter(|s| s.parse::<i32>().is_ok());

        let link_speed = wifi_line
            .split("Link speed: ")
            .nth(1)
            .and_then(|s| s.split(',').next())
            .map(|s| s.trim().to_string());

        let ip_output = self.adb_shell("ip addr show wlan0").await?;
        let ip = ip_output
            .lines()
            .find(|l| l.contains("inet "))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|s| s.split('/').next())
            .map(|s| s.to_string());

        let bluetooth_str = self
            .adb_shell("settings get global bluetooth_on")
            .await
            .unwrap_or("0".to_string());
        let mobile_str = self
            .adb_shell("settings get global mobile_data")
            .await
            .unwrap_or("0".to_string());
        let airplane_str = self
            .adb_shell("settings get global airplane_mode_on")
            .await
            .unwrap_or("0".to_string());

        // Cellular signal from telephony registry
        let telephony_output = self
            .adb_shell("dumpsys telephony.registry | grep 'mSignalStrength'")
            .await
            .unwrap_or_default();

        let mut cellular_type = String::from("Unknown");
        let mut cellular_level = 0i32;

        for line in telephony_output.lines() {
            if line.contains("mSignalStrength") {
                // Parse level from: ... level = 3 ...
                if let Some(level_str) = line.split("level = ").nth(1) {
                    if let Some(level_val) = level_str.split_whitespace().next() {
                        cellular_level = level_val.parse::<i32>().unwrap_or(0);
                    }
                }
                // Parse network type from mSignalStrength line: ... rat=20,primary=...
                if let Some(rat_str) = line.split("rat=").nth(1) {
                    if let Some(rat_val) = rat_str.split(',').next() {
                        if let Some(rat_num) = rat_val.split_whitespace().next() {
                            cellular_type = match rat_num.parse::<i32>().unwrap_or(0) {
                                14 => "LTE".to_string(),
                                20 => "5G".to_string(),
                                13 => "UMTS".to_string(),
                                1 => "GPRS".to_string(),
                                2 => "EDGE".to_string(),
                                _ => format!("Type {}", rat_num),
                            };
                        }
                    }
                }
            }
        }

        Ok(PhoneNetwork {
            wifi_ssid: ssid,
            wifi_ip: ip,
            wifi_rssi: rssi,
            wifi_link_speed: link_speed,
            bluetooth_on: bluetooth_str.trim() == "1",
            mobile_data: mobile_str.trim() == "1",
            airplane_mode: airplane_str.trim() == "1",
            cellular_type: Some(cellular_type),
            cellular_level: Some(cellular_level),
        })
    }

    pub async fn get_installed_apps(&self) -> Result<Vec<PhoneApp>> {
        let output = self.adb_shell("pm list packages -3 -r -u").await?;

        let mut apps = Vec::new();
        for line in output.lines() {
            // Without '-f', `pm list packages` prints one 'package:<name>' per line
            if let Some(pkg) = line.strip_prefix("package:") {
                let package = pkg.trim();
                if package.is_empty() {
                    continue;
                }
                let path = None;

                let version = match self
                    .adb_shell(&format!("dumpsys package {} | grep versionName", package))
                    .await
                {
                    Ok(output) => output
                        .lines()
                        .next()
                        .and_then(|l| l.split('=').nth(1))
                        .map(|s| s.trim().to_string()),
                    Err(_) => None,
                };

                let version_code = match self
                    .adb_shell(&format!("dumpsys package {} | grep versionCode", package))
                    .await
                {
                    Ok(output) => output
                        .lines()
                        .next()
                        .and_then(|l| l.split('=').nth(1))
                        .map(|s| s.trim().to_string()),
                    Err(_) => None,
                };

                apps.push(PhoneApp {
                    package: package.to_string(),
                    version,
                    version_code,
                    path,
                    enabled: true,
                });
            }
        }

        Ok(apps)
    }

    pub async fn get_running_processes(&self) -> Result<Vec<PhoneProcess>> {
        let output = self.adb_shell("ps -A -o PID,NAME,%CPU,%MEM").await?;

        let mut processes = Vec::new();
        for line in output.lines().skip(1).take(20) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 4 {
                if let (Ok(pid), Ok(cpu), Ok(mem)) = (
                    parts[0].parse::<u32>(),
                    parts[2].parse::<f32>(),
                    parts[3].parse::<f64>(),
                ) {
                    processes.push(PhoneProcess {
                        pid,
                        name: parts[1].to_string(),
                        cpu_pct: Some(cpu),
                        memory_kb: Some((mem * 1024.0) as u64),
                    });
                }
            }
        }

        Ok(processes)
    }

    pub async fn get_current_activity(&self) -> Result<PhoneActivity> {
        let output = self
            .adb_shell("dumpsys window | grep mCurrentFocus")
            .await?;

        if let Some(activity) = output.split_whitespace().nth(2) {
            let parts: Vec<&str> = activity.split('/').collect();
            if parts.len() >= 2 {
                return Ok(PhoneActivity {
                    package: parts[0].to_string(),
                    activity: parts[1].to_string(),
                });
            }
        }

        Ok(PhoneActivity {
            package: "Unknown".to_string(),
            activity: "Unknown".to_string(),
        })
    }

    pub async fn set_screen_state(&self, on: bool) -> Result<()> {
        let keyevent = if on { "224" } else { "223" };
        self.adb_exec(&["shell", "input", "keyevent", keyevent])
            .await?;
        Ok(())
    }

    pub async fn set_brightness(&self, value: u32) -> Result<()> {
        self.adb_exec(&[
            "shell",
            "settings",
            "put",
            "system",
            "screen_brightness",
            &value.to_string(),
        ])
        .await?;
        Ok(())
    }

    pub async fn set_auto_brightness(&self, enabled: bool) -> Result<()> {
        let value = if enabled { "1" } else { "0" };
        self.adb_exec(&[
            "shell",
            "settings",
            "put",
            "system",
            "screen_brightness_mode",
            value,
        ])
        .await?;
        Ok(())
    }

    pub async fn volume_up(&self) -> Result<()> {
        self.adb_exec(&["shell", "input", "keyevent", "24"]).await?;
        Ok(())
    }

    pub async fn volume_down(&self) -> Result<()> {
        self.adb_exec(&["shell", "input", "keyevent", "25"]).await?;
        Ok(())
    }

    pub async fn reboot(&self) -> Result<()> {
        self.adb_exec(&["reboot"]).await?;
        Ok(())
    }

    pub async fn screenshot(&self) -> Result<Vec<u8>> {
        self.ensure_connected().await?;
        let serial = self.effective_serial();
        let output = tokio::task::spawn_blocking({
            let serial = serial.clone();
            move || {
                Command::new("adb")
                    .args(["-s", &serial, "exec-out", "screencap", "-p"])
                    .output()
            }
        })
        .await
        .context("ADB screenshot failed")??;

        if !output.status.success() {
            anyhow::bail!("Screenshot failed");
        }

        Ok(output.stdout)
    }

    pub async fn force_stop_app(&self, package: &str) -> Result<()> {
        self.adb_exec(&["shell", "am", "force-stop", package])
            .await?;
        Ok(())
    }

    pub async fn get_contacts(&self) -> Result<Vec<ContactInfo>> {
        let output = self.adb_shell(
            "content query --uri content://com.android.contacts/contacts --projection _id:display_name"
        ).await?;

        let mut contacts = Vec::new();
        for line in output.lines() {
            if !line.starts_with("Row:") {
                continue;
            }

            let id = line
                .split("_id=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            let display_name = line
                .split("display_name=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            if id > 0 {
                // Get phone numbers for this contact
                let phone_output = self.adb_shell(&format!(
                    "content query --uri content://com.android.contacts/data --projection data1 --where \"contact_id={}\" AND \"mimetype='vnd.android.cursor.item/phone_v2'\"",
                    id
                )).await.unwrap_or_default();

                let phone_numbers: Vec<String> = phone_output
                    .lines()
                    .filter(|l| l.starts_with("Row:"))
                    .filter_map(|l| l.split("data1=").nth(1))
                    .filter_map(|s| s.split(',').next())
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();

                contacts.push(ContactInfo {
                    id,
                    display_name,
                    phone_numbers,
                });
            }
        }
        Ok(contacts)
    }

    pub async fn get_call_log(&self) -> Result<Vec<CallLogEntry>> {
        let output = self.adb_shell(
            "content query --uri content://call_log/calls --projection _id:number:name:type:date:duration --sort \"date DESC\""
        ).await?;

        let mut entries = Vec::new();
        for line in output.lines() {
            if !line.starts_with("Row:") {
                continue;
            }

            let id = line
                .split("_id=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            let number = line
                .split("number=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .map(|s| s.trim().to_string())
                .unwrap_or_default();

            let name = line
                .split("name=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty() && s != "NULL");

            let type_str = line
                .split("type=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .map(|s| match s.trim() {
                    "1" => "Incoming",
                    "2" => "Outgoing",
                    "3" => "Missed",
                    _ => "Unknown",
                })
                .unwrap_or("Unknown")
                .to_string();

            let date = line
                .split("date=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            let duration = line
                .split("duration=")
                .nth(1)
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse().ok())
                .unwrap_or(0);

            entries.push(CallLogEntry {
                id,
                number,
                name,
                type_: type_str,
                date,
                duration,
            });
        }
        Ok(entries)
    }

    pub async fn get_sms_inbox(&self, limit: u32) -> Result<Vec<SmsMessage>> {
        let query = format!(
            "content query --uri content://sms/inbox --projection _id:address:body:date:read:type --sort \"date DESC\" --limit {}",
            limit
        );
        let output = self.adb_shell(&query).await?;
        Self::parse_sms_output(&output)
    }

    pub async fn get_sms_by_address(&self, address: &str) -> Result<Vec<SmsMessage>> {
        let query = format!(
            "content query --uri content://sms --projection _id:address:body:date:read:type --where \"address='{}'\" --sort \"date ASC\"",
            address.replace('\'', "''")
        );
        let output = self.adb_shell(&query).await?;
        Self::parse_sms_output(&output)
    }

    fn parse_sms_output(output: &str) -> Result<Vec<SmsMessage>> {
        let mut messages = Vec::new();

        for line in output.lines() {
            if !line.starts_with("Row:") {
                continue;
            }

            // Extract fields using more robust parsing
            // Format: Row: 0 _id=123, address=+1234567890, body=Hello world, date=1234567890, read=1, type=1
            let mut id = 0u64;
            let mut address = String::new();
            let mut body = String::new();
            let mut date = 0u64;
            let mut read = false;
            let mut type_ = String::new();

            // Find each field by its prefix
            if let Some(pos) = line.find("_id=") {
                let rest = &line[pos + 4..];
                if let Some(end) = rest.find([',', '\n']) {
                    id = rest[..end].trim().parse().unwrap_or(0);
                }
            }
            if let Some(pos) = line.find("address=") {
                let rest = &line[pos + 8..];
                if let Some(end) = rest.find(", body=") {
                    address = rest[..end].trim().to_string();
                }
            }
            if let Some(pos) = line.find("body=") {
                let rest = &line[pos + 5..];
                if let Some(end) = rest.find(", date=") {
                    body = rest[..end].trim().to_string();
                }
            }
            if let Some(pos) = line.find("date=") {
                let rest = &line[pos + 5..];
                if let Some(end) = rest.find([',', '\n']) {
                    date = rest[..end].trim().parse().unwrap_or(0);
                }
            }
            if let Some(pos) = line.find("read=") {
                let rest = &line[pos + 5..];
                if let Some(end) = rest.find([',', '\n']) {
                    read = rest[..end].trim() == "1";
                }
            }
            if let Some(pos) = line.find("type=") {
                let rest = &line[pos + 5..];
                if let Some(end) = rest.find([',', '\n']) {
                    type_ = rest[..end].trim().to_string();
                }
            }

            if !address.is_empty() || !body.is_empty() {
                messages.push(SmsMessage {
                    id,
                    address,
                    body,
                    date,
                    read,
                    type_,
                });
            }
        }

        Ok(messages)
    }

    fn normalize_phone_number(number: &str) -> String {
        let digits: String = number.chars().filter(|c| c.is_ascii_digit()).collect();
        // Handle US numbers: if 11 digits starting with 1, drop the 1
        if digits.len() == 11 && digits.starts_with('1') {
            digits[1..].to_string()
        } else if digits.len() >= 10 {
            // Take last 10 digits for comparison
            digits[digits.len() - 10..].to_string()
        } else {
            digits
        }
    }

    pub async fn get_sms_conversations(&self) -> Result<Vec<SmsConversation>> {
        // Load contacts first to build phone number -> name lookup
        let contacts = self.get_contacts().await.unwrap_or_default();
        let mut contact_lookup: std::collections::HashMap<String, String> =
            std::collections::HashMap::new();
        for contact in contacts {
            let normalized_name = contact.display_name.trim();
            if normalized_name.is_empty() {
                continue;
            }
            for phone in contact.phone_numbers {
                let normalized = Self::normalize_phone_number(&phone);
                if !normalized.is_empty() {
                    contact_lookup.insert(normalized, normalized_name.to_string());
                }
            }
        }

        let output = self.adb_shell(
            "content query --uri content://sms --projection _id:address:body:date:read:type --sort \"date DESC\""
        ).await?;

        let mut conversations: std::collections::HashMap<String, SmsConversation> =
            std::collections::HashMap::new();

        for line in output.lines() {
            if !line.starts_with("Row:") {
                continue;
            }
            let mut address = String::new();
            let mut body = String::new();
            let mut date = 0u64;
            let mut read = false;

            for part in line.split(", ") {
                let part = part.trim();
                if let Some(v) = part.strip_prefix("address=") {
                    address = v.to_string();
                } else if let Some(v) = part.strip_prefix("body=") {
                    body = v.to_string();
                } else if let Some(v) = part.strip_prefix("date=") {
                    date = v.parse().unwrap_or(0);
                } else if let Some(v) = part.strip_prefix("read=") {
                    read = v == "1";
                }
            }

            if address.is_empty() {
                continue;
            }

            // Look up contact name by normalized phone number
            let normalized_address = Self::normalize_phone_number(&address);
            let contact_name = contact_lookup.get(&normalized_address).cloned();

            let entry = conversations
                .entry(address.clone())
                .or_insert_with(|| SmsConversation {
                    address: address.clone(),
                    contact_name: contact_name.clone(),
                    last_message: String::new(),
                    last_timestamp: 0,
                    unread_count: 0,
                    message_count: 0,
                });

            // Update contact name if we found one and didn't have it before
            if entry.contact_name.is_none() {
                entry.contact_name = contact_name;
            }

            entry.message_count += 1;
            if !read {
                entry.unread_count += 1;
            }
            if date > entry.last_timestamp {
                entry.last_timestamp = date;
                entry.last_message = body;
            }
        }

        let mut convos: Vec<SmsConversation> = conversations.into_values().collect();
        convos.sort_by_key(|a| std::cmp::Reverse(a.last_timestamp));
        Ok(convos)
    }

    pub async fn send_sms(&self, address: &str, body: &str) -> Result<()> {
        // Opens the SMS app with the message pre-filled. Escape single quotes so the
        // adb shell command stays intact.
        let address = address.replace('\'', "'\\''");
        let body = body.replace('\'', "'\\''");
        self.adb_shell(&format!(
            "am start -a android.intent.action.SENDTO -d 'sms:{}' --es sms_body '{}' --ez exit_on_sent true",
            address, body
        ))
        .await?;
        Ok(())
    }
}

fn parse_size(s: &str) -> f64 {
    let s = s.trim().to_uppercase();
    if s.ends_with("G") || s.ends_with("GB") {
        s.trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .parse::<f64>()
            .unwrap_or(0.0)
    } else if s.ends_with("M") || s.ends_with("MB") {
        s.trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .parse::<f64>()
            .unwrap_or(0.0)
            / 1024.0
    } else if s.ends_with("K") || s.ends_with("KB") {
        s.trim_end_matches(|c: char| !c.is_ascii_digit() && c != '.')
            .parse::<f64>()
            .unwrap_or(0.0)
            / (1024.0 * 1024.0)
    } else {
        s.parse::<f64>().unwrap_or(0.0) / (1024.0 * 1024.0 * 1024.0)
    }
}
