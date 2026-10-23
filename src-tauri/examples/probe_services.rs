//! Live end-to-end check of the REST service layer against the real fleet.
//!
//! Usage: cargo run --example probe_services
//!
//! Reads the same `~/.config/master-control/servers.json` the app does, so it
//! fails for the same reasons the app would.

use master_control_lib::config::load_servers_checked;
use master_control_lib::services::{
    plex_identity, plex_libraries, probe, HttpServiceClient, RestService, ServiceConfig,
};

#[tokio::main]
async fn main() {
    let servers = match load_servers_checked() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("config FAILED to load: {e}");
            std::process::exit(1);
        }
    };
    println!("config OK: {} servers\n", servers.len());

    for server in &servers {
        let keys = &server.service_keys;

        // Only the Unraid box has REST service keys today.
        let configured = RestService::ALL
            .iter()
            .filter(|s| ServiceConfig::from_keys(**s, keys).is_ok())
            .count();
        if configured == 0 && server.id != "slayers-server" {
            println!("{} ({:?}): no REST services", server.id, server.device_type);
            continue;
        }

        println!("=== {} ({}) ===", server.id, server.name);
        let mut set = tokio::task::JoinSet::new();
        for svc in RestService::ALL {
            let k = keys.clone();
            set.spawn(async move { probe(svc, &k).await });
        }
        let mut health = Vec::new();
        while let Some(joined) = set.join_next().await {
            if let Ok(h) = joined {
                health.push(h);
            }
        }
        health.sort_by(|a, b| a.service.cmp(&b.service));
        for h in &health {
            println!(
                "  {:<22} {:<8} {}",
                h.label,
                if h.reachable { "UP" } else { "DOWN" },
                if h.reachable {
                    h.url.clone()
                } else {
                    h.detail.clone()
                }
            );
        }

        // Plex gets the deeper check because its endpoints are auth-sensitive.
        match ServiceConfig::from_keys(RestService::Plex, keys) {
            Ok(cfg) => match HttpServiceClient::new(cfg) {
                Ok(client) => {
                    match plex_identity(&client).await {
                        Ok(id) => println!(
                            "  plex identity: v{} claimed={} ({})",
                            id.version, id.claimed, id.machine_identifier
                        ),
                        Err(e) => println!("  plex identity: FAILED {e}"),
                    }
                    match plex_libraries(&client).await {
                        Ok(libs) => {
                            println!("  plex libraries: {}", libs.len());
                            for l in &libs {
                                println!("    - {} [{}]", l.title, l.library_type);
                            }
                        }
                        Err(e) => println!("  plex libraries: FAILED {e}"),
                    }
                }
                Err(e) => println!("  plex client: FAILED {e}"),
            },
            Err(e) => println!("  plex not configured: {e}"),
        }
        println!();
    }
}
