//! End-to-end exercise of the MeshCentral stack: 8 API commands + transport
//! (shell/file/stats/processes/docker) + alert & metric stores — against the
//! real fleet. Destructive ops (reboot, shutdown, docker stop/restart) are
//! deliberately skipped.
//!
//! Usage: cargo run --example mc_e2e

use master_control_lib::commands::{
    alert_acknowledge, alert_create, alert_delete, alert_evaluate_auto_ack, alert_get,
    alert_list, metric_query, metric_query_multi, metric_record, AlertFilter,
};
use master_control_lib::config::{config_dir, load_servers_checked, DeviceType, MeshCentralConfig, ServerConfig};
use master_control_lib::meshcentral::{BatchCommand, MeshCentralClient, MeshCentralTransport};

struct Report {
    passed: usize,
    failed: usize,
    skipped: usize,
}

/// Run one future, print PASS/FAIL, return Some(value) on success.
macro_rules! step {
    ($rep:expr, $name:expr, $fut:expr) => {{
        match $fut.await {
            Ok(v) => {
                $rep.passed += 1;
                println!("  PASS  {}", $name);
                Some(v)
            }
            Err(e) => {
                $rep.failed += 1;
                println!("  FAIL  {}: {}", $name, e);
                None
            }
        }
    }};
}

/// Same config precedence as `commands::get_meshcentral_config` (private fn).
fn mc_config() -> MeshCentralConfig {
    let mut cfg = MeshCentralConfig {
        server_url: None,
        admin_user: None,
        admin_pass: None,
        group_id: None,
        group_name: None,
    };
    let path = config_dir().join("meshcentral.json");
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) {
            let s = |k: &str| v.get(k).and_then(|x| x.as_str()).map(String::from);
            if let Some(x) = s("server_url") { cfg.server_url = Some(x); }
            if let Some(x) = s("admin_user") { cfg.admin_user = Some(x); }
            if let Some(x) = s("admin_pass") { cfg.admin_pass = Some(x); }
            if let Some(x) = s("group_id") { cfg.group_id = Some(x); }
            if let Some(x) = s("group_name") { cfg.group_name = Some(x); }
        }
    }
    cfg
}

fn unraid_creds(servers: &[ServerConfig]) -> (String, String, String) {
    let unraid = servers
        .iter()
        .find(|s| s.device_type == DeviceType::Unraid)
        .expect("no Unraid in servers.json");
    (
        unraid.hostname.clone(),
        unraid.username.clone(),
        unraid.auth.get_password().unwrap_or_default(),
    )
}

