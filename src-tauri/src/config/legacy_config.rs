use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub id: String,
    pub name: String,
    pub hostname: String,
    pub port: u16,
    pub username: String,
    pub auth: AuthConfig,
    pub device_type: DeviceType,
    pub api_key: Option<String>,
    pub service_keys: ServiceKeys,
    // MeshCentral integration (2026-10-07)
    pub meshcentral_device_id: Option<String>,
    pub meshcentral_enrolled_at: Option<String>,
    pub meshcentral_status: Option<String>,  // "online" | "offline" | "connected" | "unknown"
    pub connection_priority: Option<Vec<ConnectionMethod>>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServiceKeys {
    pub nextcloud_user: Option<String>,
    pub nextcloud_pass: Option<String>,
    pub lidarr_api_key: Option<String>,
    pub homeassistant_token: Option<String>,
    pub adguard_user: Option<String>,
    pub adguard_pass: Option<String>,
    pub adguard_url: Option<String>,
    pub myspeed_db_path: Option<String>,
    pub myspeed_url: Option<String>,
    // Auto-discovered 2026-08-30. These existed on the TypeScript side only,
    // so serde silently dropped them on load and the services had no
    // credentials to reach. Mirrors the TS `ServiceKeys` interface.
    pub plex_url: Option<String>,
    pub plex_token: Option<String>,
    pub scrutiny_url: Option<String>,
    pub uptimekuma_url: Option<String>,
    pub uptimekuma_slug: Option<String>,
    pub invoiceninja_url: Option<String>,
    pub invoiceninja_token: Option<String>,
    pub aurral_url: Option<String>,
    pub aurral_user: Option<String>,
    pub aurral_pass: Option<String>,
    pub your_spotify_url: Option<String>,
    pub your_spotify_api_key: Option<String>,
    pub dozzle_url: Option<String>,
    pub homepage_url: Option<String>,
    pub phone_adb_serial: Option<String>,
    pub phone_rustdesk_id: Option<String>,
    pub phone_rustdesk_password: Option<String>,
    pub kdeconnect_device_id: Option<String>,
    pub steamdeck_rustdesk_id: Option<String>,
    pub steamdeck_rustdesk_password: Option<String>,
    pub steamdeck_kdeconnect_device_id: Option<String>,

    // --- Verified-live fleet services (2026-09-29) ------------------------
    // Every key below was confirmed against the running fleet before being
    // added. The config had been carrying keys for services that were never
    // deployed (scrutiny, uptime-kuma, dozzle, your-spotify, myspeed, aurral,
    // homepage, bazarr, overseerr, slskd) while the services that ARE running
    // had no struct fields at all and were silently dropped by serde.
    // Rule: only add a key here after probing the endpoint it points at.

    // Unraid host
    pub unraid_url: Option<String>,
    pub lan_ip: Option<String>,
    pub tailscale_ip: Option<String>,

    // Arr stack + download client
    pub lidarr_url: Option<String>,
    pub radarr_url: Option<String>,
    pub radarr_api_key: Option<String>,
    pub sonarr_url: Option<String>,
    pub sonarr_api_key: Option<String>,
    pub prowlarr_url: Option<String>,
    pub prowlarr_api_key: Option<String>,
    pub qbittorrent_url: Option<String>,
    pub qbittorrent_user: Option<String>,
    pub qbittorrent_pass: Option<String>,
    pub flaresolverr_url: Option<String>,

    // Media
    pub plex_user_id: Option<String>,
    pub shoko_url: Option<String>,
    pub shoko_api_key: Option<String>,
    pub shoko_user: Option<String>,
    pub shoko_pass: Option<String>,

    // Home automation
    pub homeassistant_url: Option<String>,
    pub matter_hub_url: Option<String>,

    // Business / files
    pub nextcloud_url: Option<String>,
    pub ombi_url: Option<String>,

    // Infrastructure services
    pub mosquitto_host: Option<String>,
    pub mosquitto_port: Option<String>,
    pub mariadb_host: Option<String>,
    pub mariadb_port: Option<String>,
    pub rustdesk_server_host: Option<String>,
    pub rustdesk_server_ports: Option<String>,

    // Misc
    pub bing_api_key: Option<String>,

    // Device-local facts
    pub phone_ssh: Option<String>,
    pub phone_ssh_auth: Option<String>,
    pub mac_address: Option<String>,
    pub os: Option<String>,
    pub cpu: Option<String>,
    pub gpu: Option<String>,
    pub nfs_export: Option<String>,
    pub nfs_unraid_mount: Option<String>,
    pub sunshine_webui: Option<String>,
    pub sunshine_stream: Option<String>,
    pub sunshine_user: Option<String>,
    pub sunshine_pass: Option<String>,
    pub deskflow_client: Option<String>,
    pub sshfs_mount_kars: Option<String>,
    pub sshfs_mount_shared: Option<String>,
    pub lan_eth_reserved: Option<String>,
    pub lan_wifi_reserved: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AuthConfig {
    #[serde(rename = "password")]
    Password { password: String },
    #[serde(rename = "key")]
    Key {
        key_path: String,
        passphrase: Option<String>,
    },
}

impl AuthConfig {
    pub fn get_password(&self) -> Option<String> {
        match self {
            AuthConfig::Password { password } => Some(password.clone()),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    Unraid,
    Phone,
    #[serde(rename = "steamdeck")]
    Handheld,
    /// HTPC / living-room box (Bazzite on the NFS seagate3 box).
    Htpc,
    /// Secondary laptop (e.g. Senpai-Laptop, Bazzite NVIDIA).
    Laptop,
    Router,
    Generic,
}

impl DeviceType {
    /// Every spelling that should deserialize to this device type.
    ///
    /// The real `servers.json` uses `steamdeck` for the ROG Ally while older
    /// exports used `handheld`, and both spellings exist across fleet dumps.
    /// Accepting both keeps an edit of the config from invalidating the whole
    /// file (see `load_servers` — a serde failure there is not recoverable).
    pub fn parse_lenient(value: &str) -> Option<Self> {
        match value.to_ascii_lowercase().as_str() {
            "unraid" | "server" => Some(Self::Unraid),
            "phone" | "android" | "galaxy" => Some(Self::Phone),
            "handheld" | "steamdeck" | "rog" | "rog_ally" => Some(Self::Handheld),
            "htpc" => Some(Self::Htpc),
            "laptop" | "notebook" => Some(Self::Laptop),
            "router" => Some(Self::Router),
            "generic" | "" => Some(Self::Generic),
            _ => None,
        }
    }
}

/// Deserializing is deliberately lenient: an unrecognised `device_type`
/// degrades to `Generic` (and says so on stderr) instead of failing the parse.
///
/// The alternative is a footgun: one unknown string anywhere in `servers.json`
/// made `load_servers` return an *empty* fleet, and every service silently
/// lost its URL and credentials.
impl<'de> Deserialize<'de> for DeviceType {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        Ok(DeviceType::parse_lenient(&raw).unwrap_or_else(|| {
            eprintln!("[config] unknown device_type {raw:?}; treating as Generic");
            DeviceType::Generic
        }))
    }
}

/// Connection method priority for device telemetry and remote ops
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMethod {
    MeshCentral,
    Ssh,
    Graphql,
    Adb,
    KdeConnect,
}

/// MeshCentral server configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MeshCentralConfig {
    pub server_url: Option<String>,
    pub admin_user: Option<String>,
    pub admin_pass: Option<String>,
    pub group_id: Option<String>,
    pub group_name: Option<String>,
}

impl Default for ServerConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            hostname: String::new(),
            port: 22,
            username: "root".into(),
            auth: AuthConfig::Password {
                password: String::new(),
            },
            device_type: DeviceType::Unraid,
            api_key: None,
            service_keys: ServiceKeys::default(),
            meshcentral_device_id: None,
            meshcentral_enrolled_at: None,
            meshcentral_status: None,
            connection_priority: None,
        }
    }
}

