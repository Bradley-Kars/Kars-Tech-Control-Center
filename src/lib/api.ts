/**
 * src/lib/api.ts — HTTP fetch wrapper for the KTS bridge API.
 *
 * The bridge binds 127.0.0.1 only (W1) and is reached same-origin in
 * production: the backend serves the built frontend (dist/) at / and the
 * API under /api. In dev (vite on 5173) set VITE_API_BASE to the bridge
 * origin, e.g. http://127.0.0.1:8799.
 *
 * Identity is supplied by the bridge, never required to live in the
 * frontend:
 *   - X-API-Token (setAuthToken) when a device provisions one, or
 *   - the Tailscale-User-Login header that tailscale adds to loopback
 *     requests; the bridge trusts it only from 127.0.0.1 (W3).
 *
 * All helpers throw an `ApiError` (with `.status` and `.detail`) on non-ok
 * responses so callers can render the OFF-1 banner deterministically.
 */

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

export interface ApiError extends Error {
  status: number;
  detail: string;
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

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const json = await res.json();
      if (json && typeof json === 'object' && json.detail) detail = String(json.detail);
    } catch {
      // not json — keep statusText
    }
    const err = new Error(
      `${method} ${path} -> ${res.status} ${detail}`,
    ) as ApiError;
    err.status = res.status;
    err.detail = detail;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface TicketSummary {
  id: string;
  title: string;
  status: string;
  client_name?: string;
  priority?: string;
}

export interface TicketsResponse {
  count: number;
  tickets: TicketSummary[];
}

/** GET /api/tickets — read-only ticket list. */
export function listTickets(token?: string): Promise<TicketsResponse> {
  return request<TicketsResponse>('/tickets', { token });
}

export interface CreateTicketInput {
  title: string;
  priority?: string;
  category?: string;
  [key: string]: unknown;
}

export interface CreateTicketResult {
  ticket_id: string;
  title: string;
  status: string;
  version: number;
  created_by?: string;
  actor?: string;
}

/** POST /api/tickets — create a ticket (title required). */
export function createTicket(
  input: CreateTicketInput,
  token?: string,
): Promise<CreateTicketResult> {
  return request<CreateTicketResult>('/tickets', {
    method: 'POST',
    body: input,
    token,
  });
}

export interface WorklogEntryInput {
  entry: string;
  hours: number;
  payment?: string;
  [key: string]: unknown;
}

export interface WorklogResult {
  ticket_id: string;
  version: number;
  worklog_count: number;
  actor?: string;
}

/** POST /api/tickets/{id}/worklog — append a worklog entry. */
export function addWorklog(
  ticketId: string,
  input: WorklogEntryInput,
  token?: string,
): Promise<WorklogResult> {
  return request<WorklogResult>(
    `/tickets/${encodeURIComponent(ticketId)}/worklog`,
    { method: 'POST', body: input, token },
  );
}

export interface StatusResult {
  ticket_id: string;
  status: string;
  version: number;
  actor?: string;
}

/** POST /api/tickets/{id}/status — change ticket status. */
export function changeTicketStatus(
  ticketId: string,
  status: string,
  token?: string,
): Promise<StatusResult> {
  return request<StatusResult>(
    `/tickets/${encodeURIComponent(ticketId)}/status`,
    { method: 'POST', body: { status }, token },
  );
}
