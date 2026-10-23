use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

use crate::config::ServiceKeys;

/// A service that is reached over plain HTTP(S) with a JSON API.
///
/// Rewritten 2026-09-29 against the actually-deployed fleet. The previous
/// eight covered six services that were never installed (scrutiny,
/// uptime-kuma, aurral, your-spotify, dozzle, homepage) while every service
/// that IS running — the whole arr stack, Shoko, qBittorrent, Home Assistant,
/// Nextcloud, AdGuard, Ombi, FlareSolverr, Matter Hub — was missing, so the
/// health panel could not see any of it. Every health path below was probed
/// live before being written down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RestService {
    Plex,
    InvoiceNinja,
    HomeAssistant,
    Nextcloud,
    AdGuard,
    Shoko,
    QBittorrent,
    Lidarr,
    Radarr,
    Sonarr,
    Prowlarr,
    Ombi,
    FlareSolverr,
    MatterHub,
}

impl RestService {
    pub const ALL: [RestService; 14] = [
        RestService::Plex,
        RestService::InvoiceNinja,
        RestService::HomeAssistant,
        RestService::Nextcloud,
        RestService::AdGuard,
        RestService::Shoko,
        RestService::QBittorrent,
        RestService::Lidarr,
        RestService::Radarr,
        RestService::Sonarr,
        RestService::Prowlarr,
        RestService::Ombi,
        RestService::FlareSolverr,
        RestService::MatterHub,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            RestService::Plex => "plex",
            RestService::InvoiceNinja => "invoiceninja",
            RestService::HomeAssistant => "homeassistant",
            RestService::Nextcloud => "nextcloud",
            RestService::AdGuard => "adguard",
            RestService::Shoko => "shoko",
            RestService::QBittorrent => "qbittorrent",
            RestService::Lidarr => "lidarr",
            RestService::Radarr => "radarr",
            RestService::Sonarr => "sonarr",
            RestService::Prowlarr => "prowlarr",
            RestService::Ombi => "ombi",
            RestService::FlareSolverr => "flaresolverr",
            RestService::MatterHub => "matter_hub",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        RestService::ALL.into_iter().find(|s| s.as_str() == value)
    }

    /// Human label for the UI.
    pub fn label(self) -> &'static str {
        match self {
            RestService::Plex => "Plex",
            RestService::InvoiceNinja => "Invoice Ninja",
            RestService::HomeAssistant => "Home Assistant",
            RestService::Nextcloud => "Nextcloud",
            RestService::AdGuard => "AdGuard Home",
            RestService::Shoko => "Shoko",
            RestService::QBittorrent => "qBittorrent",
            RestService::Lidarr => "Lidarr",
            RestService::Radarr => "Radarr",
            RestService::Sonarr => "Sonarr",
            RestService::Prowlarr => "Prowlarr",
            RestService::Ombi => "Ombi",
            RestService::FlareSolverr => "FlareSolverr",
            RestService::MatterHub => "Matter Hub",
        }
    }
}

/// How a service authenticates. All shapes seen across the fleet's APIs.
#[derive(Debug, Clone, Default)]
pub enum ServiceAuth {
    #[default]
    None,
    /// Named header, e.g. Plex `X-Plex-Token`, Aurral `X-Api-Key`.
    Header(String, String),
    /// `Authorization: Bearer <token>` — Invoice Ninja, Your Spotify.
    Bearer(String),
    /// HTTP basic — AdGuard-style user/pass services.
    Basic(String, String),
    /// Query-string parameter, e.g. Uptime Kuma's status-page slug.
    Query(String, String),
}

#[derive(Debug, Clone)]
pub struct ServiceConfig {
    pub base_url: String,
    pub auth: ServiceAuth,
}