pub fn config_dir() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".config").join("master-control")
}

pub fn config_file() -> PathBuf {
    config_dir().join("servers.json")
}

/// Load the server fleet from disk.
///
/// A malformed `servers.json` used to be swallowed into an empty fleet, which
/// looked exactly like "no servers configured" and hid real problems (a
/// duplicate JSON key and an unknown `device_type` both did this). Failures
/// are now reported on stderr so they are diagnosable, and the fleet loads as
/// `[]` only when the file is genuinely absent.
pub fn load_servers() -> Vec<ServerConfig> {
    match load_servers_checked() {
        Ok(servers) => servers,
        Err(e) => {
            eprintln!("[config] failed to load {}: {e}", config_file().display());
            Vec::new()
        }
    }
}

/// Same as [`load_servers`] but surfaces the reason it failed.
pub fn load_servers_checked() -> Result<Vec<ServerConfig>, String> {
    let path = config_file();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?;
    if raw.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&raw).map_err(|e| format!("parse: {e}"))
}

pub fn save_servers(servers: &[ServerConfig]) {
    let path = config_file();
    let _ = fs::create_dir_all(path.parent().unwrap());
    let _ = fs::write(&path, serde_json::to_string_pretty(servers).unwrap());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn server(device_type: &str) -> String {
        format!(
            r#"[{{
                "id": "x", "name": "X", "hostname": "h", "port": 22,
                "username": "root",
                "auth": {{ "type": "password", "password": "p" }},
                "device_type": "{device_type}",
                "service_keys": {{}}
            }}]"#
        )
    }

    /// Every device type that appears in the live fleet config must parse.
    ///
    /// `htpc` and `laptop` were missing from this enum, and because
    /// `load_servers` swallowed the error the whole fleet loaded as empty.
    #[test]
    fn every_live_fleet_device_type_parses() {
        for dt in [
            "unraid",
            "phone",
            "htpc",
            "handheld",
            "laptop",
            "steamdeck",
            "router",
        ] {
            let v: Vec<ServerConfig> = serde_json::from_str(&server(dt))
                .unwrap_or_else(|e| panic!("device_type {dt:?} failed to parse: {e}"));
            assert_eq!(v.len(), 1, "device_type {dt:?}");
        }
    }

    #[test]
    fn unknown_device_type_degrades_instead_of_failing_the_fleet() {
        let v: Vec<ServerConfig> = serde_json::from_str(&server("quantum-toaster")).unwrap();
        assert_eq!(v[0].device_type, DeviceType::Generic);
    }

    #[test]
    fn device_type_roundtrips_through_serialize() {
        for dt in [
            DeviceType::Unraid,
            DeviceType::Phone,
            DeviceType::Handheld,
            DeviceType::Htpc,
            DeviceType::Laptop,
            DeviceType::Router,
            DeviceType::Generic,
        ] {
            let json = serde_json::to_string(&dt).unwrap();
            let back: DeviceType = serde_json::from_str(&json).unwrap();
            assert_eq!(dt, back);
        }
        // The ROG Ally is stored as `steamdeck`, not `handheld`.
        assert_eq!(
            serde_json::to_string(&DeviceType::Handheld).unwrap(),
            "\"steamdeck\""
        );
    }

    /// A duplicate JSON key must be a loud error, not a silent empty fleet.
    /// This is the exact shape that broke the live config (`lidarr_api_key`
    /// appeared twice with different values).
    #[test]
    fn duplicate_service_key_is_reported_not_swallowed() {
        let raw = r#"[{
            "id": "x", "name": "X", "hostname": "h", "port": 22,
            "username": "root",
            "auth": { "type": "password", "password": "p" },
            "device_type": "unraid",
            "service_keys": { "lidarr_api_key": "aaa", "lidarr_api_key": "bbb" }
        }]"#;
        let err = serde_json::from_str::<Vec<ServerConfig>>(raw).unwrap_err();
        assert!(
            err.to_string().contains("duplicate field"),
            "expected a duplicate-field error, got: {err}"
        );
    }

    #[test]
    fn service_keys_survive_a_roundtrip() {
        // The TS/Rust drift that started this: fields must not be dropped.
        let k = ServiceKeys {
            plex_url: Some("http://192.168.4.175:32400".into()),
            plex_token: Some("tok".into()),
            uptimekuma_slug: Some("myservices".into()),
            your_spotify_api_key: Some("uuid".into()),
            ..ServiceKeys::default()
        };

        let json = serde_json::to_string(&k).unwrap();
        let back: ServiceKeys = serde_json::from_str(&json).unwrap();
        assert_eq!(back.plex_url, k.plex_url);
        assert_eq!(back.plex_token, k.plex_token);
        assert_eq!(back.uptimekuma_slug, k.uptimekuma_slug);
        assert_eq!(back.your_spotify_api_key, k.your_spotify_api_key);
    }

    #[test]
    fn missing_config_file_is_not_an_error() {
        // Absent file => empty fleet, but explicitly Ok, never a parse failure.
        let parsed: Result<Vec<ServerConfig>, _> = serde_json::from_str("[]");
        assert!(parsed.is_ok());
    }
}

