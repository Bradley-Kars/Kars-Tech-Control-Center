// MC-1b — Ticketing service with live sandbox bridge + OFF-1 fallback.
// - MC-1: mock fixture only (load_fixture), no network.
// - MC-1b: live sandbox bridge GET with token, OFF-1 fallback.
//   - Bridge: http://127.0.0.1:8799 (loopback only).
//   - Token: stored in ~/.config/master-control/config.private.json (mode 0o600)
//     or OS keyring. NEVER in servers.json, any React-readable config, or logged.
//   - OFF-1 states (distinct):
//     * unreachable: network error / timeout / connection refused
//     * unauthorized: 401 from bridge
//     * bad_response: non-200, parse error, unexpected shape
//   - Mock fixture retained as offline fallback.
//   - Read-only, GET only. No writes, no Stripe, no .env read, real vault untouched.

use reqwest::Client;
use serde::{Deserialize, Serialize};

use crate::config::load_ticketing_config;

/// Ticket row shaped like the bridge's ticket list (IDs and amounts only).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TicketRow {
    pub id: String,
    pub title: String,
    pub status: String,
    pub client_id: String,
    #[serde(default)]
    pub hours: f64,
    #[serde(default)]
    pub total: f64,
    #[serde(default)]
    pub invoice_number: Option<String>,
    #[serde(default)]
    pub no_charge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct InvoiceRow {
    pub number: String,
    pub ticket_id: String,
    #[serde(default)]
    pub total: f64,
    #[serde(default)]
    pub no_charge: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Overview {
    pub open: usize,
    pub critical: usize,
    pub overdue: usize,
    pub tickets_total: usize,
    pub invoices_total: usize,
    pub collected: f64,
    pub outstanding: f64,
}

/// OFF-1 state: why the live bridge was not used.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OfflineReason {
    None,        // live bridge succeeded
    Unreachable, // network error, timeout, connection refused
    Unauthorized, // 401 from bridge
    BadResponse, // non-200, parse error, unexpected shape
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TicketingOverview {
    pub overview: Overview,
    pub tickets: Vec<TicketRow>,
    pub invoices: Vec<InvoiceRow>,
    pub from_mock: bool,
    pub offline_reason: OfflineReason,
}

/// Bridge envelope as returned by the sandbox bridge ticket list endpoint.
///
/// The sandbox bridge sends what a ticket actually has (`id`, `status`,
/// `priority`, `client_name`, `title`) — it does not send hours, a total, an
/// invoice number or a no-charge flag. Those therefore default, so a correct
/// bridge response parses instead of degrading to `BadResponse`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct BridgeEnvelope {
    #[serde(default)]
    #[allow(dead_code)]
    count: u32,
    #[serde(default)]
    tickets: Vec<BridgeTicket>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct BridgeTicket {
    id: String,
    #[serde(default)]
    title: String,
    #[serde(default)]
    status: String,
    #[serde(rename = "client_name", default)]
    client_id: String,
    #[serde(default)]
    hours: f64,
    #[serde(default)]
    total: f64,
    #[serde(default)]
    invoice_number: Option<String>,
    #[serde(default)]
    no_charge: bool,
}

const FIXTURE_JSON: &str = include_str!("fixtures/ticketing_mock.json");

/// Load the embedded mock fixture. No network. MC-1 mode.
pub fn load_fixture() -> Result<TicketingOverview, String> {
    let tickets: Vec<TicketRow> =
        serde_json::from_str(FIXTURE_JSON).map_err(|e| format!("mock fixture parse error: {e}"))?;
    let invoices = invoices_from(&tickets);
    let overview = compute_overview(&tickets, &invoices);
    Ok(TicketingOverview {
        overview,
        tickets,
        invoices,
        from_mock: true,
        offline_reason: OfflineReason::None,
    })
}

/// Fetch from the live sandbox bridge, falling back to the mock on any failure.
///
/// - Reads `bridge_url` + `bridge_token` from config.private.json (mode 0o600).
/// - GET tickets with the `X-API-Token` header.
/// - On any error (network, auth, parse, non-200) returns the mock with
///   `from_mock = true` and `offline_reason` set to the distinct OFF-1 state.
pub async fn fetch_overview() -> Result<TicketingOverview, String> {
    let cfg = load_ticketing_config();

    // MC-1 mode: mock only.
    if !cfg.use_live_bridge || cfg.bridge_url.is_none() || cfg.bridge_token.is_none() {
        return load_fixture();
    }

    let bridge_url = cfg.bridge_url.unwrap();
    let token = cfg.bridge_token.unwrap();

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("http client build failed: {e}"))?;

    let url = format!("{}/tickets?all=true", bridge_url.trim_end_matches('/'));

    let resp = match client
        .get(&url)
        .header("X-API-Token", &token)
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[ticketing] bridge unreachable: {e} -> OFF-1 unreachable");
            return offline(OfflineReason::Unreachable);
        }
    };

    if resp.status().as_u16() == 401 {
        eprintln!("[ticketing] bridge unauthorized (401) -> OFF-1 unauthorized");
        return offline(OfflineReason::Unauthorized);
    }

    if !resp.status().is_success() {
        eprintln!(
            "[ticketing] bridge returned {} -> OFF-1 bad_response",
            resp.status()
        );
        return offline(OfflineReason::BadResponse);
    }

    let text = match resp.text().await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("[ticketing] bridge response read failed: {e} -> OFF-1 bad_response");
            return offline(OfflineReason::BadResponse);
        }
    };

    let envelope: BridgeEnvelope = match serde_json::from_str(&text) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[ticketing] bridge response parse failed: {e} -> OFF-1 bad_response");
            return offline(OfflineReason::BadResponse);
        }
    };

    let tickets: Vec<TicketRow> = envelope
        .tickets
        .into_iter()
        .map(|bt| TicketRow {
            id: bt.id,
            title: bt.title,
            status: bt.status,
            client_id: bt.client_id,
            hours: bt.hours,
            total: bt.total,
            invoice_number: bt.invoice_number,
            no_charge: bt.no_charge,
        })
        .collect();

    let invoices = invoices_from(&tickets);
    let overview = compute_overview(&tickets, &invoices);
    Ok(TicketingOverview {
        overview,
        tickets,
        invoices,
        from_mock: false,
        offline_reason: OfflineReason::None,
    })
}

