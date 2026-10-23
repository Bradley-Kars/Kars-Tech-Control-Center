//! End-to-end exercise of the embedded SSH terminal PTY path against the
//! real Unraid server: connect → PTY → shell → nonblocking read/write loop
//! (mirrors commands/terminal.rs, minus the Tauri Channel which needs a
//! webview) → command round-trip → clean close with exit status.
//!
//! Usage: cargo run --example term_e2e

use std::io::{Read, Write};
use std::thread;
use std::time::{Duration, Instant};

use master_control_lib::config::load_servers_checked;
use master_control_lib::ssh::SshConnection;

/// Run every step; return (passed, failed). `ok!` aborts the run on Err.
fn run() -> (usize, usize) {
    let mut passed = 0usize;
    let mut failed = 0usize;

    macro_rules! ok {
        ($name:expr, $result:expr) => {
            match $result {
                Ok(v) => {
                    passed += 1;
                    println!("  PASS  {}", $name);
                    v
                }
                Err(e) => {
                    failed += 1;
                    println!("  FAIL  {}: {}", $name, e);
                    return (passed, failed);
                }
            }
        };
    }

    // 1. Config
    let servers = ok!("load servers.json", load_servers_checked());
    let config = ok!(
        "find slayers-server (unraid)",
        servers
            .iter()
            .find(|s| s.id == "slayers-server")
            .cloned()
            .ok_or_else(|| "slayers-server not found".to_string())
    );
    println!("       target: {}@{}", config.username, config.hostname);

    // 2. Blocking setup (same as terminal_thread setup phase)
    let conn = ok!("ssh connect", SshConnection::connect(&config));
    let session = conn.into_session();
    let mut channel = ok!("channel_session", session.channel_session());
    ok!(
        "request_pty xterm-256color 100x30",
        channel.request_pty("xterm-256color", None, Some((100, 30, 0, 0)))
    );
    ok!("shell", channel.shell());

    // 3. Non-blocking poll loop (same as terminal_thread runtime phase)
    session.set_blocking(false);

    let marker = "TERM_E2E_42";
    let command = format!("echo {}\n", marker);
    let deadline = Instant::now() + Duration::from_secs(15);
    let mut written = 0usize;
    let mut out = String::new();

    while written < command.len() && Instant::now() < deadline {
        match channel.write(command.as_bytes()[written..].as_ref()) {
            Ok(0) => thread::sleep(Duration::from_millis(8)),
            Ok(n) => written += n,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(8))
            }
            Err(e) => {
                failed += 1;
                println!("  FAIL  write command: {}", e);
                return (passed, failed);
            }
        }
    }
    if written == command.len() {
        passed += 1;
        println!("  PASS  nonblocking write ({} bytes)", written);
    } else {
        failed += 1;
        println!("  FAIL  nonblocking write: only {}/{} bytes before deadline", written, command.len());
        return (passed, failed);
    }

    let mut buf = [0u8; 16384];
    while !out.contains(marker) && Instant::now() < deadline {
        match channel.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => out.push_str(&String::from_utf8_lossy(&buf[..n])),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(8))
            }
            Err(e) => {
                failed += 1;
                println!("  FAIL  read output: {}", e);
                return (passed, failed);
            }
        }
    }
    if out.contains(marker) {
        passed += 1;
        println!("  PASS  command round-trip ({} echoed back)", marker);
    } else {
        failed += 1;
        let tail: String = out.chars().rev().take(200).collect();
        println!("  FAIL  command round-trip: marker not seen; tail: {:?}", tail);
        return (passed, failed);
    }

    // 4. Clean shutdown: exit → drain → blocking close → exit status
    let _ = channel.write(b"exit\n");
    let drain_deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if Instant::now() >= drain_deadline {
            break;
        }
        match channel.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(_) => continue,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(8))
            }
            Err(_) => break,
        }
    }
    session.set_blocking(true);
    let _ = channel.close();
    let _ = channel.wait_close();
    match channel.exit_status() {
        Ok(status) => {
            passed += 1;
            println!("  PASS  clean close (exit status {})", status);
        }
        Err(e) => {
            failed += 1;
            println!("  FAIL  exit_status: {}", e);
        }
    }

    (passed, failed)
}

fn main() {
    println!("Embedded terminal PTY end-to-end (Unraid)\n");
    let (passed, failed) = run();
    println!("\n{} passed, {} failed", passed, failed);
    if failed > 0 {
        std::process::exit(1);
    }
}