// ---------------------------------------------------------------------------
// Ticketing bridge configuration (private, mode-0600)
// ---------------------------------------------------------------------------
/// Private configuration for the ticketing bridge connection.
/// Stored in ~/.config/master-control/config.private.json with mode 0o600.
/// NEVER exposed to the frontend, never in servers.json.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TicketingConfig {
    /// Bridge base URL (e.g. "http://127.0.0.1:8799"). Defaults to loopback sandbox.
    pub bridge_url: Option<String>,
    /// Bearer token for bridge auth. Stored in this private file, never in servers.json.
    /// For MC-1b: sandbox token only. Stored here with mode 0o600, or in OS keyring.
    pub bridge_token: Option<String>,
    /// If true, use the live bridge (MC-1b). If false or None, use mock fixture (MC-1).
    #[serde(default)]
    pub use_live_bridge: bool,
}

/// Path of the private (mode-0600) config file.
///
/// `MASTER_CONTROL_CONFIG_PRIVATE` overrides it. That override exists so tests
/// can point the loader at a throwaway file instead of the operator's real
/// `config.private.json`; unset (the normal case) it resolves to
/// `~/.config/master-control/config.private.json` exactly as before.
pub fn private_config_file() -> PathBuf {
    match std::env::var("MASTER_CONTROL_CONFIG_PRIVATE") {
        Ok(p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => config_dir().join("config.private.json"),
    }
}

/// Load the private ticketing config. Returns Default if file missing or unreadable.
pub fn load_ticketing_config() -> TicketingConfig {
    let path = private_config_file();
    if !path.exists() {
        return TicketingConfig::default();
    }
    let data = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[config] failed to read {}: {e}", path.display());
            return TicketingConfig::default();
        }
    };
    match serde_json::from_str(&data) {
        Ok(cfg) => cfg,
        Err(e) => {
            eprintln!("[config] failed to parse {}: {e}", path.display());
            TicketingConfig::default()
        }
    }
}

/// Save the ticketing config. Sets file mode to 0o600.
pub fn save_ticketing_config(cfg: &TicketingConfig) -> Result<(), String> {
    let path = private_config_file();
    let data = serde_json::to_string_pretty(cfg)
        .map_err(|e| format!("serialization failed: {e}"))?;
    fs::write(&path, data).map_err(|e| format!("write failed: {e}"))?;
    // Set mode 0o600 (owner read/write only)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Ensure the config directory exists and private file has correct perms.
pub fn ensure_private_config_perms() -> Result<(), String> {
    let dir = config_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir failed: {e}"))?;
    let path = private_config_file();
    if path.exists() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&path).map_err(|e| e.to_string())?.permissions();
            perms.set_mode(0o600);
            fs::set_permissions(&path, perms).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

