use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxConfig {
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxSystemStats {
    pub hostname: String,
    pub kernel: String,
    pub os_release: String,
    pub arch: String,
    pub uptime: String,
    pub cpu_usage: f64,
    pub cpu_cores: u32,
    pub cpu_threads: u32,
    pub cpu_brand: String,
    pub cpu_speed: f64,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_free_mb: u64,
    pub memory_usage_pct: f64,
    pub swap_total_mb: u64,
    pub swap_used_mb: u64,
    pub load_avg: [f64; 3],
    pub timezone: String,
    /// Active platform profile (e.g. "performance", "balanced") from
    /// /sys/firmware/acpi/platform_profile. None when the platform doesn't
    /// expose one.
    pub platform_profile: Option<String>,
    /// Space-separated list of supported profiles (same sysfs file).
    pub platform_profile_choices: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinuxBattery {
    pub percentage: u32,
    pub charging: bool,
    pub time_remaining: Option<String>,
    pub capacity_wh: Option<f64>,
    pub energy_wh: Option<f64>,
    pub voltage_v: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThermalInfo {
    pub cpu_temp_c: Option<f64>,
    pub gpu_temp_c: Option<f64>,
    pub fan_speed_rpm: Option<u32>,
    pub fan_pwm: Option<u32>,
    /// Total SoC/GPU package power draw in watts (amdgpu PPT power1_average).
    pub power_w: Option<f64>,
    /// Secondary fan (e.g. ROG Ally gpu_fan) in RPM, when present.
    pub gpu_fan_speed_rpm: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsage {
    pub total_gb: f64,
    pub used_gb: f64,
    pub free_gb: f64,
    pub usage_pct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInfo {
    pub interfaces: Vec<NetworkInterface>,
    pub default_route: Option<String>,
    pub dns_servers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub ip: String,
    pub mac: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
    pub speed: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: String,
    pub model: String,
    pub driver_version: String,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub temperature_c: Option<f64>,
    pub utilization_pct: Option<f64>,
    /// Current GPU/SoC core clock from pp_dpm_sclk (MHz), when exposed.
    pub clock_mhz: Option<u64>,
}

pub struct LinuxClient {
    config: LinuxConfig,
}

impl LinuxClient {
    pub fn new(config: LinuxConfig) -> Result<Self> {
        Ok(Self { config })
    }

    async fn exec_ssh(&self, cmd: &str) -> Result<String> {
        let mut args = vec![
            "-o".to_string(),
            "StrictHostKeyChecking=no".to_string(),
            "-o".to_string(),
            "UserKnownHostsFile=/dev/null".to_string(),
            "-o".to_string(),
            "ServerAliveInterval=15".to_string(),
            "-o".to_string(),
            "ServerAliveCountMax=4".to_string(),
            "-o".to_string(),
            "TCPKeepAlive=yes".to_string(),
            "-o".to_string(),
            "ConnectTimeout=15".to_string(),
        ];

        if let Some(port) = if self.config.port != 22 {
            Some(self.config.port)
        } else {
            None
        } {
            args.push("-p".to_string());
            args.push(port.to_string());
        }

        args.push(format!("{}@{}", self.config.username, self.config.hostname));
        args.push(cmd.to_string());

        let output = tokio::task::spawn_blocking({
            let args = args.clone();
            let password = self.config.password.clone();
            move || {
                let mut cmd = Command::new("sshpass");
                cmd.arg("-p").arg(&password).arg("ssh").args(&args);
                cmd.output()
            }
        })
        .await
        .context("SSH command failed")??;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            anyhow::bail!("SSH failed: {}", stderr);
        }

        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    async fn exec_ssh_sudo(&self, cmd: &str) -> Result<String> {
        let sudo_password = self
            .config
            .sudo_password
            .clone()
            .unwrap_or(self.config.password.clone());
        let full_cmd = format!("echo '{}' | sudo -S {}", sudo_password, cmd);
        self.exec_ssh(&full_cmd).await
    }

    pub async fn get_system_stats(&self) -> Result<LinuxSystemStats> {
        // One bundled SSH round trip instead of ~11. Each probe used to spawn a
        // separate sshpass+ssh session (accumulating seconds of tailnet latency)
        // and a single failing probe used to zero the whole result.
        let out = self
            .exec_ssh(
                "echo \"hostname=$(hostname)\"; \
                 echo \"kernel=$(uname -r)\"; \
                 echo \"os=$(grep PRETTY_NAME /etc/os-release | cut -d'\"' -f2 2>/dev/null)\"; \
                 echo \"arch=$(uname -m)\"; \
                 echo \"uptime=$(uptime -p)\"; \
                 echo \"cores=$(grep -c ^processor /proc/cpuinfo)\"; \
                 echo \"brand=$(grep 'model name' /proc/cpuinfo | head -1 | cut -d: -f2- | sed 's/^[[:space:]]*//' 2>/dev/null)\"; \
                 echo \"mhz=$(grep 'cpu MHz' /proc/cpuinfo | head -1 | awk '{print $4}' 2>/dev/null)\"; \
                 echo \"load=$(cat /proc/loadavg)\"; \
                 echo \"tz=$(cat /etc/timezone 2>/dev/null || timedatectl | grep 'Time zone' | awk '{print $3}')\"; \
                 echo \"cpu1=$(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat)\"; \
                 sleep 0.5; \
                 echo \"cpu2=$(awk '/^cpu /{print $2,$3,$4,$5,$6,$7,$8,$9,$10,$11}' /proc/stat)\"; \
                 echo \"memtotal=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)\"; \
                 echo \"memfree=$(awk '/^MemFree:/{print $2}' /proc/meminfo)\"; \
                 echo \"memavail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)\"; \
                 echo \"swaptotal=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)\"; \
                 echo \"swapfree=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)\"; \
                 echo \"profile=$(cat /sys/firmware/acpi/platform_profile 2>/dev/null)\"; \
                 echo \"profiles=$(cat /sys/firmware/acpi/platform_profile_choices 2>/dev/null)\"",
            )
            .await?;

        let get = |key: &str| -> String {
            out.lines()
                .find(|l| l.starts_with(&format!("{}=", key)))
                .map(|l| l[key.len() + 1..].to_string())
                .unwrap_or_default()
        };
        let get_opt = |key: &str| -> Option<String> {
            let v = get(key);
            if v.is_empty() {
                None
            } else {
                Some(v)
            }
        };

        // Two /proc/stat samples ~0.5s apart -> real live usage, not the
        // lifetime average a single absolute read would produce.
        let cpu_usage_pct = parse_cpu_delta(&get("cpu1"), &get("cpu2"));

        let mem_total_kb = parse_kb(&get("memtotal"));
        let mem_free_kb = parse_kb(&get("memfree"));
        let mem_available_kb = parse_kb(&get("memavail"));
        let swap_total_kb = parse_kb(&get("swaptotal"));
        let swap_free_kb = parse_kb(&get("swapfree"));

        let mem_used_kb = mem_total_kb.saturating_sub(mem_available_kb);
        let swap_used_kb = swap_total_kb.saturating_sub(swap_free_kb);

        let cpu_speed = get("mhz").parse::<f64>().unwrap_or(0.0) / 1000.0;
        let cpu_cores = get("cores").parse::<u32>().unwrap_or(0);

        Ok(LinuxSystemStats {
            hostname: get("hostname"),
            kernel: get("kernel"),
            os_release: get("os"),
            arch: get("arch"),
            uptime: get("uptime"),
            cpu_usage: cpu_usage_pct,
            cpu_cores,
            cpu_threads: cpu_cores,
            cpu_brand: {
                let b = get("brand");
                if b.is_empty() {
                    "Unknown".to_string()
                } else {
                    b
                }
            },
            cpu_speed,
            memory_total_mb: mem_total_kb / 1024,
            memory_used_mb: mem_used_kb / 1024,
            memory_free_mb: mem_free_kb / 1024,
            memory_usage_pct: if mem_total_kb > 0 {
                (mem_used_kb as f64 / mem_total_kb as f64) * 100.0
            } else {
                0.0
            },
            swap_total_mb: swap_total_kb / 1024,
            swap_used_mb: swap_used_kb / 1024,
            load_avg: parse_loadavg(&get("load")),
            timezone: get("tz"),
            platform_profile: get_opt("profile"),
            platform_profile_choices: get_opt("profiles"),
        })
    }

    pub async fn get_battery(&self) -> Result<LinuxBattery> {
        let upower_output = self
            .exec_ssh("upower -i $(upower -e | grep BAT) 2>/dev/null")
            .await?;

        let parse_upower = |key: &str| -> Option<String> {
            upower_output
                .lines()
                .find(|l| l.trim().starts_with(key))
                .and_then(|l| l.split(':').nth(1))
                .map(|s| s.trim().to_string())
        };

        let percentage = parse_upower("percentage")
            .and_then(|s| s.trim_end_matches('%').parse().ok())
            .unwrap_or(0);

        let state = parse_upower("state").unwrap_or_default();
        let charging = state == "charging" || state == "fully-charged";

        let time_remaining = parse_upower("time to empty").or_else(|| parse_upower("time to full"));

        let capacity_wh = parse_upower("capacity")
            .and_then(|s| s.split_whitespace().next().map(|x| x.to_string()))
            .and_then(|s| s.parse().ok());

        let energy_wh = parse_upower("energy")
            .and_then(|s| s.split_whitespace().next().map(|x| x.to_string()))
            .and_then(|s| s.parse().ok());

        let voltage_v = parse_upower("voltage")
            .and_then(|s| s.split_whitespace().next().map(|x| x.to_string()))
            .and_then(|s| s.parse().ok());

        Ok(LinuxBattery {
            percentage,
            charging,
            time_remaining,
            capacity_wh,
            energy_wh,
            voltage_v,
        })
    }

    pub async fn get_thermal(&self) -> Result<ThermalInfo> {
        // Try sensor output first (JSON via `sensors -j`, then textual `sensors`).
        let sensors_output = self
            .exec_ssh("sensors -j 2>/dev/null || sensors 2>/dev/null")
            .await?;

        let mut cpu_temp = None;
        let mut gpu_temp = None;
        let mut fan_speed = None;
        let mut fan_pwm = None;
        let mut power_w = None;
        let mut gpu_fan = None;

        if sensors_output.starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&sensors_output) {
                if let Some(root) = json.as_object() {
                    let mut cpu_readings: Vec<f64> = Vec::new();
                    let mut gpu_readings: Vec<f64> = Vec::new();
                    let mut fan_readings: Vec<f64> = Vec::new();
                    let mut gpu_fan_readings: Vec<f64> = Vec::new();
                    let mut pwm_readings: Vec<f64> = Vec::new();
                    let mut power_readings: Vec<f64> = Vec::new();

                    for (chip, data) in root {
                        let chip_l = chip.to_lowercase();
                        let is_cpu_chip = chip_l.contains("k10temp")
                            || chip_l.contains("zenpower")
                            || chip_l.contains("coretemp")
                            || chip_l.contains("cpu")
                            || chip_l.contains("core")
                            || chip_l.contains("amdfam")
                            || chip_l.contains("amd_")
                            || chip_l.contains("zen")
                            || chip_l.contains("acpitz");
                        let is_gpu_chip = chip_l.contains("amdgpu")
                            || chip_l.contains("nvidia")
                            || chip_l.contains("gpu");
                        if chip_l.contains("curve") || chip_l.contains("custom") {
                            continue;
                        }

                        let mut leaves: Vec<(String, f64)> = Vec::new();
                        collect_leaves(data, "", &mut leaves);
                        for (feature, v) in leaves {
                            let feat_l = feature.to_lowercase();
                            if feat_l.contains("temp") {
                                if is_gpu_chip {
                                    gpu_readings.push(v);
                                } else if is_cpu_chip {
                                    cpu_readings.push(v);
                                }
                            }
                            if feat_l.contains("fan") && v > 0.0 {
                                fan_readings.push(v);
                                if feat_l.contains("gpu") {
                                    gpu_fan_readings.push(v);
                                }
                            }
                            if feat_l.contains("pwm") && v > 0.0 && v <= 255.0 {
                                pwm_readings.push(v);
                            }
                            // lm-sensors reports amdgpu PPT power1_average in watts.
                            if feat_l.contains("power1_average") && v > 0.0 && v < 200.0 {
                                power_readings.push(v);
                            }
                        }
                    }

                    cpu_temp = cpu_readings.first().copied();
                    gpu_temp = gpu_readings.first().copied();
                    fan_speed = fan_readings.first().map(|v| *v as u32);
                    gpu_fan = gpu_fan_readings.first().map(|v| *v as u32);
                    power_w = power_readings.first().copied();
                    if let Some(&first) = pwm_readings.first() {
                        let scaled = if pwm_readings.iter().any(|v| *v > 100.0) {
                            (first / 255.0) * 100.0
                        } else {
                            first
                        };
                        fan_pwm = Some((scaled as u32).min(100));
                    }
                }
            }
        } else if !sensors_output.trim().is_empty() {
            let mut current_chip = String::new();
            // Textual output nests fans under label sub-headers ("gpu_fan:"), so
            // remember the last label to attribute the following fan to the GPU.
            let mut pending_gpu_fan = false;
            for line in sensors_output.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if !trimmed.contains(':') && !trimmed.starts_with("Adapter:") {
                    current_chip = trimmed.to_lowercase();
                    continue;
                }
                let chip = current_chip.clone();
                let lower = trimmed.to_lowercase();
                let feature = lower.split(':').next().unwrap_or("");
                let is_cpu_chip = chip.contains("k10temp")
                    || chip.contains("zenpower")
                    || chip.contains("coretemp")
                    || chip.contains("cpu")
                    || chip.contains("core")
                    || chip.contains("amdfam")
                    || chip.contains("acpitz");
                let is_gpu_chip =
                    chip.contains("amdgpu") || chip.contains("nvidia") || chip.contains("gpu");

                let value = trimmed
                    .split(':')
                    .nth(1)
                    .unwrap_or("")
                    .split('°')
                    .next()
                    .unwrap_or("")
                    .split_whitespace()
                    .next()
                    .and_then(|s| s.parse::<f64>().ok());

                let temp_keyword = ["temp", "edge", "junction", "tctl", "tccd", "tdie"]
                    .iter()
                    .any(|k| feature.contains(k));
                let ambiguous = [
                    "fan", "pwm", "pow", "ppt", "volt", "vdd", "curr", "energ", "aps", "freq",
                    "clk", "mem",
                ]
                .iter()
                .any(|k| feature.contains(k));

                if is_gpu_chip {
                    if gpu_temp.is_none() && (temp_keyword || !ambiguous) {
                        if let Some(temp) = value.filter(|t| *t <= 110.0) {
                            gpu_temp = Some(temp);
                        }
                    }
                } else if is_cpu_chip && cpu_temp.is_none() && (temp_keyword || !ambiguous) {
                    if let Some(temp) = value.filter(|t| *t <= 110.0) {
                        cpu_temp = Some(temp);
                    }
                }

                // "gpu_fan:" style label header carries no value -> remember it.
                if value.is_none() && feature.contains("gpu") {
                    pending_gpu_fan = true;
                }

                if feature.contains("fan") && lower.contains("rpm") {
                    if let Some(speed) = value {
                        if speed > 0.0 {
                            if pending_gpu_fan {
                                if gpu_fan.is_none() {
                                    gpu_fan = Some(speed as u32);
                                }
                                pending_gpu_fan = false;
                            } else if fan_speed.is_none() {
                                fan_speed = Some(speed as u32);
                            }
                        }
                    }
                }

                // Power draw: amdgpu text output is "PPT:" -> "power1_average: 19.06".
                if feature.contains("power1_average") && power_w.is_none() {
                    if let Some(w) = value.filter(|w| *w > 0.0 && *w < 200.0) {
                        power_w = Some(w);
                    }
                }
            }
        }

        // Fallback: read the Linux thermal & hwmon sysfs directly (works even
        // without `lm_sensors` being configured).
        if cpu_temp.is_none()
            || gpu_temp.is_none()
            || fan_speed.is_none()
            || fan_pwm.is_none()
            || power_w.is_none()
            || gpu_fan.is_none()
        {
            if let Ok(sysfs) = self.exec_ssh(
                "for z in /sys/class/thermal/thermal_zone*; do \
                    t=$(cat $z/temp 2>/dev/null); \
                    ty=$(cat $z/type 2>/dev/null); \
                    [ -n \"$t\" ] && echo \"ZONE:$ty:$t\"; \
                 done; \
                 for h in /sys/class/hwmon/hwmon*/; do \
                    n=$(cat $h/name 2>/dev/null); \
                    for t in $h/temp*_input; do [ -f \"$t\" ] && echo \"HW:$n:$(basename $t):$(cat $t)\"; done; \
                    for f in $h/fan*_input; do [ -f \"$f\" ] && echo \"FAN:$n:$(basename $f):$(cat $f)\"; done; \
                    for l in $h/fan*_label; do [ -f \"$l\" ] && echo \"FLABEL:$n:$(basename $l):$(cat $l)\"; done; \
                    for p in $h/power*_average; do [ -f \"$p\" ] && echo \"PWR:$n:$(basename $p):$(cat $p)\"; done; \
                    for p in $h/pwm*; do [ -f \"$p\" ] && echo \"PWM:$n:$(cat $p)\"; done; \
                 done; true"
            ).await {
                let mut pwm_raw: Vec<f64> = Vec::new();
                let mut fan_values: Vec<(String, String, u32)> = Vec::new();
                let mut fan_labels: Vec<(String, String, String)> = Vec::new();
                let mut power_vals: Vec<(String, f64)> = Vec::new();
                for line in sysfs.lines() {
                    if let Some(rest) = line.strip_prefix("ZONE:") {
                        let mut parts = rest.splitn(2, ':');
                        let ty = parts.next().unwrap_or("").to_lowercase();
                        let temp_c = parts.next().and_then(|s| s.trim().parse::<f64>().ok()).map(|m| m / 1000.0);
                        if let Some(t) = temp_c {
                            if t > 0.0 && t <= 110.0 {
                                let is_gpu = ty.contains("gpu");
                                let is_cpu = ty.contains("x86_pkg") || ty.contains("cpu") || ty.contains("acpi");
                                if is_gpu {
                                    if gpu_temp.is_none() { gpu_temp = Some(t); }
                                } else if is_cpu && cpu_temp.is_none() {
                                    cpu_temp = Some(t);
                                }
                            }
                        }
                    } else if let Some(rest) = line.strip_prefix("HW:") {
                        let mut parts = rest.splitn(3, ':');
                        let name = parts.next().unwrap_or("").to_lowercase();
                        let _feature = parts.next().unwrap_or("").to_lowercase();
                        let temp_c = parts.next().and_then(|s| s.trim().parse::<f64>().ok()).map(|m| m / 1000.0);
                        if let Some(t) = temp_c {
                            if t > 0.0 && t <= 110.0 {
                                if name.contains("amdgpu") {
                                    if gpu_temp.is_none() { gpu_temp = Some(t); }
                                } else if cpu_temp.is_none()
                                    && (name.contains("k10temp")
                                        || name.contains("zenpower")
                                        || name.contains("coretemp")
                                        || name.contains("cpu")
                                        || name.contains("core")
                                        || name.contains("amdfam")
                                        || name.contains("acpitz"))
                                {
                                    cpu_temp = Some(t);
                                }
                            }
                        }
                    } else if let Some(rest) = line.strip_prefix("FAN:") {
                        let mut parts = rest.splitn(3, ':');
                        let name = parts.next().unwrap_or("").to_lowercase();
                        let fanx = parts.next().unwrap_or("").to_string();
                        let rpm = parts.next().and_then(|s| s.trim().parse::<u32>().ok()).unwrap_or(0);
                        if rpm > 0 {
                            fan_values.push((name, fanx, rpm));
                        }
                    } else if let Some(rest) = line.strip_prefix("FLABEL:") {
                        let mut parts = rest.splitn(3, ':');
                        let name = parts.next().unwrap_or("").to_lowercase();
                        let fanx = parts.next().unwrap_or("").to_string();
                        let label = parts.next().unwrap_or("").to_string();
                        fan_labels.push((name, fanx, label));
                    } else if let Some(rest) = line.strip_prefix("PWR:") {
                        let mut parts = rest.splitn(3, ':');
                        let name = parts.next().unwrap_or("").to_lowercase();
                        let _feature = parts.next().unwrap_or("").to_lowercase();
                        if let Ok(v) = parts.next().unwrap_or("").trim().parse::<f64>() {
                            power_vals.push((name, v));
                        }
                    } else if let Some(rest) = line.strip_prefix("PWM:") {
                        if let Some((name, val)) = rest.split_once(':') {
                            let name_l = name.trim().to_lowercase();
                            if !name_l.contains("curve") && !name_l.contains("custom") {
                                if let Ok(pwm) = val.trim().parse::<f64>() {
                                    if pwm > 0.0 && pwm <= 255.0 {
                                        pwm_raw.push(pwm);
                                    }
                                }
                            }
                        }
                    }
                }
                if fan_pwm.is_none() {
                    if let Some(&first) = pwm_raw.first() {
                        let scaled = if pwm_raw.iter().any(|v| *v > 100.0) {
                            (first / 255.0) * 100.0
                        } else {
                            first
                        };
                        fan_pwm = Some((scaled as u32).min(100));
                    }
                }
                // Attribute fans by label ("gpu_fan" -> GPU fan); fall back to
                // "second fan is the GPU fan" when labels are absent.
                for (name, fanx, label) in &fan_labels {
                    if label.to_lowercase().contains("gpu") {
                        if let Some((_, _, rpm)) =
                            fan_values.iter().find(|(n, f, _)| n == name && f == fanx)
                        {
                            if gpu_fan.is_none() && *rpm > 0 {
                                gpu_fan = Some(*rpm);
                            }
                        }
                    }
                }
                if fan_speed.is_none() {
                    if let Some((_, _, rpm)) = fan_values.first() {
                        if *rpm > 0 {
                            fan_speed = Some(*rpm);
                        }
                    }
                }
                if gpu_fan.is_none() && fan_values.len() >= 2 {
                    gpu_fan = fan_values.get(1).map(|(_, _, rpm)| *rpm);
                }
                // amdgpu hwmon power1_average is in microwatts.
                if power_w.is_none() {
                    for (name, v) in &power_vals {
                        if name.contains("amdgpu") && *v > 0.0 && *v < 200_000_000.0 {
                            power_w = Some(v / 1_000_000.0);
                            break;
                        }
                    }
                }
            }
        }

        Ok(ThermalInfo {
            cpu_temp_c: cpu_temp,
            gpu_temp_c: gpu_temp,
            fan_speed_rpm: fan_speed,
            fan_pwm,
            power_w,
            gpu_fan_speed_rpm: gpu_fan,
        })
    }

    pub async fn get_disk_usage(&self) -> Result<DiskUsage> {
        // One bundled SSH call (used to be four). On atomic (ostree/composefs)
        // roots `/` is virtual, so: resolve the real backing store of `/`, then
        // try data-bearing mounts, then sum real filesystems, then `df -h /`.
        let out = self
            .exec_ssh(
                "root_src=$(findmnt -rno SOURCE -T / 2>/dev/null | head -1); \
                 case \"$root_src\" in \
                 overlay*|composefs*|tmpfs*|\"\") cand=\"\";; \
                 *) cand=\"$root_src\";; \
                 esac; \
                 if [ -z \"$cand\" ]; then \
                   for p in /var /home /etc /root; do \
                     c=$(findmnt -rno SOURCE -T \"$p\" 2>/dev/null | head -1); \
                     case \"$c\" in \
                     \"\"|overlay*|composefs*|tmpfs*) ;; \
                     *) cand=\"$c\"; break;; \
                     esac; \
                   done; \
                 fi; \
                 if [ -n \"$cand\" ]; then \
                   cand=$(printf '%s' \"$cand\" | cut -d'[' -f1); \
                   echo \"CAND=$cand\"; \
                   echo \"==DFB==\"; \
                   df -B1 \"$cand\" 2>/dev/null; \
                 fi; \
                 echo \"==MOUNTS==\"; \
                 findmnt -rn -o SOURCE,SIZE,USED,AVAIL,USE% -t ext4,xfs,btrfs,f2fs,vfat,ntfs 2>/dev/null || true; \
                 echo \"==DFH==\"; \
                 df -h / 2>/dev/null; true",
            )
            .await?;

        let (dfb, mounts, dfh, cand) = split_sections(&out);

        // 1) Prefer the real backing device of `/` (or a data-bearing mount).
        if cand.is_some() {
            if let Some(usage) = parse_df_bytes(&dfb) {
                return Ok(usage);
            }
        }

        // 2) Sum all real (non-overlay, non-zram, non-tmpfs) local filesystems,
        //    deduping btrfs subvolume rows by backing device.
        let mut by_device: HashMap<String, (f64, f64, f64)> = HashMap::new();
        for line in mounts.lines() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 5 {
                continue;
            }
            let src = parts[0];
            if src.starts_with("overlay") || src.contains("zram") || src.contains("tmpfs") {
                continue;
            }
            let device = src.split('[').next().unwrap_or(src).to_string();
            let row = by_device.entry(device).or_insert((0.0, 0.0, 0.0));
            if let Some(bytes) = parse_size_bytes(parts[1]) {
                row.0 = row.0.max(bytes);
            }
            if let Some(b) = parse_size_bytes(parts[2]) {
                row.1 = row.1.max(b);
            }
            if let Some(b) = parse_size_bytes(parts[3]) {
                row.2 = row.2.max(b);
            }
        }
        let mut total = 0.0f64;
        let mut used = 0.0f64;
        let mut free = 0.0f64;
        for (t, u, f) in by_device.values() {
            total += *t;
            used += *u;
            free += *f;
        }
        if total > 0.0 {
            return Ok(DiskUsage {
                total_gb: total / (1024.0 * 1024.0 * 1024.0),
                used_gb: used / (1024.0 * 1024.0 * 1024.0),
                free_gb: free / (1024.0 * 1024.0 * 1024.0),
                usage_pct: (used / total) * 100.0,
            });
        }

        // 3) Last resort: plain `df -h /` with the legacy parser.
        let lines: Vec<&str> = dfh.lines().collect();
        if lines.len() >= 2 {
            let parts: Vec<&str> = lines[1].split_whitespace().collect();
            if parts.len() >= 5 {
                let total = parse_size(parts[1]);
                let used = parse_size(parts[2]);
                let free = parse_size(parts[3]);
                let usage_pct = parts[4].trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
                return Ok(DiskUsage {
                    total_gb: total,
                    used_gb: used,
                    free_gb: free,
                    usage_pct,
                });
            }
        }

        Ok(DiskUsage {
            total_gb: 0.0,
            used_gb: 0.0,
            free_gb: 0.0,
            usage_pct: 0.0,
        })
    }

    pub async fn get_network(&self) -> Result<NetworkInfo> {
        // Bundled: addresses, default route, DNS, and live byte counters in one trip.
        let out = self
            .exec_ssh(
                "ip -j addr show 2>/dev/null || ip addr show; \
                 echo \"==ROUTE==\"; \
                 ip route | grep default | head -1 | awk '{print $3}'; \
                 echo \"==DNS==\"; \
                 cat /etc/resolv.conf | grep nameserver | awk '{print $2}'; \
                 echo \"==NETDEV==\"; \
                 cat /proc/net/dev; true",
            )
            .await?;

        let (ip_section, route_section, dns_section, netdev) = split_net_sections(&out);
        let mut interfaces = Vec::new();

        if ip_section.trim_start().starts_with('[') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&ip_section) {
                if let Some(arr) = json.as_array() {
                    for iface in arr {
                        let name = iface
                            .get("ifname")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let mac = iface
                            .get("address")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();

                        let mut ip = String::new();
                        if let Some(addr_info) = iface.get("addr_info").and_then(|v| v.as_array()) {
                            for addr in addr_info {
                                if addr.get("family").and_then(|v| v.as_str()) == Some("inet") {
                                    ip = addr
                                        .get("local")
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                        .to_string();
                                    break;
                                }
                            }
                        }

                        if !name.is_empty() && name != "lo" {
                            interfaces.push(NetworkInterface {
                                name,
                                ip,
                                mac,
                                rx_bytes: 0,
                                tx_bytes: 0,
                                speed: None,
                            });
                        }
                    }
                }
            }
        }

        // Live byte counters from /proc/net/dev (skip the two header lines).
        for line in netdev.lines().skip(2) {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 10 {
                continue;
            }
            let name = parts[0].trim_end_matches(':');
            if let (Ok(rx), Ok(tx)) = (parts[1].parse::<u64>(), parts[9].parse::<u64>()) {
                if let Some(iface) = interfaces.iter_mut().find(|i| i.name == name) {
                    iface.rx_bytes = rx;
                    iface.tx_bytes = tx;
                }
            }
        }

        let default_route = if route_section.trim().is_empty() {
            None
        } else {
            Some(route_section.trim().to_string())
        };
        let dns_servers = dns_section
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        Ok(NetworkInfo {
            interfaces,
            default_route,
            dns_servers,
        })
    }

    pub async fn get_gpu_info(&self) -> Result<GpuInfo> {
        // 1) NVIDIA first
        let nvidia_output = self.exec_ssh("nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>/dev/null").await;

        if let Ok(output) = nvidia_output {
            if !output.trim().is_empty() {
                let parts: Vec<&str> = output.split(',').map(|s| s.trim()).collect();
                if parts.len() >= 6 {
                    return Ok(GpuInfo {
                        vendor: "NVIDIA".to_string(),
                        model: parts[0].to_string(),
                        driver_version: parts[1].to_string(),
                        memory_total_mb: parts[2].parse().unwrap_or(0),
                        memory_used_mb: parts[3].parse().unwrap_or(0),
                        temperature_c: parts[4].parse().ok(),
                        utilization_pct: parts[5].parse().ok(),
                        clock_mhz: None,
                    });
                }
            }
        }

        // 2) AMD via rocm-smi (JSON is the most reliable)
        let amd_json = self.exec_ssh("rocm-smi --json 2>/dev/null").await;
        if let Ok(output) = amd_json {
            if !output.trim().is_empty() && output.trim_start().starts_with('{') {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&output) {
                    if let Some((_, card)) = json.as_object().and_then(|o| o.iter().next()) {
                        let get = |key: &str| -> Option<String> {
                            card.get(key)
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                        };

                        // model: card.get("Card series") or "Card SKU"
                        let model = get("Card series")
                            .or_else(|| get("Card SKU"))
                            .filter(|s| !s.is_empty())
                            .unwrap_or_else(|| "AMD GPU".to_string());
                        let driver = clean_driver(&get("Driver version").unwrap_or_default());

                        // VRAM: "VRAM Total Memory (B)", "VRAM Total Used Memory (B)"
                        let vram_total_mb = get("VRAM Total Memory (B)")
                            .and_then(|s| s.parse::<u64>().ok())
                            .map(|b| b / (1024 * 1024))
                            .unwrap_or(0);
                        let vram_used_mb = get("VRAM Total Used Memory (B)")
                            .and_then(|s| s.parse::<u64>().ok())
                            .map(|b| b / (1024 * 1024))
                            .unwrap_or(0);

                        // Temp: "Temperature (Sensor edge) (C)"
                        let temp = get("Temperature (Sensor edge) (C)")
                            .or_else(|| get("Temperature (Sensor junction) (C)"))
                            .and_then(|s| s.parse::<f64>().ok());

                        // Utilization: "GPU use (%)" or "GPU OverDrive"
                        let util = get("GPU use (%)")
                            .or_else(|| get("GPU Utilization (%)"))
                            .and_then(|s| s.trim().trim_end_matches('%').parse::<f64>().ok());

                        let mut info = GpuInfo {
                            vendor: "AMD".to_string(),
                            model,
                            driver_version: driver,
                            memory_total_mb: vram_total_mb,
                            memory_used_mb: vram_used_mb,
                            temperature_c: temp,
                            utilization_pct: util,
                            clock_mhz: None,
                        };
                        // rocm-smi sometimes returns 0 VRAM when it can't resolve; fill from sysfs below.
                        self.fill_from_amdgpu_sysfs(&mut info).await;
                        return Ok(info);
                    }
                }
            }
        }

        // 3) AMD via sysfs (works even without rocm-smi installed)
        let mut info = GpuInfo {
            vendor: "AMD".to_string(),
            model: "AMD GPU".to_string(),
            driver_version: "".to_string(),
            memory_total_mb: 0,
            memory_used_mb: 0,
            temperature_c: None,
            utilization_pct: None,
            clock_mhz: None,
        };
        self.fill_from_amdgpu_sysfs(&mut info).await;

        if info.memory_total_mb > 0 || info.temperature_c.is_some() || info.memory_used_mb > 0 {
            return Ok(info);
        }

        // 4) Last resort: report whatever the PCI display device is.
        let lspci = self
            .exec_ssh("lspci 2>/dev/null | grep -iE 'vga compatible controller|3d controller|display controller' | head -1")
            .await;
        if let Ok(out) = lspci {
            let model = out
                .lines()
                .next()
                .map(|l| {
                    l.rsplit_once(':')
                        .map(|(_, s)| s.trim().to_string())
                        .unwrap_or_else(|| l.to_string())
                })
                .unwrap_or_else(|| "AMD GPU".to_string());
            return Ok(GpuInfo {
                vendor: "AMD".to_string(),
                model,
                driver_version: "amdgpu".to_string(),
                memory_total_mb: info.memory_total_mb,
                memory_used_mb: info.memory_used_mb,
                temperature_c: info.temperature_c,
                utilization_pct: info.utilization_pct,
                clock_mhz: info.clock_mhz,
            });
        }

        Ok(GpuInfo {
            vendor: "Unknown".to_string(),
            model: "Unknown".to_string(),
            driver_version: "".to_string(),
            memory_total_mb: 0,
            memory_used_mb: 0,
            temperature_c: None,
            utilization_pct: None,
            clock_mhz: None,
        })
    }

    // Fill in AMD Radeon details directly from the amdgpu kernel driver sysfs,
    // which is always present on Bazzite (no extra packages required).
    async fn fill_from_amdgpu_sysfs(&self, info: &mut GpuInfo) {
        // Detect the DRM card for the amdgpu device.
        let card = self.exec_ssh(
            "for d in /sys/class/drm/card*/device/driver; do \
                drv=$(readlink -f $d 2>/dev/null); \
                case \"$drv\" in *amdgpu*) echo ${d%/device/driver} | xargs basename; break;; esac; \
             done"
        ).await.ok().map(|s| s.trim().to_string()).filter(|s| s.starts_with("card"));

        if let Some(card) = card {
            let base = format!("/sys/class/drm/{}/device", card);

            let vram_total = self
                .exec_ssh(&format!("cat {}/mem_info_vram_total 2>/dev/null", base))
                .await
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok());
            let vram_used = self
                .exec_ssh(&format!("cat {}/mem_info_vram_used 2>/dev/null", base))
                .await
                .ok()
                .and_then(|s| s.trim().parse::<u64>().ok());
            let busy = self
                .exec_ssh(&format!("cat {}/gpu_busy_percent 2>/dev/null", base))
                .await
                .ok()
                .and_then(|s| s.trim().parse::<f64>().ok());

            if let Some(total) = vram_total {
                if info.memory_total_mb == 0 {
                    info.memory_total_mb = total / (1024 * 1024);
                }
            }
            if let Some(used) = vram_used {
                if info.memory_used_mb == 0 {
                    info.memory_used_mb = used / (1024 * 1024);
                }
            }
            if let Some(b) = busy {
                if info.utilization_pct.is_none() {
                    info.utilization_pct = Some(b);
                }
            }

            // Current GPU/SoC clock from pp_dpm_sclk (the '*' marks the active
            // power state; some drivers omit it and we take the last state).
            if info.clock_mhz.is_none() {
                let sclk = self
                    .exec_ssh(&format!("cat {}/pp_dpm_sclk 2>/dev/null", base))
                    .await
                    .ok();
                if let Some(sclk) = sclk {
                    if let Some(mhz) = parse_pp_dpm_sclk(&sclk) {
                        info.clock_mhz = Some(mhz);
                    }
                }
            }
        }

        // GPU temp from amdgpu hwmon.
        if info.temperature_c.is_none() {
            let temp = self
                .exec_ssh(
                    "for h in /sys/class/hwmon/hwmon*/name; do \
                    n=$(cat $h 2>/dev/null); \
                    [ \"$n\" = \"amdgpu\" ] || continue; \
                    d=$(dirname $h); \
                    for t in $d/temp*_input; do \
                        [ -f \"$t\" ] && echo \"$(cat $t)\"; break; \
                    done; \
                    break; \
                 done",
                )
                .await
                .ok()
                .and_then(|s| s.trim().parse::<f64>().ok())
                .map(|m| m / 1000.0);
            if let Some(t) = temp {
                if t > 0.0 && t <= 110.0 {
                    info.temperature_c = Some(t);
                }
            }
        }

        // Driver/model name.
        if info.driver_version.is_empty() {
            let drv = self
                .exec_ssh("cat /sys/class/drm/card*/device/driver_override 2>/dev/null | head -1")
                .await
                .ok();
            info.driver_version = clean_driver(&drv.unwrap_or_default());
        }
        if info.model == "AMD GPU" {
            let m = self.exec_ssh(
                "lspci 2>/dev/null | grep -iE 'vga compatible controller|3d controller|display controller' | head -1"
            ).await.ok();
            if let Some(line) = m {
                let clean = line
                    .trim()
                    .rsplit_once(':')
                    .map(|(_, s)| s.trim().to_string())
                    .unwrap_or_default();
                if !clean.is_empty() {
                    info.model = clean;
                }
            }
        }
        if info.model == "AMD GPU" {
            let prod = self
                .exec_ssh("cat /sys/class/drm/card*/device/product 2>/dev/null | head -1")
                .await
                .ok();
            if let Some(p) = prod {
                let p = p.trim();
                if !p.is_empty() {
                    info.model = p.to_string();
                }
            }
        }
        if info.model == "AMD GPU" {
            info.model = "AMD Radeon Graphics".to_string();
        }
    }

    pub async fn launch_rustdesk(&self, rustdesk_id: &str, password: &str) -> Result<()> {
        let cmd = format!(
            "rustdesk --connect {} --password {} &",
            rustdesk_id, password
        );
        self.exec_ssh(&cmd).await?;
        Ok(())
    }

    pub async fn get_deskflow_status(&self) -> Result<bool> {
        // Truth = an ESTABLISHED deskflow session on port 24800, from this
        // machine's perspective (sport on the server, dport on the client).
        // The old check (pgrep -x deskflow/synergy + nonexistent unit names)
        // lied in both directions and broke whenever the process/unit changed.
        let output = self
            .exec_ssh("ss -Htn state established 2>/dev/null | grep -q ':24800' && echo connected")
            .await?;
        Ok(!output.trim().is_empty())
    }

    /// Human-readable report of provision-relevant binaries (used by
    /// `ally_provision` to report what actually landed instead of guessing).
    async fn verify_package_report(&self) -> String {
        let cmd = "for p in sensors htop btop lshw hdparm powertop; do \
            if command -v $p >/dev/null 2>&1; then echo \"$p: installed\"; else echo \"$p: MISSING\"; fi; \
          done";
        match self.exec_ssh(cmd).await {
            Ok(v) => {
                let missing: Vec<&str> = v.lines().filter(|l| l.ends_with("MISSING")).collect();
                if missing.is_empty() {
                    format!("packages: {}\n", v.trim())
                } else {
                    format!(
                        "packages: {}\nWARNING missing: {}\n",
                        v.trim(),
                        missing.join(", ")
                    )
                }
            }
            Err(e) => format!("package verification failed: {}\n", e),
        }
    }

    /// Provision the handheld (Bazzite/ROG Ally) for persistent, stable remote
    /// stats and management:
    ///  1. Install monitoring/tuning tooling via rpm-ostree + apply-live
    ///  2. Enable sshd on boot and ensure it is running
    ///  3. Install this host's SSH public key for passwordless login
    ///
    /// `host_pubkey` is the caller's ~/.ssh/<key>.pub contents (optional). If empty,
    /// only the package/systemd steps run.
    pub async fn ally_provision(&self, host_pubkey: &str) -> Result<String> {
        let mut log = String::new();

        // Distro detection: Bazzite is an ostree (atomic) system -> rpm-ostree
        let is_ostree = self
            .exec_ssh("command -v rpm-ostree >/dev/null 2>&1 && echo yes || echo no")
            .await
            .ok()
            .map(|s| s.trim() == "yes")
            .unwrap_or(false);

        let packages = "lm_sensors htop btop lshw hdparm powertop";

        if is_ostree {
            // rpm-ostree is interactive/layered; install with apply-live so we
            // don't require reboot, then verify below.
            let step = format!(
                "rpm-ostree install --apply-live --idempotent {} >/dev/null 2>&1; echo done",
                packages
            );
            let _ = self.exec_ssh_sudo(&step).await;
            log.push_str("installed packages via rpm-ostree (apply-live)\n");
        } else {
            // Non-atomic distro fallback.
            let step = format!(
                "dnf install -y {} >/dev/null 2>&1 || apt-get install -y {} >/dev/null 2>&1; echo done",
                packages, packages);
            let _ = self.exec_ssh_sudo(&step).await;
            log.push_str("installed packages via package manager\n");
        }

        // Report what actually landed instead of claiming success (the old code
        // discarded rpm-ostree's output entirely). Retry once after a beat in
        // case apply-live is still finalizing the new deployment.
        log.push_str(&self.verify_package_report().await);
        if log.contains("MISSING") {
            tokio::time::sleep(std::time::Duration::from_secs(8)).await;
            log.push_str(&self.verify_package_report().await);
        }

        // Enable + start sshd (systemd vs sysvinit).
        let _ = self.exec_ssh_sudo(
            "(systemctl enable --now sshd 2>/dev/null || systemctl enable --now ssh 2>/dev/null || true); \
             (systemctl is-active sshd 2>/dev/null || systemctl is-active ssh 2>/dev/null || true)").await;
        log.push_str("enabled sshd on boot\n");

        // Install host public key for passwordless login.
        if !host_pubkey.trim().is_empty() {
            let pubkey = host_pubkey.trim();
            let script = format!(
                "mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys; \
                 grep -qF '{}' ~/.ssh/authorized_keys || echo '{}' >> ~/.ssh/authorized_keys; \
                 sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/; s/^#*PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config; \
                 systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true",
                pubkey, pubkey);
            let _ = self.exec_ssh_sudo(&script).await;
            log.push_str("installed host SSH public key\n");
        }

        // Verify connections will stay alive with keepalive (checked by client).
        log.push_str("done");
        Ok(log)
    }
}

