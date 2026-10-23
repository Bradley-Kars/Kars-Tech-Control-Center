use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub driver_version: String,
    pub cuda_version: String,
    pub temperature: String,
    pub power_usage: String,
    pub power_cap: String,
    pub memory_used: String,
    pub memory_total: String,
    pub utilization: String,
    pub fan_speed: String,
}

pub fn parse_nvidia_smi(output: &str) -> Option<GpuInfo> {
    if !output.contains("NVIDIA-SMI") {
        return None;
    }

    let mut gpu_name = String::new();
    let mut driver = String::new();
    let mut cuda = String::new();
    let mut temp = String::new();
    let mut power_usage = String::new();
    let mut power_cap = String::new();
    let mut mem_used = String::new();
    let mut mem_total = String::new();
    let mut util = String::new();
    let mut fan = String::new();

    for line in output.lines() {
        if line.contains("Driver Version:") {
            if let Some(s) = line.find("Driver Version:") {
                let rest = &line[s + 15..];
                if let Some(e) = rest.find(char::is_whitespace) {
                    driver = rest[..e].trim().to_string();
                }
            }
            if let Some(s) = line.find("CUDA Version:") {
                let rest = &line[s + 13..];
                cuda = rest.split_whitespace().next().unwrap_or("").to_string();
            }
        }

        // GPU name line
        if (line.contains("GeForce")
            || line.contains("RTX")
            || line.contains("GTX")
            || line.contains("A100")
            || line.contains("H100")
            || line.contains("Tesla")
            || line.contains("NVIDIA"))
            && line.contains("|")
            && !line.contains("NVIDIA-SMI")
            && !line.contains("=====")
        {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 2 {
                let inner = parts[1].trim();
                let tokens: Vec<&str> = inner.split_whitespace().collect();
                if tokens.len() >= 3 {
                    let name_parts: Vec<&str> = tokens[1..]
                        .iter()
                        .take_while(|&&t| t != "Off" && t != "On" && t != "Persistence")
                        .copied()
                        .collect();
                    gpu_name = name_parts.join(" ");
                }
            }
        }

        // Stats line: "  0%   36C    P0             59W /  280W |       0MiB /  11264MiB |      0%      Default |"
        if line.contains("MiB") && line.contains("W /") && line.contains("C") {
            let parts: Vec<&str> = line.split('|').collect();
            if parts.len() >= 3 {
                let left = parts[1].trim();
                let left_tokens: Vec<&str> = left.split_whitespace().collect();

                for (i, t) in left_tokens.iter().enumerate() {
                    if t.ends_with("C") && i > 0 && t.len() > 1 {
                        temp = t[..t.len() - 1].to_string();
                    }
                    if t.ends_with("%") && i == 0 {
                        fan = t[..t.len() - 1].to_string();
                    }
                }

                // Find power: "59W / 280W" splits to ["59W", "/", "280W"]
                for (i, t) in left_tokens.iter().enumerate() {
                    if *t == "/" && i > 0 && i + 1 < left_tokens.len() {
                        let usage = left_tokens[i - 1];
                        let cap = left_tokens[i + 1];
                        power_usage = usage.trim_end_matches("W").to_string();
                        power_cap = cap.trim_end_matches("W").to_string();
                    }
                }

                // Memory: "0MiB /  11264MiB"
                let mid = parts[2].trim();
                if let Some(slash) = mid.find('/') {
                    let used_str = mid[..slash].trim();
                    let total_str = mid[slash + 1..].trim();
                    mem_used = used_str
                        .replace("MiB", "")
                        .replace("GiB", "")
                        .trim()
                        .to_string();
                    mem_total = total_str
                        .replace("MiB", "")
                        .replace("GiB", "")
                        .trim()
                        .to_string();
                }

                // Utilization
                let right = parts[3].trim();
                let right_tokens: Vec<&str> = right.split_whitespace().collect();
                if !right_tokens.is_empty() {
                    util = right_tokens[0].trim_end_matches('%').to_string();
                }
            }
        }
    }

    if gpu_name.is_empty() {
        gpu_name = "Unknown GPU".to_string();
    }

    Some(GpuInfo {
        name: gpu_name,
        driver_version: driver,
        cuda_version: cuda,
        temperature: temp,
        power_usage,
        power_cap,
        memory_used: mem_used,
        memory_total: mem_total,
        utilization: util,
        fan_speed: fan,
    })
}
