use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantConfig {
    pub base_url: String,
    pub token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantState {
    pub entity_id: String,
    pub state: String,
    pub attributes: HashMap<String, Value>,
    pub last_changed: String,
    pub last_updated: String,
    pub context: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantConfigData {
    pub components: Vec<String>,
    pub config_dir: String,
    pub elevation: f64,
    pub latitude: f64,
    pub location_name: String,
    pub longitude: f64,
    pub time_zone: String,
    pub unit_system: Value,
    pub version: String,
    pub allowlist_external_dirs: Vec<String>,
    pub allowlist_external_urls: Vec<String>,
    pub currency: String,
    pub external_url: Option<String>,
    pub internal_url: Option<String>,
    pub theme: Option<String>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantService {
    pub domain: String,
    pub service: String,
    pub description: String,
    pub fields: HashMap<String, Value>,
    pub target: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantServices {
    pub services: HashMap<String, HashMap<String, HomeAssistantService>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantArea {
    pub area_id: String,
    pub name: String,
    pub picture: Option<String>,
    pub icon: Option<String>,
    pub floor_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantDevice {
    pub id: String,
    pub name: String,
    pub name_by_user: Option<String>,
    pub model: Option<String>,
    pub manufacturer: Option<String>,
    pub sw_version: Option<String>,
    pub hw_version: Option<String>,
    pub area_id: Option<String>,
    pub labels: Vec<String>,
    pub config_entries: Vec<String>,
    pub entry_type: Option<String>,
    pub identifiers: Vec<Vec<String>>,
    pub connections: Vec<Vec<String>>,
    pub via_device_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HomeAssistantEntityRegistry {
    pub entity_id: String,
    pub unique_id: String,
    pub platform: String,
    pub device_id: Option<String>,
    pub area_id: Option<String>,
    pub name: Option<String>,
    pub original_name: Option<String>,
    pub disabled_by: Option<String>,
    pub hidden_by: Option<String>,
    pub entity_category: Option<String>,
    pub icon: Option<String>,
    pub unit_of_measurement: Option<String>,
    pub device_class: Option<String>,
    pub original_device_class: Option<String>,
    pub supported_features: u32,
    pub capabilities: Value,
}

pub struct HomeAssistantClient {
    client: Client,
    config: HomeAssistantConfig,
}

impl HomeAssistantClient {
    pub fn new(config: HomeAssistantConfig) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self { client, config })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!(
            "{}/api/{}",
            self.config.base_url.trim_end_matches('/'),
            path
        );
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .send()
            .await
            .context("Send Home Assistant request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!(
                "Home Assistant error {}: {}",
                status,
                &text[..text.len().min(500)]
            );
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let url = format!(
            "{}/api/{}",
            self.config.base_url.trim_end_matches('/'),
            path
        );
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.token))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Send Home Assistant request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!(
                "Home Assistant error {}: {}",
                status,
                &text[..text.len().min(500)]
            );
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    pub async fn get_states(&self) -> Result<Vec<HomeAssistantState>> {
        let json = self.get("states").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_state(&self, entity_id: &str) -> Result<HomeAssistantState> {
        let json = self.get(&format!("states/{}", entity_id)).await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_config(&self) -> Result<HomeAssistantConfigData> {
        let json = self.get("config").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_services(&self) -> Result<HomeAssistantServices> {
        let json = self.get("services").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_areas(&self) -> Result<Vec<HomeAssistantArea>> {
        let json = self.get("config/area_registry").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_devices(&self) -> Result<Vec<HomeAssistantDevice>> {
        let json = self.get("config/device_registry").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_entity_registry(&self) -> Result<Vec<HomeAssistantEntityRegistry>> {
        let json = self.get("config/entity_registry").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn call_service(
        &self,
        domain: &str,
        service: &str,
        service_data: Value,
        target: Option<Value>,
    ) -> Result<Value> {
        let body = serde_json::json!({
            "service_data": service_data,
            "target": target
        });
        self.post(&format!("services/{}/{}", domain, service), body)
            .await
    }

    pub async fn toggle_entity(&self, entity_id: &str) -> Result<()> {
        let domain = entity_id.split('.').next().unwrap_or("homeassistant");
        self.call_service(
            domain,
            "toggle",
            serde_json::json!({"entity_id": entity_id}),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn turn_on_entity(&self, entity_id: &str) -> Result<()> {
        let domain = entity_id.split('.').next().unwrap_or("homeassistant");
        self.call_service(
            domain,
            "turn_on",
            serde_json::json!({"entity_id": entity_id}),
            None,
        )
        .await?;
        Ok(())
    }

    pub async fn turn_off_entity(&self, entity_id: &str) -> Result<()> {
        let domain = entity_id.split('.').next().unwrap_or("homeassistant");
        self.call_service(
            domain,
            "turn_off",
            serde_json::json!({"entity_id": entity_id}),
            None,
        )
        .await?;
        Ok(())
    }
}