fn parse_size(s: &str) -> f64 {
    parse_size_bytes(s)
        .map(|b| b / (1024.0 * 1024.0 * 1024.0))
        .unwrap_or(0.0)
}

// Parse a human-friendly size string into raw bytes (supports K/M/G/T, KiB/MiB suffixes, bare bytes).
fn parse_size_bytes(s: &str) -> Option<f64> {
    let s = s.trim();
    if s.is_empty() {
        return None;
    }
    let upper = s.to_uppercase();
    let (num, mult): (&str, f64) = if upper.ends_with("TIB") || upper.ends_with("TB") {
        (&upper[..upper.len() - 2], 1024.0 * 1024.0 * 1024.0 * 1024.0)
    } else if upper.ends_with("GIB") || upper.ends_with("GB") {
        (&upper[..upper.len() - 2], 1024.0 * 1024.0 * 1024.0)
    } else if upper.ends_with("MIB") || upper.ends_with("MB") {
        (&upper[..upper.len() - 2], 1024.0 * 1024.0)
    } else if upper.ends_with("KIB") || upper.ends_with("KB") {
        (&upper[..upper.len() - 2], 1024.0)
    } else if upper.ends_with('T') {
        (&upper[..upper.len() - 1], 1024.0 * 1024.0 * 1024.0 * 1024.0)
    } else if upper.ends_with('G') {
        (&upper[..upper.len() - 1], 1024.0 * 1024.0 * 1024.0)
    } else if upper.ends_with('M') {
        (&upper[..upper.len() - 1], 1024.0 * 1024.0)
    } else if upper.ends_with('K') {
        (&upper[..upper.len() - 1], 1024.0)
    } else {
        (s, 1.0)
    };
    let num = num.trim();
    if num.is_empty() {
        return None;
    }
    num.parse::<f64>().ok().map(|n| n * mult)
}

