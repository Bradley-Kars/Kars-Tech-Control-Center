//! Local telemetry for the machine running the KTS Master Control app itself
//! ("This System" on the dashboard).
//!
//! Mirrors the remote `LinuxClient` probes but runs them on the local host so
//! the controller's own CPU / memory / GPU / temps can be shown alongside the
//! managed devices.

use anyhow::{bail, Context, Result};
use std::process::Command;
use std::time::Duration;

use crate::linux_client::{clean_driver, collect_leaves, GpuInfo, LinuxSystemStats, ThermalInfo};

/// Run a shell command on the local host and return trimmed stdout.
/// Fails with the captured stderr when the exit status is non-zero.
fn run(cmd: &str) -> Result<String> {
    let output = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .output()
        .with_context(|| format!("failed to run local command: {cmd}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        bail!("local command failed ({}): {}", cmd, stderr.trim());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Snapshot of `/proc/stat` CPU aggregate as `(idle+jiffies, total_jiffies)`.
fn read_cpu_times() -> (u64, u64) {
    let s = std::fs::read_to_string("/proc/stat").unwrap_or_default();
    let Some(line) = s.lines().find(|l| l.starts_with("cpu ")) else {
        return (0, 0);
    };
    let parts: Vec<u64> = line
        .split_whitespace()
        .skip(1)
        .filter_map(|p| p.parse::<u64>().ok())
        .collect();
    if parts.len() < 4 {
        return (0, 0);
    }
    // Column layout: user nice system idle iowait irq softirq steal ...
    let idle = parts[3] + parts.get(4).copied().unwrap_or(0);
    let total: u64 = parts.iter().sum();
    (idle, total)
}

pub fn get_system_stats() -> Result<LinuxSystemStats> {
    let hostname = run("hostname")?;
    let kernel = run("uname -r")?;
    let os_release = run("cat /etc/os-release | grep PRETTY_NAME | cut -d'\"' -f2")?;
    let arch = run("uname -m")?;
    let uptime = run("uptime -p")?;

    let cpuinfo = std::fs::read_to_string("/proc/cpuinfo")?;
    let cpu_cores = cpuinfo
        .lines()
        .filter(|l| l.starts_with("processor"))
        .count() as u32;
    let cpu_brand = cpuinfo
        .lines()
        .find(|l| l.starts_with("model name"))
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // Some CPUs (e.g. some ARM/embedded parts) report no "cpu MHz" line;
    // tolerate that instead of failing the whole probe.
    let cpu_speed_mhz = run("cat /proc/cpuinfo | grep 'cpu MHz' | head -1 | awk '{print $4}'")
        .ok()
        .and_then(|m| m.parse::<f64>().ok())
        .map(|mhz| mhz / 1000.0)
        .unwrap_or(0.0);

    let meminfo = std::fs::read_to_string("/proc/meminfo")?;
    let parse_mem = |key: &str| -> u64 {
        meminfo
            .lines()
            .find(|l| l.starts_with(key))
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|s| s.parse().ok())
            .unwrap_or(0)
    };

    let mem_total_kb = parse_mem("MemTotal:");
    let mem_free_kb = parse_mem("MemFree:");
    let mem_available_kb = parse_mem("MemAvailable:");
    let swap_total_kb = parse_mem("SwapTotal:");
    let swap_free_kb = parse_mem("SwapFree:");

    let mem_used_kb = mem_total_kb.saturating_sub(mem_available_kb);
    let swap_used_kb = swap_total_kb.saturating_sub(swap_free_kb);

    let loadavg = std::fs::read_to_string("/proc/loadavg")?;
    let load_parts: Vec<&str> = loadavg.split_whitespace().collect();
    let load_avg = [
        load_parts
            .first()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        load_parts
            .get(1)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
        load_parts
            .get(2)
            .and_then(|s| s.parse().ok())
            .unwrap_or(0.0),
    ];

    // Proper delta: sample /proc/stat ~0.5s apart. (Remote clients use the
    // since-boot snapshot; locally a real sample is cheap and more honest.)
    let (idle0, total0) = read_cpu_times();
    std::thread::sleep(Duration::from_millis(500));
    let (idle1, total1) = read_cpu_times();
    let cpu_usage = if total1 > total0 {
        let idle_d = idle1.saturating_sub(idle0);
        let total_d = total1 - total0;
        ((1.0 - idle_d as f64 / total_d as f64) * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    };

    let timezone =
        run("cat /etc/timezone 2>/dev/null || timedatectl | grep 'Time zone' | awk '{print $3}'")
            .unwrap_or_default();

    let platform_profile = run("cat /sys/firmware/acpi/platform_profile 2>/dev/null")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let platform_profile_choices =
        run("cat /sys/firmware/acpi/platform_profile_choices 2>/dev/null")
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

    Ok(LinuxSystemStats {
        hostname,
        kernel,
        os_release,
        arch,
        uptime,
        cpu_usage,
        cpu_cores,
        cpu_threads: cpu_cores,
        cpu_brand,
        cpu_speed: cpu_speed_mhz,
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
        load_avg,
        timezone,
        platform_profile,
        platform_profile_choices,
    })
}

/// Local mirror of `LinuxClient::get_thermal` (sensors JSON → text → sysfs).
/// lm_sensors is optional; the sysfs fallback covers the common case.
pub fn get_thermal() -> Result<ThermalInfo> {
    let sensors_output = run("sensors -j 2>/dev/null || sensors 2>/dev/null").unwrap_or_default();

    let mut cpu_temp = None;
    let mut gpu_temp = None;
    let mut fan_speed = None;
    let mut fan_pwm = None;

    if sensors_output.starts_with('{') {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&sensors_output) {
            if let Some(root) = json.as_object() {
                let mut cpu_readings: Vec<f64> = Vec::new();
                let mut gpu_readings: Vec<f64> = Vec::new();
                let mut fan_readings: Vec<f64> = Vec::new();
                let mut pwm_readings: Vec<f64> = Vec::new();

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
                        || chip_l.contains("gpu")
                        || chip_l.contains("i915")
                        || chip_l.contains("xe_");
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
                        }
                        if feat_l.contains("pwm") && v > 0.0 && v <= 255.0 {
                            pwm_readings.push(v);
                        }
                    }
                }

                cpu_temp = cpu_readings.first().copied();
                gpu_temp = gpu_readings.first().copied();
                fan_speed = fan_readings.first().map(|v| *v as u32);
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
            let is_gpu_chip = chip.contains("amdgpu")
                || chip.contains("nvidia")
                || chip.contains("gpu")
                || chip.contains("i915")
                || chip.contains("xe_");

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
                "fan", "pwm", "pow", "ppt", "volt", "vdd", "curr", "energ", "aps", "freq", "clk",
                "mem",
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

            if feature.contains("fan") && lower.contains("rpm") && fan_speed.is_none() {
                if let Some(speed) = value {
                    if speed > 0.0 {
                        fan_speed = Some(speed as u32);
                    }
                }
            }
        }
    }

    // Sysfs fallback (thermal zones + hwmon) — no lm_sensors configuration needed.
    if cpu_temp.is_none() || gpu_temp.is_none() || fan_speed.is_none() || fan_pwm.is_none() {
        if let Ok(sysfs) = run(
            "for z in /sys/class/thermal/thermal_zone*; do \
                t=$(cat $z/temp 2>/dev/null); \
                ty=$(cat $z/type 2>/dev/null); \
                [ -n \"$t\" ] && echo \"ZONE:$ty:$t\"; \
             done; \
             for h in /sys/class/hwmon/hwmon*/; do \
                n=$(cat $h/name 2>/dev/null); \
                for t in $h/temp*_input; do [ -f \"$t\" ] && echo \"HW:$n:$(basename $t):$(cat $t)\"; done; \
                for f in $h/fan*_input; do [ -f \"$f\" ] && echo \"FAN:$n:$(cat $f)\"; done; \
                for p in $h/pwm*; do [ -f \"$p\" ] && echo \"PWM:$n:$(cat $p)\"; done; \
             done; true",
        ) {
            let mut pwm_raw: Vec<f64> = Vec::new();
            for line in sysfs.lines() {
                if let Some(rest) = line.strip_prefix("ZONE:") {
                    let mut parts = rest.splitn(2, ':');
                    let ty = parts.next().unwrap_or("").to_lowercase();
                    let temp_c = parts
                        .next()
                        .and_then(|s| s.trim().parse::<f64>().ok())
                        .map(|m| m / 1000.0);
                    if let Some(t) = temp_c {
                        if t > 0.0 && t <= 110.0 {
                            let is_gpu = ty.contains("gpu");
                            let is_cpu =
                                ty.contains("x86_pkg") || ty.contains("cpu") || ty.contains("acpi");
                            if is_gpu {
                                if gpu_temp.is_none() {
                                    gpu_temp = Some(t);
                                }
                            } else if is_cpu && cpu_temp.is_none() {
                                cpu_temp = Some(t);
                            }
                        }
                    }
                } else if let Some(rest) = line.strip_prefix("HW:") {
                    let mut parts = rest.splitn(3, ':');
                    let name = parts.next().unwrap_or("").to_lowercase();
                    let _feature = parts.next().unwrap_or("").to_lowercase();
                    let temp_c = parts
                        .next()
                        .and_then(|s| s.trim().parse::<f64>().ok())
                        .map(|m| m / 1000.0);
                    if let Some(t) = temp_c {
                        if t > 0.0 && t <= 110.0 {
                            if name.contains("amdgpu")
                                || name.contains("i915")
                                || name.contains("xe")
                            {
                                if gpu_temp.is_none() {
                                    gpu_temp = Some(t);
                                }
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
                    if fan_speed.is_none() {
                        if let Some(rpm) = rest
                            .split_once(':')
                            .and_then(|(_, s)| s.trim().parse::<u32>().ok())
                        {
                            if rpm > 0 {
                                fan_speed = Some(rpm);
                            }
                        }
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
        }
    }

    Ok(ThermalInfo {
        cpu_temp_c: cpu_temp,
        gpu_temp_c: gpu_temp,
        fan_speed_rpm: fan_speed,
        fan_pwm,
        power_w: None,
        gpu_fan_speed_rpm: None,
    })
}

/// Local mirror of `LinuxClient::get_gpu_info` (nvidia-smi → rocm-smi → amdgpu
/// sysfs → lspci).
pub fn get_gpu_info() -> Result<GpuInfo> {
    // 1) NVIDIA first.
    let nvidia_output =
        run("nvidia-smi --query-gpu=name,driver_version,memory.total,memory.used,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>/dev/null");
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

    // 2) AMD via rocm-smi (JSON).
    let amd_json = run("rocm-smi --json 2>/dev/null");
    if let Ok(output) = amd_json {
        if !output.trim().is_empty() && output.trim_start().starts_with('{') {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&output) {
                if let Some((_, card)) = json.as_object().and_then(|o| o.iter().next()) {
                    let get = |key: &str| -> Option<String> {
                        card.get(key)
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    };

                    let model = get("Card series")
                        .or_else(|| get("Card SKU"))
                        .filter(|s| !s.is_empty())
                        .unwrap_or_else(|| "AMD GPU".to_string());
                    let driver = clean_driver(&get("Driver version").unwrap_or_default());

                    let vram_total_mb = get("VRAM Total Memory (B)")
                        .and_then(|s| s.parse::<u64>().ok())
                        .map(|b| b / (1024 * 1024))
                        .unwrap_or(0);
                    let vram_used_mb = get("VRAM Total Used Memory (B)")
                        .and_then(|s| s.parse::<u64>().ok())
                        .map(|b| b / (1024 * 1024))
                        .unwrap_or(0);

                    let temp = get("Temperature (Sensor edge) (C)")
                        .or_else(|| get("Temperature (Sensor junction) (C)"))
                        .and_then(|s| s.parse::<f64>().ok());

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
                    fill_from_amdgpu_sysfs(&mut info);
                    return Ok(info);
                }
            }
        }
    }

    // 3) AMD via sysfs.
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
    fill_from_amdgpu_sysfs(&mut info);

    if info.memory_total_mb > 0 || info.temperature_c.is_some() || info.memory_used_mb > 0 {
        return Ok(info);
    }

    // 4) Intel iGPU/ARC via sysfs (i915 / xe drivers).
    if let Some(intel_info) = fill_from_intel_sysfs() {
        return Ok(intel_info);
    }

    // 5) Last resort: whatever PCI display device is present.
    let lspci = run(
        "lspci 2>/dev/null | grep -iE 'vga compatible controller|3d controller|display controller' | head -1",
    );
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

/// Local mirror of `LinuxClient::fill_from_amdgpu_sysfs`.
fn fill_from_amdgpu_sysfs(info: &mut GpuInfo) {
    let card = run("for d in /sys/class/drm/card*/device/driver; do \
            drv=$(readlink -f $d 2>/dev/null); \
            case \"$drv\" in *amdgpu*) echo ${d%/device/driver} | xargs basename; break;; esac; \
         done")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| s.starts_with("card"));

    if let Some(card) = card {
        let base = format!("/sys/class/drm/{}/device", card);

        let vram_total = run(&format!("cat {}/mem_info_vram_total 2>/dev/null", base))
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok());
        let vram_used = run(&format!("cat {}/mem_info_vram_used 2>/dev/null", base))
            .ok()
            .and_then(|s| s.trim().parse::<u64>().ok());
        let busy = run(&format!("cat {}/gpu_busy_percent 2>/dev/null", base))
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
    }

    if info.temperature_c.is_none() {
        let temp = run("for h in /sys/class/hwmon/hwmon*/name; do \
                n=$(cat $h 2>/dev/null); \
                [ \"$n\" = \"amdgpu\" ] || continue; \
                d=$(dirname $h); \
                for t in $d/temp*_input; do \
                    [ -f \"$t\" ] && echo \"$(cat $t)\"; break; \
                done; \
                break; \
             done")
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .map(|m| m / 1000.0);
        if let Some(t) = temp {
            if t > 0.0 && t <= 110.0 {
                info.temperature_c = Some(t);
            }
        }
    }

    if info.driver_version.is_empty() {
        let drv = run("cat /sys/class/drm/card*/device/driver_override 2>/dev/null | head -1").ok();
        info.driver_version = clean_driver(&drv.unwrap_or_default());
    }
    if info.model == "AMD GPU" {
        let m = run(
            "lspci 2>/dev/null | grep -iE 'vga compatible controller|3d controller|display controller' | head -1",
        )
        .ok();
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
        let prod = run("cat /sys/class/drm/card*/device/product 2>/dev/null | head -1").ok();
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

/// Local mirror of `LinuxClient` Intel probing for i915 / xe drivers.
///
/// i915 exposes:
/// - utilization: `/sys/class/drm/card*/device/gpu_busy_percent` (0-100)
/// - temperature: hwmon device named `i915` (`temp1_input`, millidegrees)
/// - no dedicated VRAM (iGPU shares system memory) — reported as 0.
///
/// The `xe` driver (ARC, newer Xe iGPUs) exposes the same sysfs paths.
fn fill_from_intel_sysfs() -> Option<GpuInfo> {
    let card = run("for d in /sys/class/drm/card*/device/driver; do \
            drv=$(readlink -f $d 2>/dev/null); \
            case \"$drv\" in *i915*|*xe*) echo ${d%/device/driver} | xargs basename; break;; esac; \
         done")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| s.starts_with("card"))?;

    let base = format!("/sys/class/drm/{}/device", card);

    let driver = std::fs::read_link(format!("{base}/driver"))
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_default();

    let busy = run(&format!("cat {base}/gpu_busy_percent 2>/dev/null"))
        .ok()
        .and_then(|s| s.trim().parse::<f64>().ok())
        .filter(|v| *v >= 0.0 && *v <= 100.0);

    let mut temperature_c = None;
    let temp = run("\
        for h in /sys/class/hwmon/hwmon*/name; do \
            n=$(cat $h 2>/dev/null); \
            case \"$n\" in i915|xe) d=$(dirname $h); \
                for t in $d/temp*_input; do \
                    [ -f \"$t\" ] && echo \"$(cat $t)\" && break; \
                done; \
                break;; \
            esac; \
         done")
    .ok()
    .and_then(|s| s.trim().parse::<f64>().ok())
    .map(|m| m / 1000.0);
    if let Some(t) = temp {
        if t > 0.0 && t <= 110.0 {
            temperature_c = Some(t);
        }
    }

    let model = run(
        "lspci 2>/dev/null | grep -iE 'vga compatible controller|3d controller|display controller' | head -1",
    )
    .ok()
    .map(|l| {
        l.trim()
            .rsplit_once(':')
            .map(|(_, s)| s.trim().to_string())
            .unwrap_or_else(|| l.trim().to_string())
    })
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "Intel Graphics".to_string());

    Some(GpuInfo {
        vendor: "Intel".to_string(),
        model,
        driver_version: driver,
        memory_total_mb: 0,
        memory_used_mb: 0,
        temperature_c,
        utilization_pct: busy,
        clock_mhz: None,
    })
}
