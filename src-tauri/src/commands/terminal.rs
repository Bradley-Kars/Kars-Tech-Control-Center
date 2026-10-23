//! Interactive SSH PTY sessions streamed to the frontend over a Tauri IPC
//! Channel (xterm.js on the other side).
//!
//! Design: each session is ONE owning thread. The `ssh2::Session` and its
//! channel are created inside the thread (avoiding `Channel<'sess>` lifetime
//! plumbing), the session is switched to non-blocking mode, and the thread
//! polls: drain outbound messages (stdin / resize / close) → read pending
//! stdout → forward chunks → sleep. EAGAIN (`ErrorCode::Session(-37)`) just
//! means "nothing right now" and continues the loop.
//!
//! Chunks carry raw bytes (`Vec<u8>`) so xterm.js does incremental UTF-8
//! decoding — never split a multibyte character across chunks by decoding here.

use serde::Serialize;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, TryRecvError};
use std::time::{Duration, Instant};

use tauri::ipc::Channel;
use tauri::State;

use crate::ssh::SshConnection;
use crate::AppState;

/// One outbound message from the UI to the terminal thread.
pub enum TermMsg {
    Data(Vec<u8>),
    Resize(u32, u32),
    Close,
}

/// Inbound stream chunk: raw bytes for xterm, or a `closed` marker carrying
/// the exit status when the session ends.
#[derive(Clone, Serialize)]
pub struct TerminalChunk {
    pub session_id: String,
    pub data: Vec<u8>,
    pub closed: bool,
    pub exit_status: Option<i32>,
}

static TERM_SEQ: AtomicU64 = AtomicU64::new(1);

fn find_config(state: &State<'_, AppState>, server_id: &str) -> Result<crate::config::ServerConfig, String> {
    let servers = state.servers.lock();
    servers
        .iter()
        .find(|s| s.id == server_id)
        .cloned()
        .ok_or_else(|| format!("Server not found: {server_id}"))
}

/// Open an interactive SSH PTY to `server_id` and start streaming output.
/// Returns the session id used by write/resize/close.
#[tauri::command]
pub async fn terminal_open(
    state: State<'_, AppState>,
    server_id: String,
    cols: u32,
    rows: u32,
    on_chunk: Channel<TerminalChunk>,
) -> Result<String, String> {
    let config = find_config(&state, &server_id)?;
    let conn = SshConnection::connect(&config).map_err(|e| e.to_string())?;
    let session = conn.into_session();

    let session_id = format!(
        "term-{}-{}",
        std::process::id(),
        TERM_SEQ.fetch_add(1, Ordering::Relaxed)
    );
    let (tx, rx) = channel::<TermMsg>();
    state
        .terminals
        .lock()
        .insert(session_id.clone(), tx);

    let id = session_id.clone();
    std::thread::spawn(move || {
        terminal_thread(id, session, cols.max(2), rows.max(1), rx, on_chunk);
    });

    Ok(session_id)
}

/// Send stdin to the session (keystrokes / pasted text).
#[tauri::command]
pub async fn terminal_write(
    state: State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let tx = state
        .terminals
        .lock()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("No such terminal session: {session_id}"))?;
    tx.send(TermMsg::Data(data.into_bytes()))
        .map_err(|_| "Terminal session closed".to_string())
}

/// Tell the remote PTY the new window size (after a fit/resize).
#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), String> {
    let tx = state
        .terminals
        .lock()
        .get(&session_id)
        .cloned()
        .ok_or_else(|| format!("No such terminal session: {session_id}"))?;
    tx.send(TermMsg::Resize(cols, rows))
        .map_err(|_| "Terminal session closed".to_string())
}

/// Politely close the session (drops the sender; the thread tears down and
/// sends one final `closed` chunk).
#[tauri::command]
pub async fn terminal_close(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), String> {
    if let Some(tx) = state.terminals.lock().remove(&session_id) {
        let _ = tx.send(TermMsg::Close);
    }
    Ok(())
}

/// The owning thread: sets up the PTY while blocking, then polls non-blocking
/// until EOF / error / close request.
fn terminal_thread(
    session_id: String,
    session: ssh2::Session,
    cols: u32,
    rows: u32,
    rx: Receiver<TermMsg>,
    on_chunk: Channel<TerminalChunk>,
) {
    let send = {
        let session_id = session_id.clone();
        move |data: Vec<u8>, closed: bool, exit_status: Option<i32>| {
            let _ = on_chunk.send(TerminalChunk {
                session_id: session_id.clone(),
                data,
                closed,
                exit_status,
            });
        }
    };

    // --- Setup (still blocking: pty/shell negotiation must complete) ---
    let mut channel = match session.channel_session() {
        Ok(c) => c,
        Err(e) => {
            send(
                format!("SSH channel open failed: {e}\r\n").into_bytes(),
                true,
                None,
            );
            return;
        }
    };
    if let Err(e) = channel.request_pty("xterm-256color", None, Some((cols, rows, 0, 0))) {
        send(
            format!("PTY allocation failed: {e}\r\n").into_bytes(),
            true,
            None,
        );
        return;
    }
    if let Err(e) = channel.shell() {
        send(
            format!("Shell start failed: {e}\r\n").into_bytes(),
            true,
            None,
        );
        return;
    }

    // --- Poll loop (non-blocking) ---
    session.set_blocking(false);
    let mut buf = [0u8; 16384];

    'outer: loop {
        // 1. Drain outbound messages from the UI.
        loop {
            match rx.try_recv() {
                Ok(TermMsg::Data(bytes)) => {
                    let mut off = 0;
                    let deadline = Instant::now() + Duration::from_secs(5);
                    while off < bytes.len() {
                        match channel.write(&bytes[off..]) {
                            Ok(0) => {
                                // Non-blocking write accepted nothing yet — retry
                                // until the deadline, never treat as disconnect.
                                if Instant::now() >= deadline {
                                    break 'outer;
                                }
                                std::thread::sleep(Duration::from_millis(10));
                            }
                            Ok(n) => off += n,
                            // ssh2 maps EAGAIN to io::ErrorKind::WouldBlock.
                            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                                if Instant::now() >= deadline {
                                    break 'outer;
                                }
                                std::thread::sleep(Duration::from_millis(10));
                            }
                            Err(_) => break 'outer,
                        }
                    }
                    let _ = channel.flush();
                }
                Ok(TermMsg::Resize(c, r)) => {
                    let _ = channel.request_pty_size(c.max(2), r.max(1), None, None);
                }
                Ok(TermMsg::Close) | Err(TryRecvError::Disconnected) => break 'outer,
                Err(TryRecvError::Empty) => break,
            }
        }

        // 2. Read pending output.
        match channel.read(&mut buf) {
            Ok(0) => break 'outer, // EOF from remote
            Ok(n) => send(buf[..n].to_vec(), false, None),
            // ssh2 maps EAGAIN to io::ErrorKind::WouldBlock: nothing right now.
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
            Err(_) => break 'outer, // stream error / socket died
        }

        std::thread::sleep(Duration::from_millis(8));
    }

    // --- Teardown (blocking again so close/wait_close behave) ---
    session.set_blocking(true);
    let _ = channel.close();
    let _ = channel.wait_close();
    let exit_status = channel.exit_status().ok();

    // Final chunk so the frontend can render "session closed (exit N)".
    // Harmless if the UI already unmounted (Channel send just no-ops).
    send(Vec::new(), true, exit_status);
}
