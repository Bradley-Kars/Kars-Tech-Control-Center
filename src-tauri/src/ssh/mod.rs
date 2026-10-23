use anyhow::{Context, Result};
use ssh2::Session;
use std::io::Read;
use std::net::TcpStream;
use std::time::Duration;

use crate::config::{AuthConfig, ServerConfig};

pub struct SshConnection {
    session: Session,
}

impl SshConnection {
    pub fn connect(config: &ServerConfig) -> Result<Self> {
        let addr = format!("{}:{}", config.hostname, config.port);
        let tcp = TcpStream::connect(&addr).with_context(|| format!("TCP connect to {}", addr))?;
        tcp.set_read_timeout(Some(Duration::from_secs(60)))?;
        tcp.set_write_timeout(Some(Duration::from_secs(60)))?;

        let mut session = Session::new().context("Create SSH session")?;
        session.set_tcp_stream(tcp);
        session.handshake().context("SSH handshake")?;

        // Keep the SSH connection alive (and detect dead links) even over idle
        // tailnet links that drop silent tunnels.
        session.set_timeout(60_000);
        session.set_keepalive(true, 15);

        match &config.auth {
            AuthConfig::Password { password } => {
                session
                    .userauth_password(&config.username, password)
                    .context("SSH password auth")?;
            }
            AuthConfig::Key {
                key_path,
                passphrase,
            } => {
                session
                    .userauth_pubkey_file(
                        &config.username,
                        None,
                        std::path::Path::new(key_path),
                        passphrase.as_deref(),
                    )
                    .context("SSH key auth")?;
            }
        }

        if !session.authenticated() {
            anyhow::bail!("SSH authentication failed");
        }

        Ok(Self { session })
    }

    /// Take ownership of the underlying session (for the interactive PTY
    /// terminal thread, which must own the session for its whole lifetime).
    pub fn into_session(self) -> Session {
        self.session
    }

    pub fn exec(&self, command: &str) -> Result<String> {
        let mut channel = self.session.channel_session().context("Open SSH channel")?;
        channel.exec(command).context("Execute command")?;

        let mut output = String::new();
        channel.read_to_string(&mut output).context("Read stdout")?;

        let mut stderr = String::new();
        channel
            .stderr()
            .read_to_string(&mut stderr)
            .context("Read stderr")?;

        channel.wait_close().ok();

        if !stderr.is_empty() && output.is_empty() {
            anyhow::bail!("SSH command error: {}", stderr);
        }

        Ok(output)
    }

    pub fn exec_timeout(&self, command: &str, _timeout: std::time::Duration) -> Result<String> {
        self.exec(command)
    }

    pub fn is_connected(&self) -> bool {
        self.session.authenticated()
    }
}
