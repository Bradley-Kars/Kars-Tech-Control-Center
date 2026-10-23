use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LidarrConfig {
    pub base_url: String,
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrSystemStatus {
    pub app_name: String,
    pub instance_name: String,
    pub version: String,
    #[serde(default)]
    pub build_time: Option<String>,
    pub is_debug: bool,
    pub is_production: bool,
    pub is_admin: bool,
    pub startup_path: String,
    pub app_data: String,
    pub os_name: String,
    pub os_version: String,
    pub is_linux: bool,
    pub is_osx: bool,
    pub is_windows: bool,
    pub branch: String,
    pub authentication: String,
    pub url_base: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrHealthIssue {
    #[serde(default)]
    pub source: Option<String>,
    #[serde(rename = "type")]
    pub issue_type: String,
    pub message: String,
    #[serde(default)]
    pub wiki_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrArtist {
    pub id: u32,
    pub foreign_artist_id: String,
    pub artist_name: String,
    pub monitored: bool,
    #[serde(default)]
    pub metadata_profile_id: u32,
    #[serde(default)]
    pub quality_profile_id: u32,
    #[serde(default)]
    pub root_folder_path: String,
    #[serde(default)]
    pub add_options: Option<LidarrAddOptions>,
    #[serde(default)]
    pub tags: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrAddOptions {
    #[serde(default)]
    pub search_for_new_album: bool,
    #[serde(default)]
    pub search_for_missing_album: bool,
    #[serde(default)]
    pub search_for_cutoff_unmet_album: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrAlbum {
    pub id: u32,
    #[serde(default)]
    pub foreign_album_id: String,
    pub artist_id: u32,
    pub title: String,
    #[serde(default)]
    pub album_type: String,
    #[serde(default)]
    pub status: String,
    pub monitored: bool,
    #[serde(default)]
    pub release_date: String,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub statistics: Option<LidarrAlbumStatistics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrAlbumStatistics {
    #[serde(default)]
    pub track_count: u32,
    #[serde(default)]
    pub track_file_count: u32,
    #[serde(default)]
    pub size_on_disk: u64,
    #[serde(default)]
    pub percent_of_tracks: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrWantedMissing {
    pub page: u32,
    pub page_size: u32,
    pub sort_key: String,
    pub sort_direction: String,
    pub total_records: u32,
    pub records: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrQueue {
    pub page: u32,
    pub page_size: u32,
    pub sort_key: String,
    pub sort_direction: String,
    pub total_records: u32,
    pub records: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrDiskSpace {
    pub path: String,
    #[serde(default)]
    pub label: String,
    pub free_space: u64,
    pub total_space: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LidarrIndexer {
    pub id: u32,
    pub name: String,
    pub implementation: String,
    pub implementation_name: String,
    pub config_contract: String,
    pub info_link: String,
    #[serde(default)]
    pub message: Option<String>,
    pub priority: u32,
    pub protocol: String,
    #[serde(default)]
    pub fields: Vec<Value>,
    #[serde(default)]
    pub tags: Vec<u32>,
}

pub struct LidarrClient {
    client: Client,
    config: LidarrConfig,
}

impl LidarrClient {
    pub fn new(config: LidarrConfig) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self { client, config })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!(
            "{}/api/v1/{}",
            self.config.base_url.trim_end_matches('/'),
            path
        );
        let resp = self
            .client
            .get(&url)
            .header("X-Api-Key", &self.config.api_key)
            .header("Accept", "application/json")
            .send()
            .await
            .context("Send Lidarr request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!("Lidarr error {}: {}", status, &text[..text.len().min(500)]);
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    pub async fn get_system_status(&self) -> Result<LidarrSystemStatus> {
        let json = self.get("system/status").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_health(&self) -> Result<Vec<LidarrHealthIssue>> {
        let json = self.get("health").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_artists(&self) -> Result<Vec<LidarrArtist>> {
        let json = self.get("artist").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_albums(
        &self,
        artist_id: Option<u32>,
        monitored: Option<bool>,
    ) -> Result<Vec<LidarrAlbum>> {
        let mut path = "album".to_string();
        let mut params = Vec::new();
        if let Some(id) = artist_id {
            params.push(format!("artistId={}", id));
        }
        if let Some(m) = monitored {
            params.push(format!("monitored={}", m));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        let json = self.get(&path).await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_wanted_missing(
        &self,
        page: u32,
        page_size: u32,
    ) -> Result<LidarrWantedMissing> {
        let json = self
            .get(&format!(
                "wanted/missing?page={}&pageSize={}",
                page, page_size
            ))
            .await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_queue(&self, page: u32, page_size: u32) -> Result<LidarrQueue> {
        let json = self
            .get(&format!("queue?page={}&pageSize={}", page, page_size))
            .await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_disk_space(&self) -> Result<Vec<LidarrDiskSpace>> {
        let json = self.get("diskspace").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_indexers(&self) -> Result<Vec<LidarrIndexer>> {
        let json = self.get("indexer").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn refresh_series(&self, artist_id: u32) -> Result<()> {
        let url = format!(
            "{}/api/v1/command",
            self.config.base_url.trim_end_matches('/')
        );
        let body = serde_json::json!({
            "name": "RefreshArtist",
            "artistId": artist_id
        });
        self.client
            .post(&url)
            .header("X-Api-Key", &self.config.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Send Lidarr refresh command")?
            .error_for_status()
            .context("Lidarr refresh command failed (non-2xx status)")?;
        Ok(())
    }

    pub async fn search_missing(&self, artist_id: u32) -> Result<()> {
        let url = format!(
            "{}/api/v1/command",
            self.config.base_url.trim_end_matches('/')
        );
        let body = serde_json::json!({
            "name": "MissingAlbumSearch",
            "artistId": artist_id
        });
        self.client
            .post(&url)
            .header("X-Api-Key", &self.config.api_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Send Lidarr search command")?
            .error_for_status()
            .context("Lidarr search command failed (non-2xx status)")?;
        Ok(())
    }
}
