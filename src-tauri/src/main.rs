use clap::{Parser, Subcommand};
use serde_json::json;
use tauri::Manager;

use master_control_lib::commands;
use master_control_lib::config::{AuthConfig, ServerConfig};
use master_control_lib::graphql::GraphQLClient;
use master_control_lib::parsers::{nvidia, smart, system};
use master_control_lib::ssh::SshConnection;

#[derive(Parser)]
#[command(name = "master-control", about = "KTS Master Control Center")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Run in CLI mode and output JSON
    Cli {
        #[command(subcommand)]
        action: CliAction,
    },
}

#[derive(Subcommand)]
enum CliAction {
    Stats {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    DockerList {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    DockerStart {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        container: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    DockerStop {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        container: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    DockerRestart {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        container: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    DockerLogs {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        container: String,
        #[arg(short, long, default_value = "50")]
        lines: u32,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Gpu {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Disks {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Smart {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        device: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Processes {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Syslog {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "50")]
        lines: u32,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Network {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Tailscale {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Reboot {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Shutdown {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    Exec {
        #[arg(short, long)]
        server: String,
        #[arg(short, long)]
        command: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    NextcloudInfo {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    NextcloudStatus {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    NextcloudStorage {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    NextcloudUsers {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    NextcloudActivity {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrStatus {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrHealth {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrArtists {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrAlbums {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrWanted {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrQueue {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    LidarrDiskspace {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    HomeAssistantStates {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    HomeAssistantConfig {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    HomeAssistantAreas {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    HomeAssistantDevices {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    HomeAssistantEntities {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    MySpeedSummary {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    MySpeedTests {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    MySpeedServers {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardStatus {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardStats {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardQueryLog {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardClients {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardFilters {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardDhcp {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardEnable {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
    AdGuardDisable {
        #[arg(short, long)]
        server: String,
        #[arg(short, long, default_value = "root")]
        user: String,
        #[arg(long, default_value = "22")]
        port: u16,
        #[arg(long)]
        password: Option<String>,
        #[arg(long)]
        api_key: Option<String>,
    },
}

fn make_config(
    server: &str,
    user: &str,
    port: u16,
    password: &Option<String>,
    api_key: &Option<String>,
) -> ServerConfig {
    let mut config = master_control_lib::auto_connect::get_default_server();
    // Apply the CLI args on top of the default server config so CLI subcommands
    // work against any host, not just the hardcoded default.
    config.hostname = server.to_string();
    config.username = user.to_string();
    config.port = port;
    if let Some(pass) = password {
        config.auth = AuthConfig::Password {
            password: pass.clone(),
        };
    }
    if let Some(key) = api_key {
        config.api_key = Some(key.clone());
    }
    config
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Cli { action }) => {
            let result = handle_cli_action(action).await;
            match result {
                Ok(value) => {
                    println!("{}", serde_json::to_string_pretty(&value).unwrap());
                }
                Err(e) => {
                    eprintln!(
                        "{}",
                        serde_json::to_string_pretty(&json!({
                            "error": e.to_string()
                        }))
                        .unwrap()
                    );
                    std::process::exit(1);
                }
            }
        }
        None => {
            launch_gui().await;
        }
    }
}

async fn handle_cli_action(action: CliAction) -> anyhow::Result<serde_json::Value> {
    match action {
        CliAction::Stats {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let query = r#"{
                metrics { cpu { percentTotal } memory { total used free percentTotal } }
                info { os { hostname kernel } cpu { cores threads brand speed } system { manufacturer model } }
                array { state }
            }"#;
            match api.query(query, config.api_key.as_deref()).await {
                Ok(data) => Ok(data),
                Err(_) => {
                    let conn = SshConnection::connect(&config)?;
                    let free_output = conn.exec("free -m | grep Mem")?;
                    let (mem_total, mem_used) = system::parse_free(&free_output);
                    let uptime_output = conn.exec("uptime -p")?;
                    let _uptime = system::parse_uptime(&uptime_output);
                    let hostname = conn.exec("hostname")?;
                    let kernel = conn.exec("uname -r")?;
                    let mem_usage_pct = if mem_total > 0 {
                        mem_used as f64 / mem_total as f64 * 100.0
                    } else {
                        0.0
                    };
                    Ok(json!({
                        "info": { "os": { "hostname": hostname.trim(), "kernel": kernel.trim() }, "cpu": { "cores": 1 } },
                        "metrics": { "cpu": { "percentTotal": 0.0 }, "memory": { "total": mem_total * 1048576, "used": mem_used * 1048576, "percentTotal": mem_usage_pct } }
                    }))
                }
            }
        }

        CliAction::DockerList {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let query = r#"{ docker { containers { id names image state status autoStart } } }"#;
            let data = api.query(query, config.api_key.as_deref()).await?;
            Ok(data
                .pointer("/docker/containers")
                .cloned()
                .unwrap_or(json!([])))
        }

        CliAction::DockerStart {
            server,
            container,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let m = format!(
                r#"mutation {{ docker {{ start(id: "{}") {{ id state }} }} }}"#,
                container
            );
            api.query(&m, config.api_key.as_deref()).await?;
            Ok(json!({"status": "started", "container": container}))
        }

        CliAction::DockerStop {
            server,
            container,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let m = format!(
                r#"mutation {{ docker {{ stop(id: "{}") {{ id state }} }} }}"#,
                container
            );
            api.query(&m, config.api_key.as_deref()).await?;
            Ok(json!({"status": "stopped", "container": container}))
        }

        CliAction::DockerRestart {
            server,
            container,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let m = format!(
                r#"mutation {{ docker {{ restart(id: "{}") {{ id state }} }} }}"#,
                container
            );
            api.query(&m, config.api_key.as_deref()).await?;
            Ok(json!({"status": "restarted", "container": container}))
        }

        CliAction::DockerLogs {
            server,
            container,
            lines,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let q = format!(
                r#"{{ docker {{ logs(id: "{}", tail: {}) {{ lines {{ timestamp message }} }} }} }}"#,
                container, lines
            );
            let data = api.query(&q, config.api_key.as_deref()).await?;
            let log_lines = data
                .pointer("/docker/logs/lines")
                .and_then(|l| l.as_array())
                .cloned()
                .unwrap_or_default();
            let output: String = log_lines
                .iter()
                .filter_map(|line| {
                    let ts = line.get("timestamp").and_then(|t| t.as_str()).unwrap_or("");
                    let msg = line.get("message").and_then(|m| m.as_str()).unwrap_or("");
                    if msg.is_empty() {
                        None
                    } else {
                        Some(format!("{} {}", ts, msg))
                    }
                })
                .collect::<Vec<_>>()
                .join("\n");
            Ok(json!({"container": container, "logs": output}))
        }

        CliAction::Gpu {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec("nvidia-smi")?;
            match nvidia::parse_nvidia_smi(&output) {
                Some(info) => Ok(serde_json::to_value(info)?),
                None => Ok(json!({"error": "No GPU found"})),
            }
        }

        CliAction::Disks {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let api = GraphQLClient::new(&config.hostname)?;
            let query =
                r#"{ disks { name device type size vendor temperature smartStatus isSpinning } }"#;
            let data = api.query(query, config.api_key.as_deref()).await?;
            Ok(data.pointer("/disks").cloned().unwrap_or(json!([])))
        }

        CliAction::Smart {
            server,
            device,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec(&format!("smartctl -a {}", device))?;
            let info = smart::parse_smartctl(&output, &device);
            Ok(serde_json::to_value(info)?)
        }

        CliAction::Processes {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec("ps aux --sort=-%cpu | head -25")?;
            Ok(json!({"processes": output}))
        }

        CliAction::Syslog {
            server,
            lines,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec(&format!(
                "tail -{} /var/log/syslog 2>/dev/null || journalctl -n {} --no-pager",
                lines, lines
            ))?;
            Ok(json!({"syslog": output}))
        }

        CliAction::Network {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec("ip -br addr show")?;
            Ok(json!({"interfaces": output}))
        }

        CliAction::Tailscale {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec("tailscale status")?;
            Ok(json!({"tailscale": output}))
        }

        CliAction::Reboot {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            conn.exec("reboot")?;
            Ok(json!({"status": "rebooting", "server": server}))
        }

        CliAction::Shutdown {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            conn.exec("poweroff")?;
            Ok(json!({"status": "shutting_down", "server": server}))
        }

        CliAction::Exec {
            server,
            command,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = SshConnection::connect(&config)?;
            let output = conn.exec(&command)?;
            Ok(json!({"output": output}))
        }

        CliAction::NextcloudInfo {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::NextcloudClient::new(
                master_control_lib::services::NextcloudConfig {
                    base_url: format!("https://{}:4443", config.hostname),
                    username: config
                        .service_keys
                        .nextcloud_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .nextcloud_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let info = client.get_server_info().await?;
            Ok(serde_json::to_value(info)?)
        }

        CliAction::NextcloudStatus {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::NextcloudClient::new(
                master_control_lib::services::NextcloudConfig {
                    base_url: format!("https://{}:4443", config.hostname),
                    username: config
                        .service_keys
                        .nextcloud_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .nextcloud_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let status = client.get_system_status().await?;
            Ok(serde_json::to_value(status)?)
        }

        CliAction::NextcloudStorage {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::NextcloudClient::new(
                master_control_lib::services::NextcloudConfig {
                    base_url: format!("https://{}:4443", config.hostname),
                    username: config
                        .service_keys
                        .nextcloud_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .nextcloud_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let stats = client.get_storage_stats().await?;
            Ok(serde_json::to_value(stats)?)
        }

        CliAction::NextcloudUsers {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::NextcloudClient::new(
                master_control_lib::services::NextcloudConfig {
                    base_url: format!("https://{}:4443", config.hostname),
                    username: config
                        .service_keys
                        .nextcloud_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .nextcloud_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let users = client.get_users().await?;
            Ok(serde_json::to_value(users)?)
        }

        CliAction::NextcloudActivity {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::NextcloudClient::new(
                master_control_lib::services::NextcloudConfig {
                    base_url: format!("https://{}:4443", config.hostname),
                    username: config
                        .service_keys
                        .nextcloud_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .nextcloud_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let activity = client.get_activity(None, Some(20)).await?;
            Ok(serde_json::to_value(activity)?)
        }

        CliAction::LidarrStatus {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or(config.api_key.clone().unwrap_or_default()),
                },
            )?;
            let status = client.get_system_status().await?;
            Ok(serde_json::to_value(status)?)
        }

        CliAction::LidarrHealth {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let health = client.get_health().await?;
            Ok(serde_json::to_value(health)?)
        }

        CliAction::LidarrArtists {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let artists = client.get_artists().await?;
            Ok(serde_json::to_value(artists)?)
        }

        CliAction::LidarrAlbums {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let albums = client.get_albums(None, Some(true)).await?;
            Ok(serde_json::to_value(albums)?)
        }

        CliAction::LidarrWanted {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let wanted = client.get_wanted_missing(1, 50).await?;
            Ok(serde_json::to_value(wanted)?)
        }

        CliAction::LidarrQueue {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let queue = client.get_queue(1, 50).await?;
            Ok(serde_json::to_value(queue)?)
        }

        CliAction::LidarrDiskspace {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::LidarrClient::new(
                master_control_lib::services::LidarrConfig {
                    base_url: format!("http://{}:8686", config.hostname),
                    api_key: config
                        .service_keys
                        .lidarr_api_key
                        .clone()
                        .unwrap_or_default(),
                },
            )?;
            let diskspace = client.get_disk_space().await?;
            Ok(serde_json::to_value(diskspace)?)
        }

        CliAction::HomeAssistantStates {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::HomeAssistantClient::new(
                master_control_lib::services::HomeAssistantConfig {
                    base_url: format!("http://{}:8123", config.hostname),
                    token: config.api_key.clone().unwrap_or_default(),
                },
            )?;
            let states = client.get_states().await?;
            Ok(serde_json::to_value(states)?)
        }

        CliAction::HomeAssistantConfig {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::HomeAssistantClient::new(
                master_control_lib::services::HomeAssistantConfig {
                    base_url: format!("http://{}:8123", config.hostname),
                    token: config.api_key.clone().unwrap_or_default(),
                },
            )?;
            let config = client.get_config().await?;
            Ok(serde_json::to_value(config)?)
        }

        CliAction::HomeAssistantAreas {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::HomeAssistantClient::new(
                master_control_lib::services::HomeAssistantConfig {
                    base_url: format!("http://{}:8123", config.hostname),
                    token: config.api_key.clone().unwrap_or_default(),
                },
            )?;
            let areas = client.get_areas().await?;
            Ok(serde_json::to_value(areas)?)
        }

        CliAction::HomeAssistantDevices {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::HomeAssistantClient::new(
                master_control_lib::services::HomeAssistantConfig {
                    base_url: format!("http://{}:8123", config.hostname),
                    token: config.api_key.clone().unwrap_or_default(),
                },
            )?;
            let devices = client.get_devices().await?;
            Ok(serde_json::to_value(devices)?)
        }

        CliAction::HomeAssistantEntities {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::HomeAssistantClient::new(
                master_control_lib::services::HomeAssistantConfig {
                    base_url: format!("http://{}:8123", config.hostname),
                    token: config.api_key.clone().unwrap_or_default(),
                },
            )?;
            let entities = client.get_entity_registry().await?;
            Ok(serde_json::to_value(entities)?)
        }

        CliAction::MySpeedSummary {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = master_control_lib::ssh::SshConnection::connect(&config)?;

            // Query the MySpeed database directly via SSH
            let stats_query = r#"sqlite3 /mnt/user/appdata/myspeed/storage.db "SELECT COUNT(*), AVG(download), AVG(upload), AVG(ping), MAX(download), MAX(upload), MIN(ping) FROM speedtests""#;
            let stats_output = conn.exec(stats_query)?;

            let tests_query = r#"sqlite3 /mnt/user/appdata/myspeed/storage.db "SELECT id, created, download, upload, ping, serverId, resultId FROM speedtests ORDER BY created DESC LIMIT 50""#;
            let tests_output = conn.exec(tests_query)?;

            let servers_query = r#"sqlite3 /mnt/user/appdata/myspeed/storage.db "SELECT id, name, url, '' as location, '' as country, 0 as port, 0 as secure FROM nodes ORDER BY name""#;
            let servers_output = conn.exec(servers_query)?;

            // Parse the outputs
            let stats_parts: Vec<&str> = stats_output.trim().split('|').collect();
            let total_tests = stats_parts
                .first()
                .unwrap_or(&"0")
                .parse::<i64>()
                .unwrap_or(0);
            let avg_download = stats_parts
                .get(1)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let avg_upload = stats_parts
                .get(2)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let avg_ping = stats_parts
                .get(3)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let max_download = stats_parts
                .get(4)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let max_upload = stats_parts
                .get(5)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);
            let min_ping = stats_parts
                .get(6)
                .unwrap_or(&"0")
                .parse::<f64>()
                .unwrap_or(0.0);

            let recent_tests: Vec<serde_json::Value> = tests_output.lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    json!({
                        "id": parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                        "timestamp": parts.get(1).unwrap_or(&"0"),
                        "download": parts.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "upload": parts.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "ping": parts.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "jitter": null,
                        "server_id": parts.get(5).and_then(|v| v.parse::<i64>().ok()),
                        "server_name": None::<String>,
                        "server_location": None::<String>,
                        "server_country": None::<String>,
                        "server_host": None::<String>,
                        "client_ip": None::<String>,
                        "client_isp": None::<String>,
                        "client_country": None::<String>,
                        "result_id": parts.get(6).and_then(|v| if v.is_empty() { None } else { Some(v.to_string()) }),
                        "result_url": None::<String>,
                    })
                })
                .collect();

            let servers: Vec<serde_json::Value> = servers_output
                .lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    json!({
                        "id": parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                        "name": parts.get(1).unwrap_or(&""),
                        "location": parts.get(2).unwrap_or(&""),
                        "country": parts.get(3).unwrap_or(&""),
                        "host": parts.get(4).unwrap_or(&""),
                        "port": parts.get(5).unwrap_or(&"0").parse::<i32>().unwrap_or(0),
                        "secure": parts.get(6).unwrap_or(&"0").parse::<bool>().unwrap_or(false),
                    })
                })
                .collect();

            Ok(json!({
                "stats": {
                    "total_tests": total_tests,
                    "avg_download": avg_download,
                    "avg_upload": avg_upload,
                    "avg_ping": avg_ping,
                    "max_download": max_download,
                    "max_upload": max_upload,
                    "min_ping": min_ping,
                    "latest_test": recent_tests.first().cloned()
                },
                "recent_tests": recent_tests,
                "servers": servers
            }))
        }

        CliAction::MySpeedTests {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = master_control_lib::ssh::SshConnection::connect(&config)?;

            let tests_query = r#"sqlite3 /mnt/user/appdata/myspeed/storage.db "SELECT id, created, download, upload, ping, serverId, resultId FROM speedtests ORDER BY created DESC LIMIT 50""#;
            let tests_output = conn.exec(tests_query)?;

            let recent_tests: Vec<serde_json::Value> = tests_output.lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    json!({
                        "id": parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                        "timestamp": parts.get(1).unwrap_or(&"0"),
                        "download": parts.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "upload": parts.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "ping": parts.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                        "jitter": null,
                        "server_id": parts.get(5).and_then(|v| v.parse::<i64>().ok()),
                        "server_name": None::<String>,
                        "server_location": None::<String>,
                        "server_country": None::<String>,
                        "server_host": None::<String>,
                        "client_ip": None::<String>,
                        "client_isp": None::<String>,
                        "client_country": None::<String>,
                        "result_id": parts.get(6).and_then(|v| if v.is_empty() { None } else { Some(v.to_string()) }),
                        "result_url": None::<String>,
                    })
                })
                .collect();

            Ok(json!(recent_tests))
        }

        CliAction::MySpeedServers {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let conn = master_control_lib::ssh::SshConnection::connect(&config)?;

            let servers_query = r#"sqlite3 /mnt/user/appdata/myspeed/storage.db "SELECT id, name, url, '' as location, '' as country, 0 as port, 0 as secure FROM nodes ORDER BY name""#;
            let servers_output = conn.exec(servers_query)?;

            let servers: Vec<serde_json::Value> = servers_output
                .lines()
                .filter(|l| !l.is_empty())
                .map(|line| {
                    let parts: Vec<&str> = line.split('|').collect();
                    json!({
                        "id": parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                        "name": parts.get(1).unwrap_or(&""),
                        "location": parts.get(2).unwrap_or(&""),
                        "country": parts.get(3).unwrap_or(&""),
                        "host": parts.get(4).unwrap_or(&""),
                        "port": parts.get(5).unwrap_or(&"0").parse::<i32>().unwrap_or(0),
                        "secure": parts.get(6).unwrap_or(&"0").parse::<bool>().unwrap_or(false),
                    })
                })
                .collect();

            Ok(json!(servers))
        }

        CliAction::AdGuardStatus {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let status = client.get_status().await?;
            Ok(serde_json::to_value(status)?)
        }

        CliAction::AdGuardStats {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let stats = client.get_stats().await?;
            Ok(serde_json::to_value(stats)?)
        }

        CliAction::AdGuardQueryLog {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let log = client.get_query_log(50, 0, None).await?;
            Ok(serde_json::to_value(log)?)
        }

        CliAction::AdGuardClients {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let clients = client.get_clients().await?;
            Ok(serde_json::to_value(clients)?)
        }

        CliAction::AdGuardFilters {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let filters = client.get_filters().await?;
            Ok(serde_json::to_value(filters)?)
        }

        CliAction::AdGuardDhcp {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            let dhcp = client.get_dhcp().await?;
            Ok(serde_json::to_value(dhcp)?)
        }

        CliAction::AdGuardEnable {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            client.enable_protection().await?;
            Ok(json!({"status": "enabled"}))
        }

        CliAction::AdGuardDisable {
            server,
            user,
            port,
            password,
            api_key,
        } => {
            let config = make_config(&server, &user, port, &password, &api_key);
            let client = master_control_lib::services::AdGuardClientWrapper::new(
                master_control_lib::services::AdGuardConfig {
                    base_url: "https://adguard.tailf6d3b4.ts.net:8443".to_string(),
                    username: config
                        .service_keys
                        .adguard_user
                        .clone()
                        .unwrap_or(config.username.clone()),
                    password: config
                        .service_keys
                        .adguard_pass
                        .clone()
                        .unwrap_or(config.auth.get_password().unwrap_or_default()),
                },
            )?;
            client.disable_protection().await?;
            Ok(json!({"status": "disabled"}))
        }
    }
}

async fn launch_gui() {
    let default_servers = master_control_lib::auto_connect::get_default_servers();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage({
            let state = master_control_lib::AppState::new();
            let mut servers = state.servers.lock();
            for server in default_servers {
                if !servers.iter().any(|s| s.id == server.id) {
                    servers.push(server);
                }
            }
            drop(servers);
            state
        })
        .setup(|app| {
            // Auto-sync MeshCentral inventory at startup so
            // meshcentral_device_id exists on every launch (no manual
            // "Sync Fleet" click needed; sync also persists servers.json).
            let state = app.state::<master_control_lib::AppState>();
            let servers_arc = state.servers.clone();
            tauri::async_runtime::spawn(async move {
                let mut snapshot = (*servers_arc.lock()).clone();
                match master_control_lib::commands::meshcentral_sync_fleet_core(&mut snapshot).await
                {
                    Ok(r) => {
                        // Merge only the MC fields onto the live list (never
                        // clobber servers the user added during the sync),
                        // then persist the merged state.
                        {
                            let mut current = servers_arc.lock();
                            for snap in &snapshot {
                                if let Some(cur) = current.iter_mut().find(|s| s.id == snap.id) {
                                    cur.meshcentral_device_id = snap.meshcentral_device_id.clone();
                                    cur.meshcentral_status = snap.meshcentral_status.clone();
                                    cur.meshcentral_enrolled_at = snap.meshcentral_enrolled_at.clone();
                                }
                            }
                            master_control_lib::config::save_servers(&current);
                        }
                        println!(
                            "MeshCentral startup sync: found={} matched={} new={} updated={}",
                            r.devices_found, r.devices_matched, r.devices_new, r.devices_updated
                        );
                    }
                    Err(e) => eprintln!("MeshCentral startup sync failed: {e}"),
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ticketing::ticketing_overview,
            commands::ticketing::ticketing_create_ticket,
            commands::ticketing::ticketing_add_worklog,
            commands::ticketing::ticketing_change_status,
            commands::test_connection,
            commands::save_server,
            commands::remove_server,
            commands::get_servers,
            commands::get_system_stats,
            commands::get_docker_containers,
            commands::docker_start,
            commands::docker_stop,
            commands::docker_restart,
            commands::docker_logs,
            commands::docker_remove,
            commands::get_docker_container_info,
            commands::get_smart_data,
            commands::get_disks,
            commands::get_shares,
            commands::get_gpu_info,
            commands::get_processes,
            commands::get_syslog,
            commands::get_user_scripts,
            commands::get_plugins,
            commands::get_network_interfaces,
            commands::get_tailscale_peers,
            commands::reboot_server,
            commands::shutdown_server,
            commands::run_user_script,
            commands::get_array_info,
            commands::get_nextcloud_info,
            commands::get_nextcloud_status,
            commands::get_nextcloud_storage,
            commands::get_nextcloud_users,
            commands::get_nextcloud_activity,
            commands::get_lidarr_status,
            commands::get_lidarr_health,
            commands::get_lidarr_artists,
            commands::get_lidarr_albums,
            commands::get_lidarr_wanted,
            commands::get_lidarr_queue,
            commands::get_lidarr_diskspace,
            commands::lidarr_refresh_artist,
            commands::lidarr_search_missing,
            commands::get_homeassistant_states,
            commands::get_homeassistant_config,
            commands::get_homeassistant_areas,
            commands::get_homeassistant_devices,
            commands::get_homeassistant_entities,
            commands::homeassistant_toggle,
            commands::homeassistant_turn_on,
            commands::homeassistant_turn_off,
            commands::get_myspeed_summary,
            commands::get_myspeed_tests,
            commands::get_myspeed_servers,
            commands::get_adguard_status,
            commands::get_adguard_stats,
            commands::get_adguard_query_log,
            commands::get_adguard_clients,
            commands::get_adguard_filters,
            commands::get_adguard_dhcp,
            commands::adguard_enable,
            commands::adguard_disable,
            commands::get_phone_device_info,
            commands::get_phone_battery,
            commands::get_phone_thermal,
            commands::get_phone_storage,
            commands::get_phone_memory,
            commands::get_phone_cpu,
            commands::get_phone_screen,
            commands::get_phone_network,
            commands::get_phone_apps,
            commands::get_phone_processes,
            commands::get_phone_activity,
            commands::phone_set_screen,
            commands::phone_set_brightness,
            commands::phone_set_auto_brightness,
            commands::phone_volume_up,
            commands::phone_volume_down,
            commands::phone_reboot,
            commands::phone_screenshot,
            commands::phone_screenshot_save,
            commands::phone_force_stop_app,
            commands::phone_get_sms_inbox,
            commands::phone_get_sms_by_address,
            commands::phone_get_sms_conversations,
            commands::phone_send_sms,
            commands::launch_rustdesk,
            commands::get_kdeconnect_battery,
            commands::get_kdeconnect_notifications,
            commands::get_kdeconnect_notification,
            commands::get_kdeconnect_mpris,
            commands::kdeconnect_mpris_play,
            commands::kdeconnect_mpris_pause,
            commands::kdeconnect_mpris_play_pause,
            commands::kdeconnect_mpris_next,
            commands::kdeconnect_mpris_previous,
            commands::kdeconnect_mpris_set_volume,
            commands::get_kdeconnect_connectivity,
            commands::get_kdeconnect_telephony,
            commands::kdeconnect_ring_device,
            commands::kdeconnect_send_ping,
            commands::kdeconnect_send_sms,
            commands::kdeconnect_send_clipboard,
            commands::kdeconnect_get_clipboard,
            commands::get_kdeconnect_contacts,
            commands::kdeconnect_sftp_list,
            commands::kdeconnect_share_file,
            commands::kdeconnect_share_url,
            commands::kdeconnect_share_text,
            commands::kdeconnect_get_conversations,
            commands::kdeconnect_reply_conversation,
            commands::kdeconnect_request_conversation,
            commands::terminal::terminal_open,
            commands::terminal::terminal_write,
            commands::terminal::terminal_resize,
            commands::terminal::terminal_close,
            commands::phone_get_contacts,
            commands::phone_get_call_log,
            commands::kdeconnect_list_devices,
            commands::steamdeck_get_system_stats,
            commands::steamdeck_get_battery,
            commands::steamdeck_get_thermal,
            commands::steamdeck_get_disk,
            commands::steamdeck_get_network,
            commands::steamdeck_get_gpu,
            commands::steamdeck_launch_rustdesk,
            commands::steamdeck_get_deskflow_status,
            commands::ally_provision,
            commands::ally_launch_agent,
            commands::get_local_system_stats,
            commands::get_rest_service_health,
            commands::get_plex_identity,
            commands::get_plex_libraries,
            // Metrics: SQLite collector history (registered only in W6c-4 —
            // these were previously MISSING, so metricQuery/CollectAll all
            // failed silently with "command not found" at runtime).
            commands::metric_record,
            commands::metric_query,
            commands::metric_query_multi,
            commands::metric_collect_all,
            // Prometheus query path (W6c-4)
            commands::prom_query_range,
            commands::prometheus_health,
            // W6d Unified Alert Intake
            commands::poll_prometheus_alerts,
            commands::poll_meshcentral_status_changes,
            commands::poll_all_alert_sources,
            // W6 audit fix (2026-10-10): these 29 were DECLARED with
            // #[tauri::command] but NEVER registered here — every Alerts page,
            // Fleet Command, Compliance and MeshCentral IPC call failed at
            // runtime with "command not found" while all gates stayed green.
            // Never add a #[tauri::command] without also registering it;
            // tests/handler_parity.rs enforces this.
            commands::alert_list,
            commands::alert_get,
            commands::alert_create,
            commands::alert_delete,
            commands::alert_acknowledge,
            commands::alert_acknowledge_all,
            commands::alert_auto_ack_run,
            commands::meshcentral_list_devices,
            commands::meshcentral_get_device_status,
            commands::meshcentral_execute_batch,
            commands::meshcentral_get_terminal_url,
            commands::meshcentral_get_file_manager_url,
            commands::meshcentral_get_enrollment_info,
            commands::meshcentral_sync_fleet,
            commands::meshcentral_get_fleet_stats,
            commands::meshcentral_shell_exec,
            commands::meshcentral_shell_batch,
            commands::meshcentral_shell_fleet,
            commands::meshcentral_read_file,
            commands::meshcentral_write_file,
            commands::meshcentral_list_dir,
            commands::meshcentral_get_system_stats,
            commands::meshcentral_get_processes,
            commands::meshcentral_reboot,
            commands::meshcentral_shutdown,
            commands::meshcentral_docker_containers,
            commands::meshcentral_docker_start,
            commands::meshcentral_docker_stop,
            commands::meshcentral_docker_restart,
            // OpenCode chat panel (sidecar opencode serve)
            commands::opencode_chat::opencode_start,
            commands::opencode_chat::opencode_stop,
            commands::opencode_chat::opencode_status,
            commands::opencode_chat::opencode_new_session,
            commands::opencode_chat::opencode_send_message,
            commands::opencode_chat::opencode_get_history,
            commands::opencode_chat::opencode_abort,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