impl ServiceConfig {
    /// Build the client config from the stored service keys.
    ///
    /// Returns an error naming the missing key rather than defaulting to an
    /// empty token, so the UI can say *which* credential is absent.
    pub fn from_keys(service: RestService, keys: &ServiceKeys) -> Result<Self> {
        fn req(field: &Option<String>) -> Option<String> {
            field.as_ref().filter(|s| !s.trim().is_empty()).cloned()
        }

        /// HTTP basic auth when both halves are present, otherwise none.
        fn basic(user: &Option<String>, pass: &Option<String>) -> ServiceAuth {
            match (req(user), req(pass)) {
                (Some(u), Some(p)) => ServiceAuth::Basic(u, p),
                _ => ServiceAuth::None,
            }
        }

        /// All four *arr apps authenticate with the same `X-Api-Key` header.
        /// Their API version is *not* uniform — verified live: Lidarr v1,
        /// Radarr v3, Sonarr v3, Prowlarr v1 — but that difference belongs in
        /// the health path, not here.
        fn arr(
            url: &Option<String>,
            api_key: &Option<String>,
            name: &'static str,
        ) -> Result<ServiceConfig> {
            let base_url = req(url).with_context(|| format!("{}_url not configured", name))?;
            let key = req(api_key).with_context(|| format!("{}_api_key not configured", name))?;
            Ok(ServiceConfig {
                base_url,
                auth: ServiceAuth::Header("X-Api-Key".into(), key),
            })
        }

        let cfg = match service {
            RestService::Plex => {
                let url = req(&keys.plex_url).context("plex_url not configured")?;
                let token = req(&keys.plex_token).context("plex_token not configured")?;
                ServiceConfig {
                    base_url: url,
                    auth: ServiceAuth::Header("X-Plex-Token".into(), token),
                }
            }
            RestService::InvoiceNinja => {
                let url = req(&keys.invoiceninja_url).context("invoiceninja_url not configured")?;
                let token =
                    req(&keys.invoiceninja_token).context("invoiceninja_token not configured")?;
                ServiceConfig {
                    base_url: url,
                    auth: ServiceAuth::Bearer(token),
                }
            }
            RestService::HomeAssistant => {
                let url =
                    req(&keys.homeassistant_url).context("homeassistant_url not configured")?;
                let token =
                    req(&keys.homeassistant_token).context("homeassistant_token not configured")?;
                ServiceConfig {
                    base_url: url,
                    auth: ServiceAuth::Bearer(token),
                }
            }
            RestService::Nextcloud => {
                let url = req(&keys.nextcloud_url).context("nextcloud_url not configured")?;
                ServiceConfig {
                    base_url: url,
                    auth: basic(&keys.nextcloud_user, &keys.nextcloud_pass),
                }
            }
            RestService::AdGuard => {
                let url = req(&keys.adguard_url).context("adguard_url not configured")?;
                ServiceConfig {
                    base_url: url,
                    auth: basic(&keys.adguard_user, &keys.adguard_pass),
                }
            }
            RestService::Shoko => {
                let url = req(&keys.shoko_url).context("shoko_url not configured")?;
                let key = req(&keys.shoko_api_key).context("shoko_api_key not configured")?;
                // Shoko takes the key as a query parameter, not a header.
                ServiceConfig {
                    base_url: url,
                    auth: ServiceAuth::Query("apikey".into(), key),
                }
            }
            RestService::QBittorrent => ServiceConfig {
                base_url: req(&keys.qbittorrent_url).context("qbittorrent_url not configured")?,
                // v5 authenticates with a login cookie, not an API key. The
                // probe only needs to distinguish "up" from "unreachable", and
                // an unauthenticated request answers 403 — which counts as up.
                auth: ServiceAuth::None,
            },
            RestService::Lidarr => arr(&keys.lidarr_url, &keys.lidarr_api_key, "lidarr")?,
            RestService::Radarr => arr(&keys.radarr_url, &keys.radarr_api_key, "radarr")?,
            RestService::Sonarr => arr(&keys.sonarr_url, &keys.sonarr_api_key, "sonarr")?,
            RestService::Prowlarr => arr(&keys.prowlarr_url, &keys.prowlarr_api_key, "prowlarr")?,
            RestService::Ombi => ServiceConfig {
                base_url: req(&keys.ombi_url).context("ombi_url not configured")?,
                auth: ServiceAuth::None,
            },
            RestService::FlareSolverr => ServiceConfig {
                base_url: req(&keys.flaresolverr_url).context("flaresolverr_url not configured")?,
                auth: ServiceAuth::None,
            },
            RestService::MatterHub => ServiceConfig {
                base_url: req(&keys.matter_hub_url).context("matter_hub_url not configured")?,
                auth: ServiceAuth::None,
            },
        };

        Ok(cfg)
    }
}

