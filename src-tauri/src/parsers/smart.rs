use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartInfo {
    pub device: String,
    pub model: String,
    pub capacity: String,
    pub power_on_hours: Option<String>,
    pub temperature: Option<String>,
    pub reallocated_sectors: Option<String>,
    pub pending_sectors: Option<String>,
    pub health: String,
}

pub fn parse_smartctl(output: &str, device: &str) -> SmartInfo {
    let mut info = SmartInfo {
        device: device.to_string(),
        model: String::new(),
        capacity: String::new(),
        power_on_hours: None,
        temperature: None,
        reallocated_sectors: None,
        pending_sectors: None,
        health: "UNKNOWN".to_string(),
    };

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("Model Family:") || trimmed.starts_with("Device Model:") {
            let val = trimmed.split_once(':').map(|x| x.1).unwrap_or("").trim();
            if info.model.is_empty() {
                info.model = val.to_string();
            }
        }
        if trimmed.starts_with("User Capacity:") {
            info.capacity = trimmed
                .split_once(':')
                .map(|x| x.1)
                .unwrap_or("")
                .trim()
                .to_string();
        }
        if trimmed.contains("Power_On_Hours") {
            if let Some(val) = extract_smart_value(trimmed) {
                info.power_on_hours = Some(val);
            }
        }
        if trimmed.contains("Temperature_Celsius") || trimmed.contains("Airflow_Temperature_Cel") {
            if let Some(val) = extract_smart_value(trimmed) {
                info.temperature = Some(val);
            }
        }
        if trimmed.contains("Reallocated_Sector_Ct") {
            if let Some(val) = extract_smart_value(trimmed) {
                info.reallocated_sectors = Some(val);
            }
        }
        if trimmed.contains("Current_Pending_Sector") {
            if let Some(val) = extract_smart_value(trimmed) {
                info.pending_sectors = Some(val);
            }
        }
        if trimmed.starts_with("SMART overall-health self-assessment test result:") {
            let result = trimmed.split_once(':').map(|x| x.1).unwrap_or("").trim();
            info.health = result.to_string();
        }
    }

    info
}

fn extract_smart_value(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    // Format: ID# ATTRIBUTE_NAME FLAG VALUE WORST THRESH TYPE UPDATED WHEN_FAILED RAW_VALUE(6)
    // Index:  0   1              2     3     4     5      6    7       8          9
    if parts.len() >= 4 {
        Some(parts[3].to_string())
    } else {
        None
    }
}
