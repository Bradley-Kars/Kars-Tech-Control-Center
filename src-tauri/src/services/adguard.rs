use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardConfig {
    pub base_url: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardStatus {
    pub version: String,
    pub language: String,
    #[serde(rename = "dns_addresses")]
    pub dns_info: Vec<String>,
    pub dns_port: u16,
    pub http_port: u16,
    pub protection_disabled_duration: u64,
    pub start_time: f64,
    pub protection_enabled: bool,
    pub dhcp_available: bool,
    pub running: bool,
    #[serde(default)]
    pub config_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardStatsRaw {
    pub dns_queries: Vec<u64>,
    pub blocked_filtering: Vec<u64>,
    pub replaced_safebrowsing: Vec<u64>,
    pub replaced_parental: Vec<u64>,
    pub num_dns_queries: u64,
    pub num_blocked_filtering: u64,
    pub num_replaced_safebrowsing: u64,
    #[serde(default)]
    pub num_replaced_safesearch: u64,
    pub num_replaced_parental: u64,
    pub avg_processing_time: f64,
    #[serde(default)]
    pub top_queried_domains: Vec<Value>,
    #[serde(default)]
    pub top_clients: Vec<Value>,
    #[serde(default)]
    pub top_blocked_domains: Vec<Value>,
    #[serde(default)]
    pub top_upstreams_responses: Vec<Value>,
    #[serde(default)]
    pub top_upstreams_avg_time: Vec<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardStats {
    pub dns_queries: DnsQueries,
    pub blocked: BlockedInfo,
    pub replaced: ReplacedInfo,
    pub clients: ClientsInfo,
    pub filters: FiltersInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DnsQueries {
    pub total: u64,
    pub blocked: u64,
    pub replaced: u64,
    pub safe_browsing: u64,
    pub parental: u64,
    pub avg_processing_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockedInfo {
    pub domains: u64,
    pub clients: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplacedInfo {
    pub domains: u64,
    pub clients: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientsInfo {
    pub total: u64,
    pub active: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FiltersInfo {
    pub total: u64,
    pub enabled: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardQueryLog {
    pub data: Vec<AdGuardQueryLogEntry>,
    #[serde(default)]
    pub limit: u32,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub total: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardQueryLogEntry {
    #[serde(
        rename = "filterId",
        deserialize_with = "deserialize_filter_id",
        default
    )]
    pub filter_id: Option<u64>,
    #[serde(rename = "elapsedMs")]
    pub elapsed_ms: Option<String>,
    #[serde(default)]
    pub cached: Option<bool>,
    pub client: Option<String>,
    pub client_info: Option<Value>,
    pub client_proto: Option<String>,
    pub reason: Option<String>,
    pub rule: Option<String>,
    pub rules: Option<Value>,
    pub status: Option<String>,
    pub time: Option<String>,
    pub upstream: Option<String>,
    #[serde(default)]
    pub question: Option<AdGuardQuestion>,
    #[serde(default)]
    pub answer: Option<Vec<AdGuardAnswer>>,
}

fn deserialize_filter_id<'de, D>(deserializer: D) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value: Option<i64> = Option::deserialize(deserializer)?;
    match value {
        Some(v) if v < 0 => Ok(None),
        Some(v) => Ok(Some(v as u64)),
        None => Ok(None),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardQuestion {
    pub r#type: String,
    pub name: String,
    pub class: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardAnswer {
    pub r#type: String,
    pub value: String,
    pub ttl: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardClientResponse {
    pub clients: Vec<AdGuardClientItem>,
    pub auto_clients: Vec<AdGuardAutoClient>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardClientItem {
    pub name: String,
    pub ids: Vec<String>,
    #[serde(default)]
    pub safe_search: SafeSearchConfig,
    #[serde(default)]
    pub blocked_services: Vec<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub upstreams: Vec<String>,
    #[serde(default)]
    pub filtering_enabled: bool,
    #[serde(default)]
    pub parental_enabled: bool,
    #[serde(default)]
    pub safebrowsing_enabled: bool,
    #[serde(default)]
    pub safesearch_enabled: bool,
    #[serde(default)]
    pub use_global_blocked_services: bool,
    #[serde(default)]
    pub use_global_settings: bool,
    #[serde(default)]
    pub ignore_querylog: bool,
    #[serde(default)]
    pub ignore_statistics: bool,
    #[serde(default)]
    pub upstreams_cache_size: u64,
    #[serde(default)]
    pub upstreams_cache_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SafeSearchConfig {
    pub enabled: bool,
    #[serde(default)]
    pub bing: bool,
    #[serde(default)]
    pub duckduckgo: bool,
    #[serde(default)]
    pub ecosia: bool,
    #[serde(default)]
    pub google: bool,
    #[serde(default)]
    pub pixabay: bool,
    #[serde(default)]
    pub yandex: bool,
    #[serde(default)]
    pub youtube: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardAutoClient {
    #[serde(default)]
    pub whois_info: Value,
    pub ip: String,
    pub name: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardClient {
    pub ids: Vec<String>,
    pub names: Vec<String>,
    pub use_global_settings: Vec<bool>,
    pub use_global_blocked_services: Vec<bool>,
    pub upstreams: Vec<Vec<String>>,
    pub blocked_services: Vec<Vec<String>>,
    pub parental_sensitivity: Vec<u32>,
    pub safe_search: Vec<bool>,
    pub safe_browsing: Vec<bool>,
    pub use_global_safe_search: Vec<bool>,
    pub use_global_safe_browsing: Vec<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardFilter {
    #[serde(default)]
    pub id: Option<u64>,
    #[serde(rename = "filter_list_id")]
    pub filter_list_id: Option<u64>,
    pub name: String,
    pub url: String,
    pub enabled: bool,
    pub rules_count: u64,
    #[serde(default)]
    pub last_updated: Option<String>,
    #[serde(default)]
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardDHCP {
    pub enabled: bool,
    pub leases: Vec<AdGuardDHCPLease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdGuardDHCPLease {
    pub ip: String,
    pub mac: String,
    pub hostname: String,
    pub expires: i64,
    pub id: String,
}

pub struct AdGuardClientWrapper {
    client: Client,
    config: AdGuardConfig,
}

impl AdGuardClientWrapper {
    pub fn new(config: AdGuardConfig) -> Result<Self> {
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self { client, config })
    }

    async fn get(&self, path: &str) -> Result<Value> {
        let url = format!(
            "{}/control/{}",
            self.config.base_url.trim_end_matches('/'),
            path
        );
        let resp = self
            .client
            .get(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Accept", "application/json")
            .send()
            .await
            .context("Send AdGuard request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!("AdGuard error {}: {}", status, &text[..text.len().min(500)]);
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    async fn post(&self, path: &str, body: Value) -> Result<Value> {
        let url = format!(
            "{}/control/{}",
            self.config.base_url.trim_end_matches('/'),
            path
        );
        let resp = self
            .client
            .post(&url)
            .basic_auth(&self.config.username, Some(&self.config.password))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .context("Send AdGuard request")?;

        let status = resp.status();
        let text = resp.text().await.context("Read response")?;

        if !status.is_success() {
            anyhow::bail!("AdGuard error {}: {}", status, &text[..text.len().min(500)]);
        }

        let json: Value = serde_json::from_str(&text)
            .with_context(|| format!("Parse JSON: {}", &text[..text.len().min(500)]))?;

        Ok(json)
    }

    pub async fn get_status(&self) -> Result<AdGuardStatus> {
        let json = self.get("status").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_stats(&self) -> Result<AdGuardStats> {
        let json = self.get("stats").await?;
        let raw: AdGuardStatsRaw = serde_json::from_value(json)?;

        let dns_queries = DnsQueries {
            total: raw.num_dns_queries,
            blocked: raw.num_blocked_filtering,
            replaced: raw.num_replaced_safebrowsing
                + raw.num_replaced_safesearch
                + raw.num_replaced_parental,
            safe_browsing: raw.num_replaced_safebrowsing,
            parental: raw.num_replaced_parental,
            avg_processing_time: raw.avg_processing_time,
        };

        // Get clients info from /clients endpoint
        let (clients_total, clients_active) = match self.get_clients().await {
            Ok(clients) => {
                let total = clients.clients.len() as u64;
                let active = clients
                    .clients
                    .iter()
                    .filter(|c| c.filtering_enabled)
                    .count() as u64;
                (total, active)
            }
            Err(_) => (0, 0),
        };

        // Get filters info from /filters endpoint
        let (filters_total, filters_enabled) = match self.get_filters().await {
            Ok(filters) => (
                filters.len() as u64,
                filters.iter().filter(|f| f.enabled).count() as u64,
            ),
            Err(_) => (0, 0),
        };

        let clients = ClientsInfo {
            total: clients_total,
            active: clients_active,
        };

        let filters = FiltersInfo {
            total: filters_total,
            enabled: filters_enabled,
        };

        let blocked = BlockedInfo {
            domains: raw.num_blocked_filtering,
            clients: 0,
        };

        let replaced = ReplacedInfo {
            domains: raw.num_replaced_safebrowsing
                + raw.num_replaced_safesearch
                + raw.num_replaced_parental,
            clients: 0,
        };

        Ok(AdGuardStats {
            dns_queries,
            blocked,
            replaced,
            clients,
            filters,
        })
    }

    pub async fn get_query_log(
        &self,
        limit: u32,
        offset: u32,
        filter: Option<String>,
    ) -> Result<AdGuardQueryLog> {
        let mut path = format!("querylog?limit={}&offset={}", limit, offset);
        if let Some(f) = filter {
            path.push_str(&format!("&filter={}", f));
        }
        let json = self.get(&path).await?;
        let data = json.get("data").cloned().unwrap_or(json!([]));
        let log_limit = json
            .get("limit")
            .and_then(|v| v.as_u64())
            .unwrap_or(limit as u64) as u32;
        let log_offset = json
            .get("offset")
            .and_then(|v| v.as_u64())
            .unwrap_or(offset as u64) as u32;
        let log_total = json.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        let wrapped =
            json!({ "data": data, "limit": log_limit, "offset": log_offset, "total": log_total });
        Ok(serde_json::from_value(wrapped)?)
    }

    pub async fn get_clients(&self) -> Result<AdGuardClientResponse> {
        let json = self.get("clients").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn get_filters(&self) -> Result<Vec<AdGuardFilter>> {
        let json = self.get("filtering/status").await?;
        let data = json.get("filters").cloned().unwrap_or(json);
        Ok(serde_json::from_value(data)?)
    }

    pub async fn get_dhcp(&self) -> Result<AdGuardDHCP> {
        let json = self.get("dhcp/status").await?;
        Ok(serde_json::from_value(json)?)
    }

    pub async fn enable_protection(&self) -> Result<()> {
        self.post("dns/enable", serde_json::json!({})).await?;
        Ok(())
    }

    pub async fn disable_protection(&self) -> Result<()> {
        self.post("dns/disable", serde_json::json!({})).await?;
        Ok(())
    }

    pub async fn add_client(&self, name: &str, ids: Vec<String>) -> Result<()> {
        self.post(
            "clients/add",
            serde_json::json!({
                "name": name,
                "ids": ids
            }),
        )
        .await?;
        Ok(())
    }

    pub async fn delete_client(&self, id: &str) -> Result<()> {
        self.post("clients/delete", serde_json::json!({"id": id}))
            .await?;
        Ok(())
    }
}
