use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudConfig {
    pub base_url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudServerInfo {
    #[serde(rename = "version")]
    pub version: String,
    #[serde(rename = "versionstring", default)]
    pub versionstring: Option<String>,
    #[serde(rename = "edition", default)]
    pub edition: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NextcloudServerInfoWrapper {
    nextcloud: NextcloudSystemInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NextcloudSystemInfo {
    system: NextcloudServerInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudSystemStatus {
    #[serde(default)]
    pub installed: bool,
    #[serde(default)]
    pub maintenance: bool,
    #[serde(default)]
    pub needs_db_upgrade: bool,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(rename = "versionstring", default)]
    pub versionstring: Option<String>,
    #[serde(rename = "edition", default)]
    pub edition: Option<String>,
    #[serde(rename = "productname", default)]
    pub productname: Option<String>,
    #[serde(default)]
    pub extended_support: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudStorageStats {
    pub num_users: u64,
    pub num_files: u64,
    pub num_storages: u64,
    pub num_storages_local: u64,
    pub num_storages_home: u64,
    pub num_storages_other: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudActivity {
    pub activities: Vec<ActivityItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityItem {
    #[serde(rename = "activity_id")]
    pub activity_id: u64,
    pub app: String,
    #[serde(rename = "type")]
    pub activity_type: String,
    pub user: String,
    pub subject: String,
    pub subject_rich: Option<Value>,
    pub message: String,
    pub message_rich: Option<Value>,
    pub file: Option<String>,
    pub link: Option<String>,
    pub datetime: String,
    pub object_type: Option<String>,
    #[serde(rename = "object_id", deserialize_with = "deserialize_object_id")]
    pub object_id: Option<u64>,
    pub object_name: Option<String>,
    pub objects: Option<Value>,
    pub icon: Option<String>,
}

fn deserialize_object_id<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = Value::deserialize(deserializer)?;
    match value {
        Value::String(s) => s.parse::<u64>().map(Some).map_err(serde::de::Error::custom),
        Value::Number(n) => n
            .as_u64()
            .map(Some)
            .ok_or_else(|| serde::de::Error::custom("Expected u64")),
        _ => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudUser {
    pub id: String,
    pub display_name: String,
    pub enabled: bool,
    pub quota: Option<NextcloudQuota>,
    pub email: Option<String>,
    pub groups: Vec<String>,
    pub backend: String,
    pub subadmin: Vec<String>,
    pub last_login: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextcloudQuota {
    pub free: u64,
    pub used: u64,
    pub total: u64,
    pub relative: f64,
}

pub struct NextcloudClient {
    client: Client,
    config: NextcloudConfig,
}

impl NextcloudClient {
    pub fn new(config: NextcloudConfig) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self { client, config })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        // Determine the correct base path based on the endpoint
        let base_path = if path.starts_with("cloud/") || path.starts_with("apps/") {
            "ocs/v2.php/"
        } else {
            "ocs/v2.php/apps/"
        };
        let url = format!(
            "{}/{}{}",
            self.config.base_url.trim_end_matches('/'),
            base_path,
            path
        );
        let resp = self
            .client
            .get(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("OCS-APIRequest", "true")
            .header("Accept", "application/json")
            .send()
            .await
            .context("Send Nextcloud request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!(
                "Nextcloud error {}: {}",
                status,
                &text[..text.len().min(500)]
            );
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    pub async fn get_server_info(&self) -> Result<NextcloudServerInfo> {
        let json = self.get("serverinfo/api/v1/info").await?;
        let data = json
            .get("ocs")
            .and_then(|o| o.get("data"))
            .cloned()
            .unwrap_or(json);
        let wrapper: NextcloudServerInfoWrapper = serde_json::from_value(data)?;
        let mut info = wrapper.nextcloud.system;
        // Nextcloud 34 doesn't return versionstring/edition, use version as fallback
        if info.versionstring.is_none() {
            info.versionstring = Some(info.version.clone());
        }
        if info.edition.is_none() {
            info.edition = Some("Community".to_string());
        }
        Ok(info)
    }

    pub async fn get_system_status(&self) -> Result<NextcloudSystemStatus> {
        // Use info endpoint since status endpoint doesn't work in Nextcloud 34
        let json = self.get("serverinfo/api/v1/info").await?;
        let data = json
            .get("ocs")
            .and_then(|o| o.get("data"))
            .cloned()
            .unwrap_or(json);
        let wrapper: NextcloudServerInfoWrapper = serde_json::from_value(data)?;
        let info = wrapper.nextcloud.system;

        // Build status from info endpoint data
        let mut status = NextcloudSystemStatus {
            installed: true,
            maintenance: false,
            needs_db_upgrade: false,
            version: Some(info.version.clone()),
            versionstring: info.versionstring.clone(),
            edition: info.edition.clone(),
            productname: Some("Nextcloud".to_string()),
            extended_support: false,
        };

        // Ensure fields have defaults
        if status.versionstring.is_none() {
            status.versionstring = Some(info.version.clone());
        }
        if status.edition.is_none() {
            status.edition = Some("Community".to_string());
        }
        if status.productname.is_none() {
            status.productname = Some("Nextcloud".to_string());
        }
        Ok(status)
    }

    pub async fn get_storage_stats(&self) -> Result<NextcloudStorageStats> {
        let mut stats = NextcloudStorageStats {
            num_users: 0,
            num_files: 0,
            num_storages: 0,
            num_storages_local: 0,
            num_storages_home: 0,
            num_storages_other: 0,
        };
        // Try to get storage info from serverinfo endpoint
        if let Ok(info_json) = self.get("serverinfo/api/v1/info").await {
            let info_data = info_json
                .get("ocs")
                .and_then(|o| o.get("data"))
                .cloned()
                .unwrap_or_default();
            if let Some(storage) = info_data.get("nextcloud").and_then(|n| n.get("storage")) {
                stats.num_users = storage
                    .get("num_users")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                stats.num_files = storage
                    .get("num_files")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                stats.num_storages = storage
                    .get("num_storages")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                stats.num_storages_local = storage
                    .get("num_storages_local")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                stats.num_storages_home = storage
                    .get("num_storages_home")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                stats.num_storages_other = storage
                    .get("num_storages_other")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
            }
        }
        // Try to get user count from users endpoint as fallback
        if stats.num_users == 0 {
            if let Ok(users_json) = self.get("cloud/users").await {
                let users_data = users_json
                    .get("ocs")
                    .and_then(|o| o.get("data"))
                    .cloned()
                    .unwrap_or_default();
                if let Some(users) = users_data.get("users").and_then(|u| u.as_array()) {
                    stats.num_users = users.len() as u64;
                }
            }
        }
        Ok(stats)
    }

    pub async fn get_activity(
        &self,
        since: Option<i64>,
        limit: Option<u32>,
    ) -> Result<NextcloudActivity> {
        let mut path = "apps/activity/api/v2/activity".to_string();
        let mut params = Vec::new();
        if let Some(s) = since {
            params.push(format!("since={}", s));
        }
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        let json = self.get(&path).await?;
        let data = json
            .get("ocs")
            .and_then(|o| o.get("data"))
            .cloned()
            .unwrap_or(json);
        // Wrap the activities array in the expected structure
        let wrapped = json!({ "activities": data });
        Ok(serde_json::from_value(wrapped)?)
    }

    pub async fn get_users(&self) -> Result<Vec<NextcloudUser>> {
        let json = self.get("cloud/users").await?;
        let data = json
            .get("ocs")
            .and_then(|o| o.get("data"))
            .cloned()
            .unwrap_or(json);
        let users_value = data.get("users").cloned().unwrap_or(Value::Array(vec![]));
        let usernames: Vec<String> = serde_json::from_value(users_value)?;
        let mut users = Vec::new();
        for username in usernames {
            // Try to get user details
            let mut user = NextcloudUser {
                id: username.clone(),
                display_name: username.clone(),
                enabled: true,
                quota: None,
                email: None,
                groups: Vec::new(),
                backend: "internal".to_string(),
                subadmin: Vec::new(),
                last_login: None,
            };
            // Try to fetch user details
            if let Ok(detail_json) = self.get(&format!("cloud/users/{}", username)).await {
                let detail_data = detail_json
                    .get("ocs")
                    .and_then(|o| o.get("data"))
                    .cloned()
                    .unwrap_or_default();
                if let Some(enabled) = detail_data.get("enabled").and_then(|v| v.as_bool()) {
                    user.enabled = enabled;
                }
                if let Some(email) = detail_data.get("email").and_then(|v| v.as_str()) {
                    user.email = Some(email.to_string());
                }
                if let Some(quota) = detail_data.get("quota") {
                    user.quota = serde_json::from_value(quota.clone()).ok();
                }
                if let Some(groups) = detail_data.get("groups").and_then(|v| v.as_array()) {
                    user.groups = groups
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
                if let Some(subadmin) = detail_data.get("subadmin").and_then(|v| v.as_array()) {
                    user.subadmin = subadmin
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                }
            }
            users.push(user);
        }
        Ok(users)
    }
}