// Parse a `df -B1` output line-set into a DiskUsage (first data line).
fn parse_df_bytes(df_out: &str) -> Option<DiskUsage> {
    for line in df_out.lines().skip(1) {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 6 {
            let total = parts[1].parse::<f64>().ok()?;
            let used = parts[2].parse::<f64>().ok()?;
            let free = parts[3].parse::<f64>().ok()?;
            // Use% may contain '%' or be the 5th token.
            let pct_raw = if parts[4].ends_with('%') {
                parts[4]
            } else {
                parts[5]
            };
            let usage_pct = pct_raw.trim_end_matches('%').parse::<f64>().unwrap_or(0.0);
            let gb = |b: f64| b / (1024.0 * 1024.0 * 1024.0);
            return Some(DiskUsage {
                total_gb: gb(total),
                used_gb: gb(used),
                free_gb: gb(free),
                usage_pct,
            });
        }
    }
    None
}

// Normalize a driver string: empty, "null", or "(null)" (rocm-smi/sysfs can
// produce these when a version can't be resolved) map back to "amdgpu".
pub(crate) fn clean_driver(driver: &str) -> String {
    let d = driver.trim();
    if d.is_empty() || d == "(null)" || d.eq_ignore_ascii_case("null") {
        "amdgpu".to_string()
    } else {
        d.to_string()
    }
}

