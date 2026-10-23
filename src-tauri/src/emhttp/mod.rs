use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub struct EmhttpClient {
    client: Client,
    base_url: String,
    api_key: Option<String>,
}

impl EmhttpClient {
    pub fn new(hostname: &str, api_key: Option<&str>) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;

        Ok(Self {
            client,
            base_url: format!("https://{}:{}", hostname, 443),
            api_key: api_key.map(|s| s.to_string()),
        })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!("{}/{}", self.base_url, path);
        let mut req = self.client.get(&url);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key.as_str());
        }
        let resp = req.send().await.with_context(|| format!("GET {}", path))?;
        let status = resp.status();
        let text = resp.text().await.context("Read response")?;
        if !status.is_success() {
            anyhow::bail!("API error {}: {}", status, &text[..text.len().min(200)]);
        }
        serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON from {}: {}", path, &text[..text.len().min(200)]))
    }

    async fn post(&self, path: &str, params: &[(&str, &str)]) -> Result<Value> {
        let url = format!("{}/{}", self.base_url, path);
        let mut req = self.client.post(&url).form(params);
        if let Some(ref key) = self.api_key {
            req = req.header("X-Api-Key", key.as_str());
        }
        let resp = req.send().await.with_context(|| format!("POST {}", path))?;
        let status = resp.status();
        let text = resp.text().await.context("Read response")?;
        if !status.is_success() {
            anyhow::bail!("API error {}: {}", status, &text[..text.len().min(200)]);
        }
        Ok(serde_json::from_str(&text).unwrap_or(Value::String(text)))
    }

    // Docker
    pub async fn get_docker_containers(&self) -> Result<Vec<DockerContainer>> {
        let data = self.get("api/v2/docker").await?;
        let containers: Vec<DockerContainer> = serde_json::from_value(
            data.get("containers")
                .or(Some(&Value::Array(vec![])))
                .cloned()
                .unwrap_or_default(),
        )
        .unwrap_or_default();
        Ok(containers)
    }

    pub async fn docker_start(&self, name: &str) -> Result<String> {
        self.post(
            &format!("api/v2/docker/container/{}", name),
            &[("action", "start")],
        )
        .await?;
        Ok(format!("Started {}", name))
    }

    pub async fn docker_stop(&self, name: &str) -> Result<String> {
        self.post(
            &format!("api/v2/docker/container/{}", name),
            &[("action", "stop")],
        )
        .await?;
        Ok(format!("Stopped {}", name))
    }

    pub async fn docker_restart(&self, name: &str) -> Result<String> {
        self.post(
            &format!("api/v2/docker/container/{}", name),
            &[("action", "restart")],
        )
        .await?;
        Ok(format!("Restarted {}", name))
    }

    pub async fn docker_remove(&self, name: &str) -> Result<String> {
        self.post(
            &format!("api/v2/docker/container/{}", name),
            &[("action", "remove")],
        )
        .await?;
        Ok(format!("Removed {}", name))
    }

    pub async fn docker_logs(&self, name: &str, lines: u32) -> Result<String> {
        let data = self
            .get(&format!(
                "api/v2/docker/container/{}/logs?tail={}",
                name, lines
            ))
            .await?;
        Ok(data.as_str().unwrap_or(&data.to_string()).to_string())
    }

    pub async fn docker_update_all(&self) -> Result<String> {
        self.post("api/v2/docker/update", &[("action", "update")])
            .await?;
        Ok("Updating all containers".to_string())
    }

    // Disks
    pub async fn get_disks(&self) -> Result<Vec<DiskInfo>> {
        let data = self.get("api/v2/disks").await?;
        let disks: Vec<DiskInfo> = serde_json::from_value(
            data.get("disks")
                .or(Some(&Value::Array(vec![])))
                .cloned()
                .unwrap_or_default(),
        )
        .unwrap_or_default();
        Ok(disks)
    }

    pub async fn get_disk_smart(&self, device: &str) -> Result<Value> {
        self.get(&format!("api/v2/disk/smart/{}", device)).await
    }

    // Shares
    pub async fn get_shares(&self) -> Result<Vec<ShareInfo>> {
        let data = self.get("api/v2/shares").await?;
        let shares: Vec<ShareInfo> = serde_json::from_value(
            data.get("shares")
                .or(Some(&Value::Array(vec![])))
                .cloned()
                .unwrap_or_default(),
        )
        .unwrap_or_default();
        Ok(shares)
    }

    // System
    pub async fn get_system_info(&self) -> Result<Value> {
        self.get("api/v2/system/info").await
    }

    pub async fn get_system_stats(&self) -> Result<Value> {
        self.get("api/v2/system/stats").await
    }

    pub async fn get_array_info(&self) -> Result<Value> {
        self.get("api/v2/system/ini/var").await
    }

    pub async fn get_array_check_status(&self) -> Result<Value> {
        self.get("api/v2/system/parity").await
    }

    // Processes
    pub async fn get_processes(&self) -> Result<Value> {
        self.get("api/v2/system/process").await
    }

    // Network
    pub async fn get_network(&self) -> Result<Value> {
        self.get("api/v2/network").await
    }

    // Plugins
    pub async fn get_plugins(&self) -> Result<Value> {
        self.get("api/v2/plugin").await
    }

    // Logs
    pub async fn get_logs(&self, lines: u32) -> Result<String> {
        let data = self.get(&format!("api/v2/log?tail={}", lines)).await?;
        Ok(data.as_str().unwrap_or(&data.to_string()).to_string())
    }

    // Notifications
    pub async fn get_notifications(&self) -> Result<Value> {
        self.get("api/v2/notification").await
    }

    // Reboot / Shutdown
    pub async fn reboot(&self) -> Result<String> {
        self.post("api/v2/system/reboot", &[]).await?;
        Ok("Rebooting".to_string())
    }

    pub async fn shutdown(&self) -> Result<String> {
        self.post("api/v2/system/shutdown", &[]).await?;
        Ok("Shutting down".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
#[derive(Default)]
pub struct DockerContainer {
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,
    pub ports: String,
    pub created: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct ShareInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub comment: String,
    #[serde(default)]
    pub allocator: String,
    #[serde(default)]
    pub useCache: String,
    #[serde(default)]
    pub cachePool: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub free: String,
    #[serde(default)]
    pub used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(non_snake_case)]
pub struct DiskInfo {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub device: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub temp: String,
    #[serde(default, rename = "type")]
    pub disk_type: String,
    #[serde(default)]
    pub fsType: String,
    #[serde(default)]
    pub fsStatus: String,
    #[serde(default)]
    pub fsSize: String,
    #[serde(default)]
    pub fsFree: String,
    #[serde(default)]
    pub fsUsed: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub sectors: String,
    #[serde(default)]
    pub sector_size: String,
}
