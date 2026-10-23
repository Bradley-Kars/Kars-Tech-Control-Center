pub mod auto_connect;
pub mod commands;
pub mod config;
pub mod emhttp;
pub mod graphql;
pub mod linux_client;
pub mod local_stats;
pub mod meshcentral;
pub mod parsers;
pub mod services;
pub mod ssh;

use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::sync::Arc;

pub struct AppState {
    pub servers: Arc<Mutex<Vec<config::ServerConfig>>>,
    /// Live SSH PTY sessions: session id → channel to its owning thread.
    pub terminals: Arc<Mutex<HashMap<String, Sender<commands::terminal::TermMsg>>>>,
    /// OpenCode sidecar (opencode serve child process) for the chat panel.
    pub opencode: Arc<Mutex<Option<commands::opencode_chat::Sidecar>>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

impl AppState {
    pub fn new() -> Self {
        Self {
            servers: Arc::new(Mutex::new(config::load_servers())),
            terminals: Arc::new(Mutex::new(HashMap::new())),
            opencode: Arc::new(Mutex::new(None)),
        }
    }
}