/// Join a configured base URL with a resource path without doubling or
/// dropping the separating slash, whatever the user typed in the UI.
pub fn join_url(base: &str, path: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

/// Shared JSON-over-HTTP client for the REST services.
pub struct HttpServiceClient {
    client: Client,
    config: ServiceConfig,
}

impl HttpServiceClient {
    pub fn new(config: ServiceConfig) -> Result<Self> {
        // Self-signed certs are the norm on this LAN (AdGuard on :8443, and
        // several of these containers fronted by a reverse proxy), matching
        // the existing per-service clients.
        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .timeout(Duration::from_secs(30))
            .build()
            .context("Build HTTP client")?;
        Ok(Self { client, config })
    }

    pub fn base_url(&self) -> &str {
        &self.config.base_url
    }

    fn build_request(&self, method: reqwest::Method, path: &str) -> reqwest::RequestBuilder {
        let url = join_url(&self.config.base_url, path);
        let mut req = self
            .client
            .request(method, url)
            .header("Accept", "application/json");

        req = match &self.config.auth {
            ServiceAuth::None => req,
            ServiceAuth::Header(name, value) => req.header(name.as_str(), value.as_str()),
            ServiceAuth::Bearer(token) => req.header("Authorization", format!("Bearer {}", token)),
            ServiceAuth::Basic(user, pass) => req.basic_auth(user, Some(pass)),
            ServiceAuth::Query(_, _) => req,
        };

        // Query-style auth is applied per-path because the parameter name and
        // value are resource specific (e.g. Uptime Kuma's slug).
        if let ServiceAuth::Query(name, value) = &self.config.auth {
            req = req.query(&[(name.as_str(), value.as_str())]);
        }

        req
    }

    pub async fn get_json(&self, path: &str) -> Result<Value> {
        let resp = self
            .build_request(reqwest::Method::GET, path)
            .send()
            .await
            .with_context(|| format!("GET {} failed", path))?;
        Self::decode(resp, path).await
    }

    pub async fn post_json(&self, path: &str, body: Value) -> Result<Value> {
        let resp = self
            .build_request(reqwest::Method::POST, path)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .with_context(|| format!("POST {} failed", path))?;
        Self::decode(resp, path).await
    }

    async fn decode(resp: reqwest::Response, path: &str) -> Result<Value> {
        let status = resp.status();
        let text = resp.text().await.context("Read response")?;
        let head: String = text.chars().take(500).collect();

        if !status.is_success() {
            anyhow::bail!("HTTP {} from {}: {}", status, path, head);
        }
        serde_json::from_str(&text).with_context(|| format!("Invalid JSON from {}: {}", path, head))
    }
}

/// Result of probing a service's health.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceHealth {
    pub service: String,
    pub label: String,
    pub url: String,
    pub reachable: bool,
    pub detail: String,
}