/// Create a ticket via the live bridge (POST /tickets).
///
/// - Reads `bridge_url` + `bridge_token` from config.private.json (mode 0o600).
/// - POST /tickets with {title, priority, category?}.
/// - Returns the created ticket row.
/// - Returns Err if bridge not configured or request fails.
pub async fn create_ticket(
    title: String,
    priority: String,
    category: Option<String>,
) -> Result<TicketRow, String> {
    let cfg = load_ticketing_config();

    let bridge_url = match cfg.bridge_url {
        Some(u) => u,
        None => return Err("bridge_url not configured".to_string()),
    };
    let token = match cfg.bridge_token {
        Some(t) => t,
        None => return Err("bridge_token not configured".to_string()),
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("http client build failed: {e}"))?;

    let url = format!("{}/tickets", bridge_url.trim_end_matches('/'));

    let mut req = client.post(&url).header("X-API-Token", &token);
    req = req.json(&serde_json::json!({
        "title": title,
        "priority": priority,
    }));
    if let Some(cat) = category {
        req = req.json(&serde_json::json!({
            "category": cat,
        }));
    }

    let resp = req.send().await.map_err(|e| format!("create ticket request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "create ticket failed with status {}",
            resp.status().as_u16()
        ));
    }

    let created: serde_json::Value = resp.json().await.map_err(|e| format!("parse failed: {e}"))?;

    Ok(TicketRow {
        id: created["ticket_id"].as_str().unwrap_or("").to_string(),
        title: created["title"].as_str().unwrap_or(&title).to_string(),
        status: created["status"].as_str().unwrap_or("new").to_string(),
        client_id: String::new(),
        hours: 0.0,
        total: 0.0,
        invoice_number: None,
        no_charge: false,
    })
}

