use crate::config::{AuthConfig, DeviceType, ServerConfig, ServiceKeys, ConnectionMethod};

// First-run seed data.
//
// NOTE: these values only apply when `~/.config/master-control/servers.json`
// does not already define a server with the same `id` (see `launch_gui`).
// `servers.json` is the source of truth — it wins for any id present here.
//
// The credentials below are duplicated in that file and have already drifted
// once (a stale Lidarr key and a dead Tailscale hostname were both found here
// on 2026-09-28). Prefer editing `servers.json`; treat this as bootstrapping
// only.

pub fn get_default_servers() -> Vec<ServerConfig> {
    vec![
        ServerConfig {
            id: "slayers-server".to_string(),
            name: "Slayers Server".to_string(),
            hostname: "home-server.tailf6d3b4.ts.net".to_string(),
            port: 22,
            username: "root".to_string(),
            auth: AuthConfig::Password { password: "".to_string() },
            device_type: DeviceType::Unraid,
            api_key: None,
            service_keys: ServiceKeys {
                nextcloud_user: None,
                nextcloud_pass: None,
                lidarr_api_key: None,
                homeassistant_token: None,
                adguard_user: None,
                adguard_pass: None,
                adguard_url: None,
                myspeed_db_path: Some("/mnt/user/appdata/myspeed/storage.db".to_string()),
                myspeed_url: Some("http://home-server.tailf6d3b4.ts.net:5216".to_string()),
                phone_adb_serial: None,
                phone_rustdesk_id: None,
                phone_rustdesk_password: None,
                kdeconnect_device_id: None,
                steamdeck_rustdesk_id: None,
                steamdeck_rustdesk_password: None,
                steamdeck_kdeconnect_device_id: None,
                ..ServiceKeys::default()
            },
            meshcentral_device_id: None,
            meshcentral_enrolled_at: None,
            meshcentral_status: None,
            connection_priority: Some(vec![
                ConnectionMethod::MeshCentral,
                ConnectionMethod::Graphql,
                ConnectionMethod::Ssh,
            ]),
        },
        ServerConfig {
            id: "galaxy-s24-ultra".to_string(),
            name: "Galaxy S24 Ultra".to_string(),
            hostname: "bradleys-s24-ultra.tailf6d3b4.ts.net".to_string(),
            port: 37823,
            username: "root".to_string(),
            auth: AuthConfig::Password { password: "".to_string() },
            device_type: DeviceType::Phone,
            api_key: None,
            service_keys: ServiceKeys {
                nextcloud_user: None,
                nextcloud_pass: None,
                lidarr_api_key: None,
                homeassistant_token: None,
                adguard_user: None,
                adguard_pass: None,
                adguard_url: None,
                myspeed_db_path: None,
                myspeed_url: None,
                phone_adb_serial: Some("bradleys-s24-ultra.tailf6d3b4.ts.net:42247".to_string()),
                phone_rustdesk_id: None,
                phone_rustdesk_password: None,
                kdeconnect_device_id: None,
                steamdeck_rustdesk_id: None,
                steamdeck_rustdesk_password: None,
                steamdeck_kdeconnect_device_id: None,
                ..ServiceKeys::default()
            },
            meshcentral_device_id: None,
            meshcentral_enrolled_at: None,
            meshcentral_status: None,
            connection_priority: Some(vec![
                ConnectionMethod::MeshCentral,
                ConnectionMethod::Adb,
                ConnectionMethod::Ssh,
            ]),
        },
        ServerConfig {
            id: "rog-ally".to_string(),
            name: "ROG Ally".to_string(),
            hostname: "lgbtally.tailf6d3b4.ts.net".to_string(),
            port: 22,
            username: "LGBT_Ally".to_string(),
            auth: AuthConfig::Password { password: "".to_string() },
            device_type: DeviceType::Handheld,
            api_key: None,
            service_keys: ServiceKeys {
                nextcloud_user: None,
                nextcloud_pass: None,
                lidarr_api_key: None,
                homeassistant_token: None,
                adguard_user: None,
                adguard_pass: None,
                adguard_url: None,
                myspeed_db_path: None,
                myspeed_url: None,
                phone_adb_serial: None,
                phone_rustdesk_id: None,
                phone_rustdesk_password: None,
                kdeconnect_device_id: None,
                steamdeck_rustdesk_id: None,
                steamdeck_rustdesk_password: None,
                steamdeck_kdeconnect_device_id: None,
                ..ServiceKeys::default()
            },
            meshcentral_device_id: None,
            meshcentral_enrolled_at: None,
            meshcentral_status: None,
            connection_priority: Some(vec![
                ConnectionMethod::MeshCentral,
                ConnectionMethod::Ssh,
            ]),
        },
    ]
}

// Backward compatibility
pub fn get_default_server() -> ServerConfig {
    get_default_servers().into_iter().next().unwrap()
}