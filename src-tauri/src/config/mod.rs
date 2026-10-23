/**
 * KTS Master Control - Configuration Module
 *
 * The fleet config types and servers.json load/save live in `legacy_config`.
 * Everything else in the crate imports them through this module:
 *   `use crate::config::{ServerConfig, AuthConfig, ...}`.
 *
 * The JSON config-file system (config.example.json + config.private.json)
 * currently exists only on the TypeScript side (src/config/loader.ts);
 * the Rust side still reads ~/.config/master-control/servers.json.
 */

pub mod legacy_config;

pub use legacy_config::{
    config_dir, config_file, load_servers, load_servers_checked, save_servers, AuthConfig,
    ConnectionMethod, DeviceType, MeshCentralConfig, ServerConfig, ServiceKeys,
    private_config_file,
    TicketingConfig,
    load_ticketing_config,
    save_ticketing_config,
    ensure_private_config_perms,
};
