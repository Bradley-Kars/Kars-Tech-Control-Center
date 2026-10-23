import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalOpen, terminalWrite, terminalResize, terminalClose } from '../../lib/tauri-commands';

interface EmbeddedTerminalProps {
  /** ServerConfig id from the backend (not the local DeviceId union). */
  serverId: string;
  /** Visible height of the terminal viewport (px). */
  height?: number;
}

/**
 * Live SSH PTY in an xterm.js view.
 *
 * Streams over a Tauri IPC Channel (raw bytes → xterm does incremental
 * UTF-8 decoding), fits to its container with a ResizeObserver, and tears
 * the session down on unmount. MeshCentral's web terminal stays the
 * primary path — this is the sanctioned direct-SSH fallback.
 */
export function EmbeddedTerminal({ serverId, height = 460 }: EmbeddedTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      fontFamily: 'ui-monospace, "Cascadia Code", "Source Code Pro", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#0b0f14',
        foreground: '#d6dde6',
        cursor: '#7dd3fc',
        cursorAccent: '#0b0f14',
        selectionBackground: 'rgba(125, 211, 252, 0.32)',
        black: '#111827', red: '#f87171', green: '#4ade80', yellow: '#fbbf24',
        blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#e5e7eb',
        brightBlack: '#6b7280', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fde68a', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f9fafb',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    try { fit.fit(); } catch { /* container not laid out yet */ }

    let disposed = false;
    let sessionId: string | null = null;
    let closed = false;

    term.onData((data) => {
      if (!disposed && !closed && sessionId) void terminalWrite(sessionId, data);
    });

    const banner = (text: string, color = '\x1b[90m') => {
      term.write(`\r\n${color}── ${text} ──\x1b[0m\r\n`);
    };

    terminalOpen(serverId, term.cols, term.rows, (chunk) => {
      if (disposed) return;
      if (chunk.data && chunk.data.length > 0) term.write(new Uint8Array(chunk.data));
      if (chunk.closed) {
        closed = true;
        const status = chunk.exit_status;
        banner(status == null ? 'session closed' : `session closed (exit ${status})`);
        sessionId = null;
      }
    })
      .then((sid) => {
        if (disposed) {
          void terminalClose(sid);
          return;
        }
        sessionId = sid;
        term.focus();
      })
      .catch((e) => {
        if (disposed) return;
        banner(`connect failed: ${e instanceof Error ? e.message : String(e)}`, '\x1b[31m');
      });

    const observer = new ResizeObserver(() => {
      if (disposed) return;
      try { fit.fit(); } catch { /* mid-layout */ }
      if (sessionId && !closed) void terminalResize(sessionId, term.cols, term.rows);
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      if (sessionId) {
        const sid = sessionId;
        sessionId = null;
        void terminalClose(sid);
      }
      term.dispose();
    };
  }, [serverId]);

  return (
    <div
      style={{
        height,
        background: '#0b0f14',
        border: '1px solid var(--kts-border-default, #2a3441)',
        borderRadius: 'var(--kts-radius-md, 8px)',
        padding: '8px 8px 4px',
        overflow: 'hidden',
      }}
    >
      <div ref={hostRef} style={{ height: '100%' }} />
    </div>
  );
}