#[tokio::main]
async fn main() {
    let mut rep = Report { passed: 0, failed: 0, skipped: 0 };
    let cfg = mc_config();

    // ── Config ─────────────────────────────────────────────────────
    println!("== config ==");
    let mut servers = match load_servers_checked() {
        Ok(s) => s,
        Err(e) => {
            println!("  FAIL  load_servers_checked: {e}");
            std::process::exit(1);
        }
    };
    rep.passed += 1;
    println!("  PASS  servers.json: {} servers", servers.len());

    // ── API commands (client) ──────────────────────────────────────
    println!("\n== MeshCentral API ==");
    let mut client = match MeshCentralClient::new(cfg.clone()) {
        Ok(c) => c,
        Err(e) => {
            println!("  FAIL  MeshCentralClient::new: {e}");
            std::process::exit(1);
        }
    };

    step!(rep, "authenticate", client.authenticate());

    let devices = step!(rep, "list_devices", client.list_devices());
    if let Some(d) = &devices {
        println!("        → {} devices", d.len());
        if d.is_empty() {
            rep.failed += 1;
            println!("  FAIL  list_devices returned zero devices");
        }
    }

    // Sync FIRST (writes meshcentral_device_id into servers.json — same
    // as the app's startup auto-sync), then pick the target from the
    // enriched list.
    let sync = step!(rep, "sync_to_servers_json", client.sync_to_servers_json(&mut servers));
    if let Some(s) = &sync {
        println!(
            "        → found={} matched={} new={} updated={} errors={}",
            s.devices_found, s.devices_matched, s.devices_new, s.devices_updated, s.errors.len()
        );
        for e in &s.errors {
            println!("        ! {e}");
        }
    }

    // Prove Fix A persistence: save the enriched list, reload from disk,
    // verify the stored ids survive a round-trip.
    let persisted = step!(rep, "sync persistence (save+reload)", async {
        master_control_lib::config::save_servers(&servers);
        let reloaded = master_control_lib::config::load_servers();
        let ids = reloaded
            .iter()
            .filter(|s| s.meshcentral_device_id.is_some())
            .count();
        if ids == 0 {
            Err::<usize, String>("no meshcentral_device_id persisted after save".into())
        } else {
            Ok(ids)
        }
    });
    if let Some(n) = persisted {
        println!("        → {n} servers with stored meshcentral_device_id");
    }

    let enrolled: Vec<ServerConfig> = servers
        .iter()
        .filter(|s| s.meshcentral_device_id.is_some())
        .cloned()
        .collect();
    let target = enrolled
        .iter()
        .find(|s| s.id == "slayers-server")
        .or_else(|| enrolled.first())
        .cloned();
    let Some(target) = target else {
        println!("  FAIL  no enrolled server with meshcentral_device_id after sync");
        std::process::exit(1);
    };
    let target_mc_id = target.meshcentral_device_id.clone().unwrap();
    println!(
        "  PASS  target: {} (mc id {}), fleet enrolled: {}",
        target.id, target_mc_id, enrolled.len()
    );

    step!(rep, "get_device_status", client.get_device_status(&target_mc_id));

    let term_url = step!(rep, "get_terminal_url", async { Ok::<_, String>(client.get_terminal_url(&target_mc_id)) });
    if let Some(u) = &term_url {
        if !u.contains("meshcentral") && !u.starts_with("https://") && !u.starts_with("http://") {
            rep.failed += 1;
            println!("  FAIL  terminal URL looks wrong: {u}");
        }
    }

    let fm_url = step!(rep, "get_file_manager_url", async { Ok::<_, String>(client.get_file_manager_url(&target_mc_id)) });
    if let Some(u) = &fm_url {
        if u.is_empty() {
            rep.failed += 1;
            println!("  FAIL  file manager URL empty");
        }
    }

    let enroll = step!(rep, "get_enrollment_info(linux)", async { Ok::<_, String>(client.get_enrollment_info("linux")) });
    if let Some(e) = &enroll {
        if e.install_command_linux.is_empty() {
            rep.failed += 1;
            println!("  FAIL  enrollment install command empty");
        }
    }

    // Batch via SSH (read-only command)
    let (uhost, uuser, upass) = unraid_creds(&servers);
    let batch_cmds = vec![BatchCommand { command: "echo batch-ok".to_string(), args: None }];
    let device_ids = vec![target_mc_id.clone()];
    let batch = step!(
        rep,
        "execute_batch_via_ssh",
        client.execute_batch_via_ssh(&uhost, &uuser, &upass, &device_ids, &batch_cmds)
    );
    if let Some(res) = &batch {
        if res.is_empty() {
            rep.failed += 1;
            println!("  FAIL  batch returned no results");
        } else {
            println!("        → success={} out={}", res[0].success, res[0].output.trim());
        }
    }

    // ── Transport (shell / files / stats / docker) ─────────────────
    println!("\n== MeshCentral transport ==");
    let transport = MeshCentralTransport::new(cfg);

    // Single shell
    let shell = step!(
        rep,
        "execute_shell",
        transport.execute_shell(&target, "echo mc-e2e-ok", Some(30))
    );
    if let Some(r) = &shell {
        println!("        → exit={} stdout={}", r.exit_code, r.stdout.trim());
        if !r.stdout.contains("mc-e2e-ok") {
            rep.failed += 1;
            println!("  FAIL  shell output missing expected token");
        }
    }

    // Batch shell
    let batch_shell = step!(
        rep,
        "execute_shell_batch (hostname, whoami)",
        transport.execute_shell_batch(&target, &["hostname", "whoami"], Some(30))
    );
    if let Some(rs) = &batch_shell {
        println!("        → {} results, {} ok", rs.len(), rs.iter().filter(|r| r.success).count());
        if rs.len() != 2 {
            rep.failed += 1;
            println!("  FAIL  expected 2 batch results");
        }
    }

    // Fleet shell (all enrolled devices, parallel)
    let fleet = step!(
        rep,
        "execute_shell_on_devices (fleet echo)",
        transport.execute_shell_on_devices(&enrolled, "echo fleet-ok", Some(30))
    );
    if let Some(rs) = &fleet {
        let ok = rs.iter().filter(|r| r.success).count();
        println!("        → {ok}/{} devices responded", rs.len());
    }

    // File read
    step!(rep, "read_file(/etc/os-release)", transport.read_file(&target, "/etc/os-release"));

    // File write + read-back + cleanup
    step!(
        rep,
        "write_file(/tmp/mc-e2e.txt)",
        transport.write_file(&target, "/tmp/mc-e2e.txt", "hello-mc-e2e", Some(0o644))
    );
    let back = step!(
        rep,
        "read_file back (/tmp/mc-e2e.txt)",
        transport.read_file(&target, "/tmp/mc-e2e.txt")
    );
    if let Some(c) = &back {
        if !c.contains("hello-mc-e2e") {
            rep.failed += 1;
            println!("  FAIL  read-back content mismatch: {c:?}");
        }
    }
    let _ = transport.execute_shell(&target, "rm -f /tmp/mc-e2e.txt", Some(15)).await;

    // List dir
    let files = step!(rep, "list_dir(/tmp)", transport.list_dir(&target, "/tmp"));
    if let Some(f) = &files {
        println!("        → {} entries", f.len());
    }

    // System stats
    let stats = step!(rep, "get_system_stats", transport.get_system_stats(&target));
    if let Some(s) = &stats {
        println!(
            "        → {} | {} | cpu={:.0}% mem={:.0}% uptime={}",
            s.hostname, s.platform, s.cpu_usage, s.memory_usage_pct, s.uptime
        );
    }

    // Processes
    let procs = step!(rep, "get_processes(limit 10)", transport.get_processes(&target, Some(10)));
    if let Some(p) = &procs {
        println!("        → {} processes, top={:?}", p.len(), p.first().map(|x| x.name.clone()));
    }

    // Docker (read-only)
    let containers = step!(rep, "get_docker_containers", transport.get_docker_containers(&target));
    if let Some(cs) = &containers {
        println!("        → {} containers", cs.len());
        // docker_start on an already-running container is a safe no-op —
        // covers the start code path without changing anything.
        let running = cs.iter().find(|c| {
            c["State"].as_str() == Some("running") || c["state"].as_str() == Some("running")
        });
        if let Some(c) = running {
            let name = c["Names"]
                .as_str()
                .or_else(|| c["names"].as_str())
                .unwrap_or("")
                .trim_start_matches('/')
                .to_string();
            let name = if name.is_empty() {
                c["ID"].as_str().or_else(|| c["id"].as_str()).unwrap_or("").to_string()
            } else {
                name
            };
            if !name.is_empty() {
                step!(rep, format!("docker_start(no-op on running '{name}')"), transport.docker_start(&target, &name));
            }
        } else {
            rep.skipped += 1;
            println!("  SKIP  docker_start (no running container found)");
        }
    }

    rep.skipped += 4;
    println!("  SKIP  reboot / shutdown / docker_stop / docker_restart (destructive)");

    // ── Alerts (SQLite) ────────────────────────────────────────────
    println!("\n== alert store ==");
    let created = step!(
        rep,
        "alert_create",
        alert_create(
            "info".to_string(),
            "mc e2e probe".to_string(),
            "temporary alert created by mc_e2e example".to_string(),
            Some("__e2e__".to_string()),
            "manual".to_string(),
            None,
        )
    );
    if let Some(a) = &created {
        let id = a.id.expect("alert_create returned no id");
        let got = step!(rep, "alert_get", async { alert_get(id).await });
        if let Some(g) = &got {
            if g.title != "mc e2e probe" {
                rep.failed += 1;
                println!("  FAIL  alert_get title mismatch: {}", g.title);
            }
        }
        let listed = step!(rep, "alert_list(filter severity=info)", async {
            alert_list(Some(AlertFilter {
                severity: Some("info".to_string()),
                ..Default::default()
            }))
            .await
        });
        if let Some(l) = &listed {
            println!("        → {} info alerts", l.len());
        }
        step!(rep, "alert_acknowledge", async { alert_acknowledge(id, "e2e".to_string()).await });
        step!(rep, "alert_evaluate_auto_ack", async { alert_evaluate_auto_ack().await });
        step!(rep, "alert_delete (cleanup)", async { alert_delete(id).await });
    }

    // ── Metrics (SQLite) ───────────────────────────────────────────
    println!("\n== metric store ==");
    step!(rep, "metric_record", async { metric_record("__e2e__".to_string(), "cpu".to_string(), 42.0).await });
    let from = (chrono::Utc::now() - chrono::Duration::minutes(5)).to_rfc3339();
    let pts = step!(rep, "metric_query", async {
        metric_query("__e2e__".to_string(), "cpu".to_string(), from.clone(), None, Some(10)).await
    });
    if let Some(p) = &pts {
        println!("        → {} points", p.len());
        if p.is_empty() {
            rep.failed += 1;
            println!("  FAIL  metric_query returned zero points after record");
        }
    }
    let multi = step!(rep, "metric_query_multi", async {
        metric_query_multi(vec!["__e2e__".to_string()], vec!["cpu".to_string()], from.clone(), None).await
    });
    if let Some(m) = &multi {
        println!("        → {} series", m.len());
    }
    println!("        (note: __e2e__ metric row kept — invisible to real-device charts)");

    // ── Summary ────────────────────────────────────────────────────
    println!(
        "\n== RESULT: {} passed, {} failed, {} skipped ==",
        rep.passed, rep.failed, rep.skipped
    );
    if rep.failed > 0 {
        std::process::exit(1);
    }
}