// Recursively collect every numeric leaf of a `sensors -j` chip object,
// joining nested keys so "Tctl" + "temp1_input" becomes "Tctl_temp1_input".
pub(crate) fn collect_leaves(
    value: &serde_json::Value,
    prefix: &str,
    out: &mut Vec<(String, f64)>,
) {
    match value {
        serde_json::Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                out.push((prefix.to_string(), f));
            }
        }
        serde_json::Value::Object(map) => {
            for (k, v) in map.iter() {
                let name = if prefix.is_empty() {
                    k.clone()
                } else {
                    format!("{}_{}", prefix, k)
                };
                collect_leaves(v, &name, out);
            }
        }
        serde_json::Value::Array(arr) => {
            for (i, v) in arr.iter().enumerate() {
                collect_leaves(v, &format!("{}[{}]", prefix, i), out);
            }
        }
        _ => {}
    }
}

// Parse two `/proc/stat` CPU samples (taken ~0.5s apart) into live usage %.
fn parse_cpu_delta(s1: &str, s2: &str) -> f64 {
    let parse = |s: &str| -> Option<(u64, u64)> {
        let vals: Vec<u64> = s
            .split_whitespace()
            .filter_map(|v| v.parse().ok())
            .collect();
        // Fields: user nice system idle iowait irq softirq steal guest guest_nice
        if vals.len() < 5 {
            return None;
        }
        let idle = vals[3] + vals[4];
        let total: u64 = vals.iter().sum();
        if total == 0 {
            None
        } else {
            Some((idle, total))
        }
    };
    match (parse(s1), parse(s2)) {
        (Some((i0, t0)), Some((i1, t1))) => {
            let td = t1.saturating_sub(t0);
            let id = i1.saturating_sub(i0);
            if td > 0 {
                (100.0 * (1.0 - id as f64 / td as f64)).clamp(0.0, 100.0)
            } else {
                0.0
            }
        }
        _ => 0.0,
    }
}

