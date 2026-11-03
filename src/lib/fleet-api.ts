/**
 * src/lib/fleet-api.ts — HTTP fetch wrapper for the /api/fleet fleet API (F5).
 *
 * Implements the tauri-commands functions already ported to the FastAPI
 * backend with fetch, so the frontend talks to /api/fleet instead of Tauri
 * IPC. Mirrors src/lib/api.ts:
 *   - same-origin /api in production, VITE_API_BASE override in dev
 *   - X-API-Token auth (setAuthToken) or Tailscale-User-Login from loopback
 *   - FleetApiError (with .status and .detail) on non-ok responses
 *
 * Ported from src/lib/tauri-commands.ts:
 *   getServers      -> GET    /api/fleet/servers
 *   saveServer      -> POST   /api/fleet/servers
 *   removeServer    -> DELETE /api/fleet/servers/{id}
 *   testConnection  -> POST   /api/fleet/test_connection
 *
 * Everything else in tauri-commands.ts stays a "not ported yet" stub there.
 */

import type { ServerConfig, TestConnectionResult } from './types';

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '');

let authToken = '';

/** Set the X-API-Token sent with every request (empty = rely on Tailscale-User-Login). */
export function setAuthToken(token: string): void {
  authToken = token;
}
export function clearAuthToken(): void {
  authToken = '';
}
export function getAuthToken(): string {
  return authToken;
}

export interface FleetApiError extends Error {
  status: number;
  detail: string;
}

/** Human-facing message for a failed fleet-API request, mirroring api.ts
 *  ticketRequestError. Network failure and non-JSON responses are reported
 *  before status codes, since a connection error or an HTML page is a
 *  different class of problem than an HTTP status from a real endpoint. */
function fleetRequestError(status: number | null, isJson: boolean): string {
  if (status === null) return "Can't reach the fleet API.";
  if (!isJson) {
    return 'The server returned a web page instead of data. The API address may be wrong.';
  }
  if (status === 401) return "You're not signed in to this server.";
  if (status === 403) return "Your account isn't allowed to do that.";
  if (status >= 500 && status < 600) return "The fleet API had a problem. Try again.";
  return `Request failed with status ${status}`;
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> {
  const { method = 'GET', body, token } = opts;
  const headers: Record<string, string> = {};
  const t = token ?? authToken;
  if (t) headers['X-API-Token'] = t;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    const err = new Error(fleetRequestError(null, false)) as FleetApiError;
    err.status = 0;
    err.detail = 'Network request failed';
    throw err;
  }

  if (!res.ok) {
    const contentType = res.headers.get('content-type') ?? '';
    const isJson = contentType.includes('application/json');
    let detail = res.statusText;
    if (isJson) {
      try {
        const json = await res.json();
        if (json && typeof json === 'object' && json.detail) detail = String(json.detail);
      } catch {
        // body is not valid JSON despite content-type; keep statusText
      }
    }
    const err = new Error(fleetRequestError(res.status, isJson)) as FleetApiError;
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Servers (ported from tauri-commands.ts)
// ---------------------------------------------------------------------------

/** GET /api/fleet/servers — list all servers (redacted by the backend).
 *  The backend returns { servers, count }; callers get the servers array. */
export async function getServers(token?: string): Promise<ServerConfig[]> {
  const body = await request<{ servers: ServerConfig[]; count: number }>('/fleet/servers', {
    token,
  });
  return body.servers;
}

/** POST /api/fleet/servers — create or update a server (upsert by id). */
export async function saveServer(config: ServerConfig, token?: string): Promise<ServerConfig> {
  return request<ServerConfig>('/fleet/servers', {
    method: 'POST',
    body: config,
    token,
  });
}

/** DELETE /api/fleet/servers/{id} — remove a server by id. */
export async function removeServer(id: string, token?: string): Promise<void> {
  return request<void>(`/fleet/servers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * POST /api/fleet/test_connection — probe connectivity to a server config.
 *
 * Mirrors the Tauri `test_connection` command: SSH-based connectivity in
 * this phase (per-service probes are stubbed until P2-P10). The config is
 * NOT persisted — this is a pre-save probe used by the connection screen.
 * A failed probe resolves with success=false rather than rejecting; only
 * transport-level failures (network, non-JSON) reject.
 */
export async function testConnection(
  config: ServerConfig,
  token?: string,
): Promise<TestConnectionResult> {
  return request<TestConnectionResult>('/fleet/test_connection', {
    method: 'POST',
    body: config,
    token,
  });
}
