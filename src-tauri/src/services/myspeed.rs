use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::config::ServerConfig;
use crate::ssh::SshConnection;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySpeedConfig {
    pub db_path: String,
    pub api_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySpeedTest {
    pub id: i64,
    pub timestamp: String,
    pub download: f64,
    pub upload: f64,
    pub ping: f64,
    pub jitter: Option<f64>,
    pub server_id: Option<i64>,
    pub server_name: Option<String>,
    pub server_location: Option<String>,
    pub server_country: Option<String>,
    pub server_host: Option<String>,
    pub client_ip: Option<String>,
    pub client_isp: Option<String>,
    pub client_country: Option<String>,
    pub result_id: Option<String>,
    pub result_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySpeedServer {
    pub id: i64,
    pub name: String,
    pub location: String,
    pub country: String,
    pub host: String,
    pub port: i32,
    pub secure: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySpeedStats {
    pub total_tests: i64,
    pub avg_download: f64,
    pub avg_upload: f64,
    pub avg_ping: f64,
    pub max_download: f64,
    pub max_upload: f64,
    pub min_ping: f64,
    pub latest_test: Option<MySpeedTest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MySpeedSummary {
    pub stats: MySpeedStats,
    pub recent_tests: Vec<MySpeedTest>,
    pub servers: Vec<MySpeedServer>,
}

pub struct MySpeedClient {
    config: MySpeedConfig,
    server_config: ServerConfig,
}

impl MySpeedClient {
    pub fn new(config: MySpeedConfig, server_config: ServerConfig) -> Result<Self> {
        Ok(Self {
            config,
            server_config,
        })
    }

    fn exec_sql(&self, sql: &str) -> Result<String> {
        let conn =
            SshConnection::connect(&self.server_config).context("SSH connect for MySpeed")?;
        let cmd = format!(
            "sqlite3 {} \"{}\"",
            self.config.db_path,
            sql.replace('"', "\\\"")
        );
        let output = conn.exec(&cmd).context("Execute sqlite3 via SSH")?;
        Ok(output)
    }

    pub async fn get_summary(&self, limit: Option<u32>) -> Result<MySpeedSummary> {
        let stats_output = self.exec_sql(
            "SELECT COUNT(*), AVG(download), AVG(upload), AVG(ping), MAX(download), MAX(upload), MIN(CASE WHEN ping >= 0 THEN ping ELSE NULL END) FROM speedtests"
        )?;

        let parts: Vec<&str> = stats_output.trim().split('|').collect();
        let total_tests = parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0);
        let avg_download = parts.get(1).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);
        let avg_upload = parts.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);
        let avg_ping = parts.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);
        let max_download = parts.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);
        let max_upload = parts.get(5).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);
        let min_ping = parts.get(6).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0);

        let limit = limit.unwrap_or(50);
        let tests_output = self.exec_sql(&format!(
            "SELECT id, created, download, upload, ping, serverId, resultId FROM speedtests ORDER BY id DESC LIMIT {}",
            limit
        ))?;

        let recent_tests: Vec<MySpeedTest> = tests_output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let p: Vec<&str> = line.split('|').collect();
                MySpeedTest {
                    id: p.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                    timestamp: p.get(1).unwrap_or(&"").to_string(),
                    download: p.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    upload: p.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    ping: p.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    jitter: None,
                    server_id: p.get(5).and_then(|v| v.parse::<i64>().ok()),
                    server_name: None,
                    server_location: None,
                    server_country: None,
                    server_host: None,
                    client_ip: None,
                    client_isp: None,
                    client_country: None,
                    result_id: p.get(6).and_then(|v| {
                        if v.is_empty() {
                            None
                        } else {
                            Some(v.to_string())
                        }
                    }),
                    result_url: None,
                }
            })
            .collect();

        let latest = recent_tests.first().cloned();
        let servers = self.get_servers().await.unwrap_or_default();

        Ok(MySpeedSummary {
            stats: MySpeedStats {
                total_tests,
                avg_download,
                avg_upload,
                avg_ping,
                max_download,
                max_upload,
                min_ping,
                latest_test: latest,
            },
            recent_tests,
            servers,
        })
    }

    pub async fn get_recent_tests(&self, limit: u32) -> Result<Vec<MySpeedTest>> {
        let output = self.exec_sql(&format!(
            "SELECT id, created, download, upload, ping, serverId, resultId FROM speedtests ORDER BY id DESC LIMIT {}",
            limit
        ))?;

        let tests = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let p: Vec<&str> = line.split('|').collect();
                MySpeedTest {
                    id: p.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                    timestamp: p.get(1).unwrap_or(&"").to_string(),
                    download: p.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    upload: p.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    ping: p.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
                    jitter: None,
                    server_id: p.get(5).and_then(|v| v.parse::<i64>().ok()),
                    server_name: None,
                    server_location: None,
                    server_country: None,
                    server_host: None,
                    client_ip: None,
                    client_isp: None,
                    client_country: None,
                    result_id: p.get(6).and_then(|v| {
                        if v.is_empty() {
                            None
                        } else {
                            Some(v.to_string())
                        }
                    }),
                    result_url: None,
                }
            })
            .collect();

        Ok(tests)
    }

    pub async fn get_servers(&self) -> Result<Vec<MySpeedServer>> {
        let output = self.exec_sql(
            "SELECT id, name, url, '' as location, '' as country, 0 as port, 0 as secure FROM nodes ORDER BY name"
        )?;

        let servers = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|line| {
                let p: Vec<&str> = line.split('|').collect();
                MySpeedServer {
                    id: p.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
                    name: p.get(1).unwrap_or(&"").to_string(),
                    host: p.get(2).unwrap_or(&"").to_string(),
                    location: p.get(3).unwrap_or(&"").to_string(),
                    country: p.get(4).unwrap_or(&"").to_string(),
                    port: p.get(5).unwrap_or(&"0").parse::<i32>().unwrap_or(0),
                    secure: p.get(6).unwrap_or(&"0").parse::<bool>().unwrap_or(false),
                }
            })
            .collect();

        Ok(servers)
    }

    pub async fn get_stats(&self) -> Result<MySpeedStats> {
        let output = self.exec_sql(
            "SELECT COUNT(*), AVG(download), AVG(upload), AVG(ping), MAX(download), MAX(upload), MIN(CASE WHEN ping >= 0 THEN ping ELSE NULL END) FROM speedtests"
        )?;

        let parts: Vec<&str> = output.trim().split('|').collect();
        Ok(MySpeedStats {
            total_tests: parts.first().unwrap_or(&"0").parse::<i64>().unwrap_or(0),
            avg_download: parts.get(1).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            avg_upload: parts.get(2).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            avg_ping: parts.get(3).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            max_download: parts.get(4).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            max_upload: parts.get(5).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            min_ping: parts.get(6).unwrap_or(&"0").parse::<f64>().unwrap_or(0.0),
            latest_test: None,
        })
    }
}