fn parse_loadavg(s: &str) -> [f64; 3] {
    let parts: Vec<&str> = s.split_whitespace().collect();
    [
        parts.first().and_then(|s| s.parse().ok()).unwrap_or(0.0),
        parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0.0),
        parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0.0),
    ]
}

fn parse_kb(s: &str) -> u64 {
    s.trim().parse::<u64>().unwrap_or(0)
}

// Parse an amdgpu `pp_dpm_sclk` state table: "0: 200Mhz\n* 1: 2700Mhz".
// The '*' marks the active state (some drivers suffix it: "0: 800Mhz *");
// otherwise fall back to the last listed state.
fn parse_pp_dpm_sclk(output: &str) -> Option<u64> {
    let mut last = None;
    let mut active = None;
    for line in output.lines() {
        let l = line.trim();
        let is_active = l.contains('*');
        let l = l.replace('*', " ");
        let val = l.split_whitespace().nth(1).unwrap_or("");
        let digits: String = val.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(m) = digits.parse::<u64>() {
            last = Some(m);
            if is_active && m > 0 {
                active = Some(m);
            }
        }
    }
    active.or(last)
}

// Split a bundled disk-probe transcript into its marked sections.
fn split_sections(out: &str) -> (String, String, String, Option<String>) {
    let mut dfb = String::new();
    let mut mounts = String::new();
    let mut dfh = String::new();
    let mut cand = None;
    let mut section = "";
    for line in out.lines() {
        if let Some(c) = line.strip_prefix("CAND=") {
            cand = if c.is_empty() {
                None
            } else {
                Some(c.to_string())
            };
            continue;
        }
        match line {
            "==DFB==" => {
                section = "dfb";
                continue;
            }
            "==MOUNTS==" => {
                section = "mounts";
                continue;
            }
            "==DFH==" => {
                section = "dfh";
                continue;
            }
            _ => {}
        }
        let target = match section {
            "dfb" => &mut dfb,
            "mounts" => &mut mounts,
            "dfh" => &mut dfh,
            _ => continue,
        };
        if !target.is_empty() {
            target.push('\n');
        }
        target.push_str(line);
    }
    (dfb, mounts, dfh, cand)
}