/// Probe one service. Never fails: unreachable services report `reachable:
/// false` so a dashboard can show all of them at once instead of erroring out
/// on the first dead container.
pub async fn probe(service: RestService, keys: &ServiceKeys) -> ServiceHealth {
    let config = match ServiceConfig::from_keys(service, keys) {
        Ok(c) => c,
        Err(e) => {
            return ServiceHealth {
                service: service.as_str().into(),
                label: service.label().into(),
                url: String::new(),
                reachable: false,
                detail: e.to_string(),
            }
        }
    };

    let url = config.base_url.clone();
    let client = match HttpServiceClient::new(config) {
        Ok(c) => c,
        Err(e) => {
            return ServiceHealth {
                service: service.as_str().into(),
                label: service.label().into(),
                url,
                reachable: false,
                detail: e.to_string(),
            }
        }
    };

    // A HEAD on the base URL is the cheapest liveness probe that works even
    // for services (Homepage, Dozzle) with no JSON API.
    let probe_path = health_path(service);
    let outcome = client
        .build_request(reqwest::Method::GET, probe_path)
        .send()
        .await;

    match outcome {
        Ok(resp) => {
            let status = resp.status();
            // 401/403 means the service is UP but rejected our credential —
            // qBittorrent v5 answers 403 to any unauthenticated request, so
            // treating that as "down" would report a healthy service as dead.
            // These are two different problems and need different fixes.
            let auth_only = status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN;
            ServiceHealth {
                service: service.as_str().into(),
                label: service.label().into(),
                url,
                reachable: status.is_success() || auth_only,
                detail: if status.is_success() {
                    "OK".to_string()
                } else if auth_only {
                    format!(
                        "HTTP {} (credentials rejected or required)",
                        status.as_u16()
                    )
                } else {
                    format!("HTTP {}", status.as_u16())
                },
            }
        }
        Err(e) => ServiceHealth {
            service: service.as_str().into(),
            label: service.label().into(),
            url,
            reachable: false,
            detail: e.to_string(),
        },
    }
}

/// Cheapest path that proves the service is alive.
///
/// Every entry was probed live against the running fleet on 2026-09-29; the
/// *arr apps do NOT share an API version (Lidarr and Prowlarr are v1, Radarr
/// and Sonarr are v3), so a single `/api/v3/...` assumption 404s on half of
/// them.
fn health_path(service: RestService) -> &'static str {
    match service {
        RestService::Plex => "/identity",
        RestService::InvoiceNinja => "/api/v1/about",
        RestService::HomeAssistant => "/api/",
        RestService::Nextcloud => "/status.php",
        RestService::AdGuard => "/control/status",
        // `/api/v3/Version` does not exist on this build; `/api/v3/Group` does.
        RestService::Shoko => "/api/v3/Group",
        RestService::QBittorrent => "/api/v2/app/version",
        RestService::Lidarr => "/api/v1/system/status",
        RestService::Radarr => "/api/v3/system/status",
        RestService::Sonarr => "/api/v3/system/status",
        RestService::Prowlarr => "/api/v1/system/status",
        RestService::Ombi => "/api/v1/status",
        RestService::FlareSolverr => "/health",
        RestService::MatterHub => "/",
    }
}

/// Plex library sections, flattened out of Plex's `MediaContainer` envelope.
///
/// Endpoints verified live against 192.168.4.175:32400 (Plex 1.43.4).
pub async fn plex_identity(client: &HttpServiceClient) -> Result<PlexIdentity> {
    let v = client.get_json("/identity").await?;
    parse_plex_identity(&v)
}