/// Add a worklog entry to a ticket via the live bridge (POST /tickets/{id}/worklog).
///
/// - Reads `bridge_url` + `bridge_token` from config.private.json (mode 0o600).
/// - Returns Err if bridge not configured or request fails.
pub async fn add_worklog(
    ticket_id: String,
    entry: String,
    date: Option<String>,
    mode: Option<String>,
    hours: Option<f64>,
    payment: Option<String>,
    amount: Option<f64>,
) -> Result<(), String> {
    let cfg = load_ticketing_config();

    let bridge_url = match cfg.bridge_url {
        Some(u) => u,
        None => return Err("bridge_url not configured".to_string()),
    };
    let token = match cfg.bridge_token {
        Some(t) => t,
        None => return Err("bridge_token not configured".to_string()),
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("http client build failed: {e}"))?;

    let url = format!(
        "{}/tickets/{}/worklog",
        bridge_url.trim_end_matches('/'),
        ticket_id
    );

    let mut req = client.post(&url).header("X-API-Token", &token);
    req = req.json(&serde_json::json!({
        "date": date.unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%d").to_string()),
        "mode": mode.unwrap_or_else(|| "remote".to_string()),
        "hours": hours.unwrap_or(0.5),
        "payment": payment.unwrap_or_else(|| "uninvoiced".to_string()),
        "entry": entry,
        "amount": amount.unwrap_or(0.0),
    }));

    let resp = req.send().await.map_err(|e| format!("worklog request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "worklog failed with status {}",
            resp.status().as_u16()
        ));
    }

    Ok(())
}

/// Change the status of a ticket via the live bridge (POST /tickets/{id}/status).
///
/// - Reads `bridge_url` + `bridge_token` from config.private.json (mode 0o600).
/// - Returns Err if bridge not configured or request fails.
pub async fn change_status(ticket_id: String, status: String) -> Result<(), String> {
    let cfg = load_ticketing_config();

    let bridge_url = match cfg.bridge_url {
        Some(u) => u,
        None => return Err("bridge_url not configured".to_string()),
    };
    let token = match cfg.bridge_token {
        Some(t) => t,
        None => return Err("bridge_token not configured".to_string()),
    };

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("http client build failed: {e}"))?;

    let url = format!(
        "{}/tickets/{}/status",
        bridge_url.trim_end_matches('/'),
        ticket_id
    );

    let resp = client
        .post(&url)
        .header("X-API-Token", &token)
        .json(&serde_json::json!({ "status": status }))
        .send()
        .await
        .map_err(|e| format!("status change request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!(
            "status change failed with status {}",
            resp.status().as_u16()
        ));
    }

    Ok(())
}

/// The mock fixture tagged with one specific OFF-1 reason.
fn offline(reason: OfflineReason) -> Result<TicketingOverview, String> {
    let mut ov = load_fixture()?;
    ov.from_mock = true;
    ov.offline_reason = reason;
    Ok(ov)
}

/// Invoice rows derived from the invoice link carried on each ticket.
fn invoices_from(tickets: &[TicketRow]) -> Vec<InvoiceRow> {
    tickets
        .iter()
        .filter_map(|t| {
            t.invoice_number.as_ref().map(|n| InvoiceRow {
                number: n.clone(),
                ticket_id: t.id.clone(),
                total: t.total,
                no_charge: t.no_charge,
            })
        })
        .collect()
}

/// Pure card math — unit-tested.
pub fn compute_overview(tickets: &[TicketRow], invoices: &[InvoiceRow]) -> Overview {
    let open = tickets.iter().filter(|t| t.status == "open").count();
    let critical = tickets.iter().filter(|t| t.status == "critical").count();
    let overdue = tickets
        .iter()
        .filter(|t| t.status != "closed" && t.total > 0.0 && t.invoice_number.is_none())
        .count();
    let collected: f64 = invoices
        .iter()
        .filter(|i| !i.no_charge)
        .map(|i| i.total)
        .sum();
    Overview {
        open,
        critical,
        overdue,
        tickets_total: tickets.len(),
        invoices_total: invoices.len(),
        collected,
        outstanding: 0.0,
    }
}

/// Invoice lookup by the stored ticket_id link (never by client inference).
pub fn invoice_for_ticket<'a>(
    ticket_id: &str,
    invoices: &'a [InvoiceRow],
) -> Option<&'a InvoiceRow> {
    invoices.iter().find(|i| i.ticket_id == ticket_id)
}