// Split a bundled network-probe transcript into its marked sections.
fn split_net_sections(out: &str) -> (String, String, String, String) {
    let mut ip = String::new();
    let mut route = String::new();
    let mut dns = String::new();
    let mut dev = String::new();
    let mut section = 0;
    for line in out.lines() {
        match line {
            "==ROUTE==" => {
                section = 1;
                continue;
            }
            "==DNS==" => {
                section = 2;
                continue;
            }
            "==NETDEV==" => {
                section = 3;
                continue;
            }
            _ => {}
        }
        let target = match section {
            0 => &mut ip,
            1 => &mut route,
            2 => &mut dns,
            _ => &mut dev,
        };
        if !target.is_empty() {
            target.push('\n');
        }
        target.push_str(line);
    }
    (ip, route, dns, dev)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_driver_maps_null_artifacts_to_amdgpu() {
        assert_eq!(clean_driver("amdgpu"), "amdgpu");
        assert_eq!(clean_driver("6.4.1"), "6.4.1");
        assert_eq!(clean_driver(""), "amdgpu");
        assert_eq!(clean_driver("(null)"), "amdgpu");
        assert_eq!(clean_driver("null"), "amdgpu");
    }

    #[test]
    fn collect_leaves_flattens_nested_sensors_json() {
        let json = serde_json::json!({
            "Tctl": { "temp1_input": 47.375 },
            "edge": { "temp1_input": 45.0 },
            "sandwiched": { "temp2": { "temp2_max": 83.0 } }
        });
        let mut leaves = Vec::new();
        collect_leaves(&json, "", &mut leaves);
        leaves.sort_by(|a, b| a.0.cmp(&b.0));
        let names: Vec<&str> = leaves.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "Tctl_temp1_input",
                "edge_temp1_input",
                "sandwiched_temp2_temp2_max"
            ]
        );
        assert_eq!(leaves[0].1, 47.375);
    }

    #[test]
    fn parse_df_bytes_reads_df_b1_output() {
        let df = "Filesystem 1B-blocks Used Available Use% Mounted on\n\
                  /dev/nvme0n1p3 1998694907904 1504799707136 486688862208 76% /etc";
        let usage = parse_df_bytes(df).unwrap();
        assert!((usage.total_gb - 1861.0).abs() < 1.0);
        assert!((usage.usage_pct - 76.0).abs() < 0.1);
    }

    #[test]
    fn parse_size_bytes_handles_human_units() {
        assert_eq!(
            parse_size_bytes("1.8T").unwrap(),
            1.8 * 1024.0 * 1024.0 * 1024.0 * 1024.0
        );
        assert_eq!(
            parse_size_bytes("512G").unwrap(),
            512.0 * 1024.0 * 1024.0 * 1024.0
        );
        assert_eq!(parse_size_bytes("45M").unwrap(), 45.0 * 1024.0 * 1024.0);
    }

    #[test]
    fn parse_cpu_delta_computes_live_usage() {
        // Busy ticks: 100 -> 175 (delta 75), idle ticks: 930 -> 980 (delta 50).
        // Usage = 100 * (1 - 50/125) = 60%.
        let s1 = "50 10 5 900 30 1 1 0 0 0";
        let s2 = "100 15 10 950 30 1 1 0 0 0";
        // delta total = 110, delta idle = 50 -> usage = 100 * (1 - 50/110) = 54.55
        let pct = parse_cpu_delta(s1, s2);
        assert!((pct - 54.55).abs() < 1.0, "unexpected pct {}", pct);
        // Identical samples -> 0% (no delta).
        assert_eq!(parse_cpu_delta(s1, s1), 0.0);
        // Garbage -> 0%.
        assert_eq!(parse_cpu_delta("", ""), 0.0);
    }

    #[test]
    fn parse_pp_dpm_sclk_finds_active_state() {
        let out = "0: 200Mhz\n* 1: 2700Mhz\n2: 1800Mhz\n";
        assert_eq!(parse_pp_dpm_sclk(out), Some(2700));
        // Some drivers suffix the marker: "0: 800Mhz *".
        assert_eq!(
            parse_pp_dpm_sclk("0: 800Mhz *\n1: 1100Mhz\n2: 2799Mhz"),
            Some(800)
        );
        // No '*': falls back to the last listed state.
        assert_eq!(parse_pp_dpm_sclk("0: 200Mhz\n1: 2400Mhz"), Some(2400));
        assert_eq!(parse_pp_dpm_sclk(""), None);
        assert_eq!(parse_pp_dpm_sclk("garbage"), None);
    }

    #[test]
    fn parse_loadavg_and_kb() {
        assert_eq!(parse_loadavg("1.5 0.8 0.9 1/234 5678"), [1.5, 0.8, 0.9]);
        assert_eq!(parse_loadavg(""), [0.0, 0.0, 0.0]);
        assert_eq!(parse_kb("16777216"), 16777216);
        assert_eq!(parse_kb(""), 0);
    }

    #[test]
    fn split_sections_extracts_disk_markers() {
        let out = "CAND=/dev/nvme0n1p3\n==DFB==\n/dev/nvme0n1p3 100 50 50 50% /etc\n==MOUNTS==\n/dev/x 10 5 5 50% /var\n==DFH==\ndf / output\n";
        let (dfb, mounts, dfh, cand) = split_sections(out);
        assert_eq!(cand.as_deref(), Some("/dev/nvme0n1p3"));
        assert!(dfb.contains("/dev/nvme0n1p3 100"));
        assert!(mounts.contains("/dev/x 10"));
        assert!(dfh.contains("df / output"));
        // No CAND marker -> None.
        let (_, _, _, cand) = split_sections("==DFH==\nfoo\n");
        assert_eq!(cand, None);
    }

    #[test]
    fn split_net_sections_extracts_markers() {
        let out = "[{\"ifname\":\"wlan0\"}]\n==ROUTE==\n10.0.0.1\n==DNS==\n1.1.1.1\n8.8.8.8\n==NETDEV==\nInter-|  Receive\n face |bytes\nlo: 1 2";
        let (ip, route, dns, dev) = split_net_sections(out);
        assert!(ip.contains("ifname"));
        assert_eq!(route.trim(), "10.0.0.1");
        assert_eq!(dns.lines().count(), 2);
        assert!(dev.contains("lo:"));
    }
}
