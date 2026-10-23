use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContainerInfo {
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created: String,
    pub size: String,
}

pub fn parse_docker_ps(output: &str) -> Vec<ContainerInfo> {
    let mut containers = Vec::new();
    let lines: Vec<&str> = output.lines().collect();

    if lines.len() < 2 {
        return containers;
    }

    let exited_re = Regex::new(r"Exited \((\d+)\)").ok();

    for line in &lines[1..] {
        if line.trim().is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 3 {
            continue;
        }

        let name = parts[0].trim().to_string();
        let status = parts[1].trim().to_string();
        let image = parts[2].trim().to_string();
        let ports = if parts.len() > 3 {
            parts[3..].join("  ").trim().to_string()
        } else {
            String::new()
        };

        let state = if status.starts_with("Up") {
            "running".to_string()
        } else if status.starts_with("Exited") {
            if let Some(caps) = exited_re.as_ref().and_then(|r| r.captures(&status)) {
                let code = caps.get(1).map(|m| m.as_str()).unwrap_or("?");
                format!("exited({})", code)
            } else {
                "exited".to_string()
            }
        } else if status.starts_with("Created") {
            "created".to_string()
        } else if status.starts_with("Restarting") {
            "restarting".to_string()
        } else if status.starts_with("Paused") {
            "paused".to_string()
        } else {
            "unknown".to_string()
        };

        containers.push(ContainerInfo {
            name,
            image,
            status,
            state,
            ports,
            created: String::new(),
            size: String::new(),
        });
    }

    containers
}