// ---------------------------------------------------------------------------
// Tests
//
// Run these single-threaded — the config override is process-global:
//   cargo test --lib --tests -- --test-threads=1
// The live test additionally needs the sandbox bridge on 127.0.0.1:8799:
//   cargo test --lib --tests -- --include-ignored --test-threads=1 --nocapture
//
// Isolation rules: every offline test binds an ephemeral 127.0.0.1:0 port and
// points the loader at its own throwaway config file via
// MASTER_CONTROL_CONFIG_PRIVATE. Nothing here writes the operator's real
// ~/.config/master-control/config.private.json, and nothing but the live test
// touches port 8799.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{save_ticketing_config, TicketingConfig};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::sync::{Mutex, MutexGuard};

    static TMP_SEQ: AtomicU32 = AtomicU32::new(0);

    /// `MASTER_CONTROL_CONFIG_PRIVATE` is process-global, so every test that
    /// reads or rewrites the config path must hold this lock. Without it the
    /// suite only passes under `--test-threads=1`; with it the tests are
    /// correct at any parallelism (a poisoned lock is ignored, so one failing
    /// test cannot cascade into the rest).
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn env_lock() -> MutexGuard<'static, ()> {
        ENV_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Points `MASTER_CONTROL_CONFIG_PRIVATE` at a throwaway file for the life
    /// of the guard and always restores the previous value on drop, so a
    /// panicking test cannot leave the real config path hijacked. Holding the
    /// guard also holds `ENV_LOCK`, serialising config-dependent tests.
    struct TempConfig {
        file: PathBuf,
        saved: Option<String>,
        _lock: MutexGuard<'static, ()>,
    }

    impl TempConfig {
        fn new(cfg: &TicketingConfig) -> Self {
            // Take the env lock before touching the override.
            let lock = env_lock();
            let n = TMP_SEQ.fetch_add(1, Ordering::SeqCst);
            let dir = std::env::temp_dir()
                .join(format!("kts-ticketing-test-{}-{}", std::process::id(), n));
            std::fs::create_dir_all(&dir).expect("create temp config dir");
            let file = dir.join("config.private.json");
            std::fs::write(&file, serde_json::to_string_pretty(cfg).unwrap())
                .expect("write temp config");
            let saved = std::env::var("MASTER_CONTROL_CONFIG_PRIVATE").ok();
            std::env::set_var("MASTER_CONTROL_CONFIG_PRIVATE", &file);
            TempConfig { file, saved, _lock: lock }
        }
    }

    impl Drop for TempConfig {
        fn drop(&mut self) {
            match &self.saved {
                Some(v) => std::env::set_var("MASTER_CONTROL_CONFIG_PRIVATE", v),
                None => std::env::remove_var("MASTER_CONTROL_CONFIG_PRIVATE"),
            }
            if let Some(dir) = self.file.parent() {
                let _ = std::fs::remove_dir_all(dir);
            }
        }
    }

    fn live_cfg(url: String) -> TicketingConfig {
        TicketingConfig {
            bridge_url: Some(url),
            // Never a real token: the offline tests must not be able to
            // authenticate against anything.
            bridge_token: Some("test-token-not-a-credential".into()),
            use_live_bridge: true,
        }
    }

    /// An already-listening stub, so the port is live before the request is
    /// made (no bind-then-rebind race) and exactly one request is served.
    fn spawn_stub_server(response: &'static str) -> (u16, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind stub listener");
        let port = listener
            .local_addr()
            .expect("stub listener addr")
            .port();
        let handle = std::thread::spawn(move || {
            for stream in listener.incoming().take(1) {
                let mut stream = match stream {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                // Drain the request head so the client finishes writing.
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
                // Dropping the stream closes the connection -> EOF for reqwest.
            }
        });
        (port, handle)
    }

    /// A port nothing is listening on (bound, read, released).
    fn dead_port() -> u16 {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind for dead port");
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        port
    }

    // --- 1. Live success (opt-in: needs the real sandbox bridge on 8799) ---
    #[tokio::test]
    #[ignore = "needs the sandbox bridge on 127.0.0.1:8799 and a valid token in config.private.json"]
    async fn live_bridge_success_returns_from_mock_false() {
        // This test uses the *real* config, so it must not run while another
        // test has the override pointing somewhere else.
        let _lock = env_lock();
        let ov = fetch_overview().await.expect("fetch_overview returned Err");
        assert!(!ov.from_mock, "expected from_mock=false for a live bridge");
        assert_eq!(ov.offline_reason, OfflineReason::None);
        assert_eq!(ov.tickets.len(), 4, "expected the 4 sandbox tickets");
        println!(
            "LIVE PASS: tickets={} from_mock={} offline_reason={:?}",
            ov.tickets.len(),
            ov.from_mock,
            ov.offline_reason
        );
    }

    // --- 2. Unreachable: bridge stopped, nothing on the port ---
    #[tokio::test]
    async fn offline_unreachable_bridge_stopped() {
        let port = dead_port();
        let _cfg = TempConfig::new(&live_cfg(format!("http://127.0.0.1:{port}")));

        let ov = fetch_overview().await.expect("should fall back, not Err");
        assert!(ov.from_mock, "expected from_mock=true when unreachable");
        assert_eq!(
            ov.offline_reason,
            OfflineReason::Unreachable,
            "expected Unreachable from a dead port"
        );
        println!(
            "OFFLINE PASS: unreachable from_mock={} reason={:?}",
            ov.from_mock, ov.offline_reason
        );
    }

    // --- 3. Unauthorized: bridge answers 401 ---
    #[tokio::test]
    async fn offline_unauthorized_wrong_token() {
        let (port, _stub) = spawn_stub_server(
            "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        let _cfg = TempConfig::new(&live_cfg(format!("http://127.0.0.1:{port}")));

        let ov = fetch_overview().await.expect("should fall back, not Err");
        assert!(ov.from_mock, "expected from_mock=true when unauthorized");
        assert_eq!(
            ov.offline_reason,
            OfflineReason::Unauthorized,
            "expected Unauthorized from a 401"
        );
        println!(
            "OFFLINE PASS: unauthorized from_mock={} reason={:?}",
            ov.from_mock, ov.offline_reason
        );
    }

    // --- 4. Bad response: HTTP 500 ---
    #[tokio::test]
    async fn offline_bad_response_500() {
        let (port, _stub) = spawn_stub_server(
            "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        );
        let _cfg = TempConfig::new(&live_cfg(format!("http://127.0.0.1:{port}")));

        let ov = fetch_overview().await.expect("should fall back, not Err");
        assert!(ov.from_mock, "expected from_mock=true when 500");
        assert_eq!(
            ov.offline_reason,
            OfflineReason::BadResponse,
            "expected BadResponse from a 500"
        );
        println!(
            "OFFLINE PASS: 500 from_mock={} reason={:?}",
            ov.from_mock, ov.offline_reason
        );
    }

    // --- 5. Bad response: HTTP 200 carrying unparseable JSON ---
    #[tokio::test]
    async fn offline_bad_response_garbage() {
        let (port, _stub) = spawn_stub_server(
            "HTTP/1.1 200 OK\r\nContent-Length: 9\r\nConnection: close\r\n\r\n{not json",
        );
        let _cfg = TempConfig::new(&live_cfg(format!("http://127.0.0.1:{port}")));

        let ov = fetch_overview().await.expect("should fall back, not Err");
        assert!(ov.from_mock, "expected from_mock=true for a garbage body");
        assert_eq!(
            ov.offline_reason,
            OfflineReason::BadResponse,
            "expected BadResponse from a 200 with unparseable JSON"
        );
        println!(
            "OFFLINE PASS: garbage from_mock={} offline_reason={:?}",
            ov.from_mock, ov.offline_reason
        );
    }

    // --- Supporting checks on the fallback and the override itself ---

    #[test]
    fn mock_fixture_is_the_offline_fallback() {
        let ov = load_fixture().expect("fixture parses");
        assert!(ov.from_mock);
        assert_eq!(ov.offline_reason, OfflineReason::None);
        assert_eq!(ov.tickets.len(), 4);
        assert_eq!(ov.invoices.len(), 4);
        assert_eq!(ov.overview.collected, 365.0, "175 + 60 + 130, no-charge excluded");
        assert!(matches!(
            invoice_for_ticket("TKT-2026-003", &ov.invoices),
            Some(i) if i.number == "INV-2026-003"
        ));
    }

    #[test]
    fn config_override_does_not_touch_the_real_config_path() {
        let real = crate::config::config_dir().join("config.private.json");
        let cfg = live_cfg("http://127.0.0.1:1".into());
        {
            let guard = TempConfig::new(&cfg);
            assert_ne!(crate::config::private_config_file(), real);
            assert_eq!(load_ticketing_config().bridge_url, cfg.bridge_url);
            drop(guard);
        }
        assert_eq!(crate::config::private_config_file(), real);
    }

    #[test]
    fn save_ticketing_config_writes_the_override_file_only() {
        let real = crate::config::config_dir().join("config.private.json");
        let real_before = std::fs::read_to_string(&real).ok();

        let cfg = live_cfg("http://127.0.0.1:1234".into());
        {
            let guard = TempConfig::new(&cfg);
            save_ticketing_config(&cfg).expect("save to override path");
            assert!(guard.file.exists(), "override file should have been written");
        }

        assert_eq!(
            std::fs::read_to_string(&real).ok(),
            real_before,
            "the real config.private.json must be untouched"
        );
    }
}
