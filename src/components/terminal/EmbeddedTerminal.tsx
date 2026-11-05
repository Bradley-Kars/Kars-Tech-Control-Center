import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { terminalTicket } from '../../lib/fleet-api';

interface EmbeddedTerminalProps {
  /** Named PTY profile (e.g. "opencode"). Mutually exclusive with serverId. */
  profile?: string;
  /** ServerConfig id from the backend (not the local DeviceId union). Connects to the "ssh:<serverId>" profile. */
  serverId?: string;
  /** Visible height of the terminal viewport (px). */
  height?: number;
}

const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

/** Path component of the websocket URL for the /ws/pty/{profile} endpoint (Phase 3). */
function ptyPath(profile?: string, serverId?: string): string {
  if (profile) return `/ws/pty/${encodeURIComponent(profile)}`;
  return `/ws/pty/ssh/${encodeURIComponent(serverId ?? '')}`;
}

/** Same-origin websocket URL for the /ws/pty/{profile} endpoint (Phase 3).
 *  C3: auth is a one-time ticket (?ticket=), never ?token=. */
function terminalUrl(path: string, ticket?: string): string {
  const base = (import.meta.env.VITE_API_BASE ?? window.location.origin)
    .replace(/\/$/, '')
    .replace(/^http/, 'ws');
  return ticket ? `${base}${path}?ticket=${encodeURIComponent(ticket)}` : `${base}${path}`;
}

/**
 * Live SSH PTY in an xterm.js view.
 *
 * Streams over the /ws/pty/ssh:<serverId> websocket (JSON frames:
 * {type:"input","data"}, {type:"resize","cols","rows"} → server;
 * {type:"output","data"}, {type:"exit","code"}, {type:"error","message"} →
 * client), fits to its container with a ResizeObserver, reconnects with
 * exponential backoff on abnormal drops, and tears the session down on
 * unmount. MeshCentral's web terminal stays the primary path — this is the
 * sanctioned direct-SSH fallback over the web backend.
 */
export function EmbeddedTerminal({ profile, serverId, height = 460 }: EmbeddedTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(BACKOFF_BASE_MS);
  const disposedRef = useRef(false);
  const connectRef = useRef<(() => void) | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);

  // C3: mint a one-time ticket for the websocket; the old ?token= auth is
  // rejected by the backend.  The terminal connects once the ticket arrives.
  useEffect(() => {
    let cancelled = false;
    terminalTicket().then(({ ticket: t }) => {
      if (!cancelled) setTicket(t);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (disposedRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX_MS);
    timerRef.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, []);

  useEffect(() => {
    disposedRef.current = false;
    backoffRef.current = BACKOFF_BASE_MS;
    const host = hostRef.current;
    if (!host || !ticket) return;

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
    termRef.current = term;

    let sessionEnded = false;

    const banner = (text: string, color = '\x1b[90m') => {
      term.write(`\r\n${color}── ${text} ──\x1b[0m\r\n`);
    };

    const connect = () => {
      if (disposedRef.current) return;
      const ws = new WebSocket(terminalUrl(ptyPath(profile, serverId), ticket));
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = BACKOFF_BASE_MS;
        const t = termRef.current;
        if (!disposedRef.current && t && ws.readyState === WebSocket.OPEN) {
          void ws.send(
            JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }),
          );
        }
      };

      ws.onmessage = (event) => {
        if (disposedRef.current) return;
        let msg: unknown;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg === null || typeof msg !== 'object') return;
        const m = msg as {
          type?: string;
          data?: unknown;
          code?: number;
          message?: unknown;
        };
        switch (m.type) {
          case 'output':
            if (typeof m.data === 'string') term.write(m.data);
            break;
          case 'exit':
            sessionEnded = true;
            banner(m.code == null ? 'session closed' : `session closed (exit ${m.code})`);
            break;
          case 'error':
            banner(typeof m.message === 'string' ? m.message : 'terminal error');
            break;
        }
      };

      ws.onclose = (ev) => {
        wsRef.current = null;
        if (disposedRef.current) return;
        // A clean session exit or an auth-required close is final: report it,
        // do not reconnect. Anything else (network drop, server restart)
        // reconnects with exponential backoff.
        if (sessionEnded || ev.code === 4403) {
          if (ev.code === 4403 && !sessionEnded) {
            banner('connect failed: authentication required', '\x1b[31m');
          }
          return;
        }
        scheduleReconnect();
      };

      ws.onerror = () => {
        if (disposedRef.current) return;
        scheduleReconnect();
      };
    };
    connectRef.current = connect;

    term.onData((data) => {
      const ws = wsRef.current;
      if (!disposedRef.current && ws && ws.readyState === WebSocket.OPEN) {
        void ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const observer = new ResizeObserver(() => {
      if (disposedRef.current) return;
      try { fit.fit(); } catch { /* mid-layout */ }
      const ws = wsRef.current;
      const t = termRef.current;
      if (
        !disposedRef.current &&
        ws &&
        ws.readyState === WebSocket.OPEN &&
        t
      ) {
        void ws.send(JSON.stringify({ type: 'resize', cols: t.cols, rows: t.rows }));
      }
    });
    observer.observe(host);

    connect();

    return () => {
      disposedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const ws = wsRef.current;
      if (ws) ws.close();
      observer.disconnect();
      termRef.current?.dispose();
      termRef.current = null;
      wsRef.current = null;
    };
  }, [profile, serverId, ticket, scheduleReconnect]);

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