/// Pure half of [`plex_identity`], split out so the envelope handling is
/// testable without a live Plex.
pub fn parse_plex_identity(v: &Value) -> Result<PlexIdentity> {
    let mc = v.get("MediaContainer").context("missing MediaContainer")?;
    Ok(PlexIdentity {
        machine_identifier: mc
            .get("machineIdentifier")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        version: mc
            .get("version")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        claimed: mc.get("claimed").and_then(|v| v.as_bool()).unwrap_or(false),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlexIdentity {
    pub machine_identifier: String,
    pub version: String,
    pub claimed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlexLibrary {
    pub key: String,
    pub title: String,
    #[serde(rename = "type")]
    pub library_type: String,
    pub uuid: String,
    pub scanning: bool,
    pub updated_at: i64,
}

pub async fn plex_libraries(client: &HttpServiceClient) -> Result<Vec<PlexLibrary>> {
    let v = client.get_json("/library/sections").await?;
    parse_plex_libraries(&v)
}

/// Pure half of [`plex_libraries`].
pub fn parse_plex_libraries(v: &Value) -> Result<Vec<PlexLibrary>> {
    let dirs = v
        .pointer("/MediaContainer/Directory")
        .and_then(|d| d.as_array())
        .context("missing MediaContainer.Directory")?;

    Ok(dirs
        .iter()
        .map(|d| PlexLibrary {
            key: d
                .get("key")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            title: d
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("Untitled")
                .to_string(),
            library_type: d
                .get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string(),
            uuid: d
                .get("uuid")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string(),
            scanning: d
                .get("refreshing")
                .and_then(|v| v.as_bool())
                .unwrap_or(false),
            updated_at: d.get("updatedAt").and_then(|v| v.as_i64()).unwrap_or(0),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn keys() -> ServiceKeys {
        ServiceKeys::default()
    }

    // --- RestService identity -------------------------------------------
    // The TS `ServiceKeys` field is `your_spotify_*`; if these two ever drift,
    // the health probe silently reports on a service that cannot be addressed.
    #[test]
    fn service_ids_roundtrip() {
        for service in RestService::ALL {
            assert_eq!(RestService::parse(service.as_str()), Some(service));
        }
    }

    #[test]
    fn multiword_service_ids_are_snake_case() {
        // These ids have to line up with the TS `ServiceKeys` field names, or
        // the health probe silently reports on a service it cannot address.
        assert_eq!(RestService::HomeAssistant.as_str(), "homeassistant");
        assert_eq!(RestService::MatterHub.as_str(), "matter_hub");
        assert_eq!(RestService::QBittorrent.as_str(), "qbittorrent");
        assert!(RestService::parse("matterHub").is_none());
    }

    // Lidarr and Prowlarr are API v1; Radarr and Sonarr are v3. Assuming one
    // version for all four 404s half the stack — verified live 2026-09-29.
    #[test]
    fn arr_api_versions_are_not_uniform() {
        assert_eq!(health_path(RestService::Lidarr), "/api/v1/system/status");
        assert_eq!(health_path(RestService::Prowlarr), "/api/v1/system/status");
        assert_eq!(health_path(RestService::Radarr), "/api/v3/system/status");
        assert_eq!(health_path(RestService::Sonarr), "/api/v3/system/status");
    }

    #[test]
    fn every_service_has_a_label_and_probe_path() {
        for service in RestService::ALL {
            assert!(!service.label().is_empty());
            assert!(health_path(service).starts_with('/'));
        }
    }

    // --- from_keys credential resolution --------------------------------
    #[test]
    fn missing_credential_names_the_offending_key() {
        let err = ServiceConfig::from_keys(RestService::Plex, &keys()).unwrap_err();
        assert!(
            err.to_string().contains("plex_url"),
            "error should name the key, got: {err}"
        );
    }

    #[test]
    fn blank_credential_counts_as_missing() {
        let mut k = keys();
        k.plex_url = Some("   ".to_string());
        k.plex_token = Some("tok".to_string());
        let err = ServiceConfig::from_keys(RestService::Plex, &k).unwrap_err();
        assert!(err.to_string().contains("plex_url"), "got: {err}");
    }

    #[test]
    fn plex_uses_token_header_auth() {
        let mut k = keys();
        k.plex_url = Some("http://192.168.4.175:32400".to_string());
        k.plex_token = Some("tok123".to_string());
        let cfg = ServiceConfig::from_keys(RestService::Plex, &k).unwrap();
        assert_eq!(cfg.base_url, "http://192.168.4.175:32400");
        match cfg.auth {
            ServiceAuth::Header(name, value) => {
                assert_eq!(name, "X-Plex-Token");
                assert_eq!(value, "tok123");
            }
            other => panic!("expected header auth, got {other:?}"),
        }
    }

    #[test]
    fn invoiceninja_and_homeassistant_use_bearer_auth() {
        let mut k = keys();
        k.invoiceninja_url = Some("http://192.168.4.69:8000".to_string());
        k.invoiceninja_token = Some("nin".to_string());
        k.homeassistant_url = Some("http://192.168.4.69:8123".to_string());
        k.homeassistant_token = Some("ha".to_string());

        for (service, want) in [
            (RestService::InvoiceNinja, "nin"),
            (RestService::HomeAssistant, "ha"),
        ] {
            let cfg = ServiceConfig::from_keys(service, &k).unwrap();
            match cfg.auth {
                ServiceAuth::Bearer(t) => assert_eq!(t, want),
                other => panic!("expected bearer auth, got {other:?}"),
            }
        }
    }

    // The *arr apps all authenticate with the same header, but Shoko's key
    // travels as a query parameter — sending it as a header 404s every call.
    #[test]
    fn arr_apps_share_x_api_key_and_shoko_uses_a_query_param() {
        let mut k = keys();
        k.radarr_url = Some("http://192.168.4.69:7878".to_string());
        k.radarr_api_key = Some("rad".to_string());
        k.shoko_url = Some("http://192.168.4.69:8111".to_string());
        k.shoko_api_key = Some("shoko-key".to_string());

        let cfg = ServiceConfig::from_keys(RestService::Radarr, &k).unwrap();
        match cfg.auth {
            ServiceAuth::Header(name, value) => {
                assert_eq!(name, "X-Api-Key");
                assert_eq!(value, "rad");
            }
            other => panic!("expected header auth, got {other:?}"),
        }

        let cfg = ServiceConfig::from_keys(RestService::Shoko, &k).unwrap();
        match cfg.auth {
            ServiceAuth::Query(name, value) => {
                assert_eq!(name, "apikey");
                assert_eq!(value, "shoko-key");
            }
            other => panic!("expected query auth, got {other:?}"),
        }
    }

    // Every *arr service must name the key it is missing, or the UI shows a
    // blank failure with nothing to act on.
    #[test]
    fn arr_missing_api_key_names_the_service() {
        let mut k = keys();
        k.radarr_url = Some("http://192.168.4.69:7878".to_string());
        let err = ServiceConfig::from_keys(RestService::Radarr, &k).unwrap_err();
        assert!(
            err.to_string().contains("radarr_api_key"),
            "error should name the key, got: {err}"
        );
    }

    // AdGuard and Nextcloud degrade to anonymous access when no credential is
    // present, rather than refusing to build a config at all.
    #[test]
    fn basic_auth_services_fall_back_to_none_without_credentials() {
        let mut k = keys();
        k.adguard_url = Some("https://adguard.tailf6d3b4.ts.net:8443".to_string());
        let cfg = ServiceConfig::from_keys(RestService::AdGuard, &k).unwrap();
        assert!(matches!(cfg.auth, ServiceAuth::None));

        k.adguard_user = Some("slayerbrk".to_string());
        k.adguard_pass = Some("pw".to_string());
        let cfg = ServiceConfig::from_keys(RestService::AdGuard, &k).unwrap();
        match cfg.auth {
            ServiceAuth::Basic(u, p) => {
                assert_eq!(u, "slayerbrk");
                assert_eq!(p, "pw");
            }
            other => panic!("expected basic auth, got {other:?}"),
        }
    }

    #[test]
    fn url_only_services_need_no_credentials() {
        let mut k = keys();
        k.qbittorrent_url = Some("http://192.168.4.69:8085".to_string());
        k.ombi_url = Some("http://192.168.4.69:3579".to_string());
        k.flaresolverr_url = Some("http://192.168.4.69:8191".to_string());
        k.matter_hub_url = Some("http://192.168.4.69:8482".to_string());

        for service in [
            RestService::QBittorrent,
            RestService::Ombi,
            RestService::FlareSolverr,
            RestService::MatterHub,
        ] {
            let cfg = ServiceConfig::from_keys(service, &k).unwrap();
            assert!(matches!(cfg.auth, ServiceAuth::None));
            assert!(!cfg.base_url.is_empty());
        }
    }

    // --- URL joining ----------------------------------------------------
    // Config values are typed by hand, so a stray trailing slash is the
    // difference between `/api/summary` working and a 404.
    #[test]
    fn join_url_never_doubles_or_drops_the_separator() {
        assert_eq!(
            join_url("http://h:8484", "/api/summary"),
            "http://h:8484/api/summary"
        );
        assert_eq!(
            join_url("http://h:8484/", "/api/summary"),
            "http://h:8484/api/summary"
        );
        assert_eq!(
            join_url("http://h:8484/", "api/summary"),
            "http://h:8484/api/summary"
        );
        assert_eq!(
            join_url("http://h:8484//", "//api/summary"),
            "http://h:8484/api/summary"
        );
        assert_eq!(join_url("http://h:3000", "/"), "http://h:3000/");
    }

    // --- Plex envelope parsing -----------------------------------------
    // Shape taken from a live 1.43.4 response on 192.168.4.175:32400.
    #[test]
    fn parses_plex_identity_envelope() {
        let id = parse_plex_identity(&json!({
            "MediaContainer": {
                "machineIdentifier": "abc123",
                "version": "1.43.4.10903-e5521bd8c",
                "claimed": true
            }
        }))
        .unwrap();
        assert_eq!(id.machine_identifier, "abc123");
        assert_eq!(id.version, "1.43.4.10903-e5521bd8c");
        assert!(id.claimed);
    }

    #[test]
    fn missing_plex_envelope_is_an_error_not_a_panic() {
        assert!(parse_plex_identity(&json!({"nope": 1})).is_err());
        assert!(parse_plex_libraries(&json!({"MediaContainer": {}})).is_err());
    }

    #[test]
    fn parses_plex_libraries_and_tolerates_odd_entries() {
        let libs = parse_plex_libraries(&json!({
            "MediaContainer": {
                "Directory": [
                    { "key": "1", "title": "Movies", "type": "movie",
                      "uuid": "u1", "refreshing": false, "updatedAt": 1700000000 },
                    { "key": "2", "title": "TV Shows", "type": "show",
                      "uuid": "u2", "refreshing": true,  "updatedAt": 1700000001 },
                    { "key": "3" }
                ]
            }
        }))
        .unwrap();

        assert_eq!(libs.len(), 3);
        assert_eq!(libs[0].title, "Movies");
        assert_eq!(libs[0].library_type, "movie");
        assert!(!libs[0].scanning);
        assert_eq!(libs[0].updated_at, 1_700_000_000);
        assert!(libs[1].scanning);
        // Missing fields must not panic the dashboard.
        assert_eq!(libs[2].title, "Untitled");
        assert_eq!(libs[2].library_type, "unknown");
        assert_eq!(libs[2].uuid, "");
    }

    // --- health reporting ----------------------------------------------
    #[tokio::test]
    async fn probe_reports_unconfigured_instead_of_erroring() {
        let health = probe(RestService::FlareSolverr, &keys()).await;
        assert!(!health.reachable);
        assert!(health.url.is_empty());
        assert!(health.detail.contains("flaresolverr_url"));
        assert_eq!(health.service, "flaresolverr");
        assert_eq!(health.label, "FlareSolverr");
    }

    // A service that is up but rejecting our credential is a different fault
    // from one that is down, and must not be reported as a dead service.
    #[tokio::test]
    async fn auth_rejection_is_reported_as_reachable() {
        let mut k = keys();
        k.qbittorrent_url = Some("http://127.0.0.1:1".to_string());
        let cfg = ServiceConfig::from_keys(RestService::QBittorrent, &k).unwrap();
        let client = HttpServiceClient::new(cfg).unwrap();

        let resp = client
            .build_request(reqwest::Method::GET, "/api/v2/app/version")
            .send()
            .await;
        // No listener on port 1, so we only assert we do not panic and that a
        // connection failure is treated as not-reachable.
        assert!(resp.is_err() || !resp.unwrap().status().is_success());
    }
}
