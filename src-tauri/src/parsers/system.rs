use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub cpu_usage: f64,
    pub memory_total_mb: u64,
    pub memory_used_mb: u64,
    pub memory_usage_pct: f64,
    pub uptime: String,
    pub load_avg: Vec<f64>,
    pub hostname: String,
    pub kernel: String,
    pub array_state: String,
}

pub fn parse_free(output: &str) -> (u64, u64) {
    for line in output.lines() {
        if line.starts_with("Mem:") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let total = parts[1].parse::<u64>().unwrap_or(0);
                let used = parts[2].parse::<u64>().unwrap_or(0);
                return (total, used);
            }
        }
    }
    (0, 0)
}

pub fn parse_uptime(output: &str) -> String {
    let raw = output.trim();
    // Convert "up 2 weeks, 2 days, 15 hours, 38 minutes" to compact form
    let mut parts = Vec::new();
    for word in raw.split_whitespace() {
        match word {
            "week" | "weeks" => {
                if let Some(prev) = raw.split_whitespace().take_while(|w| *w != word).last() {
                    if let Ok(n) = prev.parse::<u32>() {
                        parts.push(format!("{}w", n));
                    }
                }
            }
            "day" | "days" => {
                if let Some(prev) = raw.split_whitespace().take_while(|w| *w != word).last() {
                    if let Ok(n) = prev.parse::<u32>() {
                        parts.push(format!("{}d", n));
                    }
                }
            }
            "hour" | "hours" => {
                if let Some(prev) = raw.split_whitespace().take_while(|w| *w != word).last() {
                    if let Ok(n) = prev.parse::<u32>() {
                        parts.push(format!("{}h", n));
                    }
                }
            }
            "minute" | "minutes" => {
                if let Some(prev) = raw.split_whitespace().take_while(|w| *w != word).last() {
                    if let Ok(n) = prev.parse::<u32>() {
                        parts.push(format!("{}m", n));
                    }
                }
            }
            _ => {}
        }
    }
    if parts.is_empty() {
        raw.to_string()
    } else {
        parts.join(" ")
    }
}

pub fn parse_load_avg(output: &str) -> Vec<f64> {
    output
        .split_whitespace()
        .filter_map(|s| s.parse::<f64>().ok())
        .collect()
}

pub fn parse_vmstat(output: &str) -> f64 {
    let mut total = 0u64;
    let mut idle = 0u64;

    for line in output.lines() {
        if line.starts_with("cpu ") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 5 {
                let vals: Vec<u64> = parts[1..].iter().filter_map(|s| s.parse().ok()).collect();
                if vals.len() >= 4 {
                    total = vals.iter().sum();
                    idle = vals.get(3).copied().unwrap_or(0);
                }
            }
            break;
        }
    }

    if total > 0 {
        ((total - idle) as f64 / total as f64 * 100.0).round()
    } else {
        0.0
    }
}
