/**
 * src/lib/fleet-api.ts — HTTP fetch wrapper for the /api/fleet fleet API (F5).
 *
 * Implements the fetch client for the ported fleet commands, so the frontend
 * talks to /api/fleet. Mirrors src/lib/api.ts:
 *   - same-origin /api in production, VITE_API_BASE override in dev
 *   - X-API-Token auth (setAuthToken) or Tailscale-User-Login from loopback
 *   - FleetApiError (with .status and .detail) on non-ok responses
 *
 * Ported from the original command module:
 *   getServers         -> GET    /api/fleet/servers
 *   saveServer         -> POST   /api/fleet/servers
 *   removeServer       -> DELETE /api/fleet/servers/{id}
 *   testConnection     -> POST   /api/fleet/test_connection
 *   getSystemStats     -> GET    /api/fleet/system/stats?server_id=X
 *   getGpuInfo         -> GET    /api/fleet/unraid/get_gpu_info?server_id=X
 *   getSmartData       -> GET    /api/fleet/unraid/get_smart_data?server_id=X&device=X
 *   getLocalSystemStats-> GET    /api/fleet/local/stats (host-local, no SSH)
 *   getDockerContainers-> GET    /api/fleet/unraid/get_docker_containers?server_id=X
 *   dockerStart        -> POST   /api/fleet/docker/start      {server_id, container}
 *   dockerStop         -> POST   /api/fleet/docker/stop       {server_id, container}
 *   dockerRestart      -> POST   /api/fleet/docker/restart    {server_id, container}
 *   dockerLogs         -> POST   /api/fleet/docker/logs       {server_id, container, lines}
 *
 * Everything else in the original command module stays a "not ported yet" stub there.
 */

import type {
  ServerConfig,
  SystemStats,
  GpuInfo,
  SmartInfo,
  TestConnectionResult,
  ContainerInfo,
  RestServiceHealth,
  PlexIdentity,
  PlexLibrary,
  NextcloudInfo,
  NextcloudSystemStatus,
  NextcloudStorage,
  NextcloudUser,
  NextcloudActivity,
  AdGuardStatus,
  AdGuardStats,
  AdGuardQueryLog,
  AdGuardDHCP,
  HomeAssistantState,
  HomeAssistantConfig,
  HomeAssistantArea,
  HomeAssistantDevice,
  HomeAssistantEntity,
  ArrStatus,
  ArrHealthIssue,
  ArrArtist,
  ArrAlbum,
  ArrWantedMissing,
  ArrQueue,
  ArrDiskSpace,
  ArrCalendarEvent,
  ArrLibraryTotal,
  MeshDevice,
  DeviceStatus,
  BatchCommand,
  BatchResult,
  EnrollmentInfo,
  SyncResult,
  ShellResult,
  RemoteFileInfo,
  RemoteProcess,
  Alert,
  AlertFilter,
  AlertSeverity,
  MetricPoint,
  MetricSeries,
  PhoneDeviceInfo,
  PhoneBattery,
  PhoneStorage,
  PhoneMemory,
  KdeConnectBattery,
  KdeConnectConnectivity,
  ArrApp,
} from './types';

export type { Alert, AlertFilter, AlertSeverity, MetricPoint, MetricSeries };

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
// Servers (ported from the original command module)
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
 * Mirrors the `test_connection` command: SSH-based connectivity in
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

/** GET /api/fleet/system/stats?server_id=X — system stats probed over SSH. */
export async function getSystemStats(serverId: string, token?: string): Promise<SystemStats> {
  return request<SystemStats>(`/fleet/system/stats?server_id=${encodeURIComponent(serverId)}`, {
    token,
  });
}

/** GET /api/fleet/unraid/get_gpu_info?server_id=X — GPU info via nvidia-smi over SSH. */
export async function getGpuInfo(serverId: string, token?: string): Promise<GpuInfo | null> {
  return request<GpuInfo | null>(
    `/fleet/unraid/get_gpu_info?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_smart_data?server_id=X&device=/dev/sda — SMART data over SSH. */
export async function getSmartData(
  serverId: string,
  device: string,
  token?: string,
): Promise<SmartInfo> {
  return request<SmartInfo>(
    `/fleet/unraid/get_smart_data?server_id=${encodeURIComponent(serverId)}&device=${encodeURIComponent(device)}`,
    { token },
  );
}

/** GET /api/fleet/local/stats — host-local system stats (no SSH, no server). */
export async function getLocalSystemStats(token?: string): Promise<any> {
  return request<any>('/fleet/local/stats', { token });
}

/** GET /api/fleet/unraid/get_docker_containers?server_id=X — containers over SSH. */
export async function getDockerContainers(
  serverId: string,
  token?: string,
): Promise<ContainerInfo[]> {
  return request<ContainerInfo[]>(
    `/fleet/unraid/get_docker_containers?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** POST /api/fleet/docker/start — start a container. Resolves with the status message. */
export async function dockerStart(
  serverId: string,
  container: string,
  token?: string,
): Promise<string> {
  return request<string>('/fleet/docker/start', {
    method: 'POST',
    body: { server_id: serverId, container },
    token,
  });
}

/** POST /api/fleet/docker/stop — stop a container. Resolves with the status message. */
export async function dockerStop(
  serverId: string,
  container: string,
  token?: string,
): Promise<string> {
  return request<string>('/fleet/docker/stop', {
    method: 'POST',
    body: { server_id: serverId, container },
    token,
  });
}

/** POST /api/fleet/docker/restart — restart a container. Resolves with the status message. */
export async function dockerRestart(
  serverId: string,
  container: string,
  token?: string,
): Promise<string> {
  return request<string>('/fleet/docker/restart', {
    method: 'POST',
    body: { server_id: serverId, container },
    token,
  });
}

/** POST /api/fleet/docker/logs — fetch container logs. Resolves with the log output. */
export async function dockerLogs(
  serverId: string,
  container: string,
  lines = 100,
  token?: string,
): Promise<string> {
  return request<string>('/fleet/docker/logs', {
    method: 'POST',
    body: { server_id: serverId, container, lines },
    token,
  });
}

// ---------------------------------------------------------------------------
// Unraid emhttp (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/unraid/get_array_info?server_id=X — array info over emhttp. */
export async function getArrayInfo(
  serverId: string,
  token?: string,
): Promise<any> {
  return request<any>(
    `/fleet/unraid/get_array_info?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_disks?server_id=X — disks over emhttp. */
export async function getDisks(
  serverId: string,
  token?: string,
): Promise<any[]> {
  return request<any[]>(
    `/fleet/unraid/get_disks?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_shares?server_id=X — shares over emhttp. */
export async function getShares(
  serverId: string,
  token?: string,
): Promise<any[]> {
  return request<any[]>(
    `/fleet/unraid/get_shares?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// REST health (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/rest/health?service=X&server_id=X — probe a REST service. */
export async function probeRestService(
  service: string,
  serverId: string,
  token?: string,
): Promise<RestServiceHealth> {
  return request<RestServiceHealth>(
    `/fleet/rest/health?service=${encodeURIComponent(service)}&server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/rest/plex/identity?server_id=X — Plex server identity. */
export async function getPlexIdentity(
  serverId: string,
  token?: string,
): Promise<PlexIdentity | null> {
  return request<PlexIdentity | null>(
    `/fleet/rest/plex/identity?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/rest/plex/libraries?server_id=X — Plex library sections. */
export async function getPlexLibraries(
  serverId: string,
  token?: string,
): Promise<PlexLibrary[]> {
  return request<PlexLibrary[]>(
    `/fleet/rest/plex/libraries?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// Nextcloud (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/nextcloud/info?server_id=X — Nextcloud server info. */
export async function getNextcloudInfo(
  serverId: string,
  token?: string,
): Promise<NextcloudInfo> {
  return request<NextcloudInfo>(
    `/fleet/nextcloud/info?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/nextcloud/status?server_id=X — Nextcloud system status. */
export async function getNextcloudStatus(
  serverId: string,
  token?: string,
): Promise<NextcloudSystemStatus> {
  return request<NextcloudSystemStatus>(
    `/fleet/nextcloud/status?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/nextcloud/storage?server_id=X — Nextcloud storage stats. */
export async function getNextcloudStorage(
  serverId: string,
  token?: string,
): Promise<NextcloudStorage> {
  return request<NextcloudStorage>(
    `/fleet/nextcloud/storage?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/nextcloud/users?server_id=X — Nextcloud users. */
export async function getNextcloudUsers(
  serverId: string,
  token?: string,
): Promise<NextcloudUser[]> {
  return request<NextcloudUser[]>(
    `/fleet/nextcloud/users?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/nextcloud/activity?server_id=X&limit=X — Nextcloud activity. */
export async function getNextcloudActivity(
  serverId: string,
  limit?: number,
  token?: string,
): Promise<NextcloudActivity> {
  const url = `/fleet/nextcloud/activity?server_id=${encodeURIComponent(
    serverId,
  )}${limit !== undefined ? `&limit=${encodeURIComponent(String(limit))}` : ""}`;
  return request<NextcloudActivity>(url, { token });
}

// ---------------------------------------------------------------------------
// AdGuard Home (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/adguard/status?server_id=X — AdGuard Home status. */
export async function getAdGuardStatus(
  serverId: string,
  token?: string,
): Promise<AdGuardStatus> {
  return request<AdGuardStatus>(
    `/fleet/adguard/status?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/adguard/stats?server_id=X — AdGuard Home statistics. */
export async function getAdGuardStats(
  serverId: string,
  token?: string,
): Promise<AdGuardStats> {
  return request<AdGuardStats>(
    `/fleet/adguard/stats?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/adguard/querylog?server_id=X&limit=X&offset=X — AdGuard query log. */
export async function getAdGuardQueryLog(
  serverId: string,
  limit?: number,
  offset?: number,
  token?: string,
): Promise<AdGuardQueryLog> {
  const url = `/fleet/adguard/querylog?server_id=${encodeURIComponent(
    serverId,
  )}${limit !== undefined ? `&limit=${encodeURIComponent(String(limit))}` : ""}${
    offset !== undefined ? `&offset=${encodeURIComponent(String(offset))}` : ""
  }`;
  return request<AdGuardQueryLog>(url, { token });
}

/** GET /api/fleet/adguard/clients?server_id=X — AdGuard Home clients. */
export async function getAdGuardClients(
  serverId: string,
  token?: string,
): Promise<any> {
  return request<any>(
    `/fleet/adguard/clients?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/adguard/filters?server_id=X — AdGuard Home filters. */
export async function getAdGuardFilters(
  serverId: string,
  token?: string,
): Promise<any> {
  return request<any>(
    `/fleet/adguard/filters?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/adguard/dhcp?server_id=X — AdGuard Home DHCP status. */
export async function getAdGuardDhcp(
  serverId: string,
  token?: string,
): Promise<AdGuardDHCP> {
  return request<AdGuardDHCP>(
    `/fleet/adguard/dhcp?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** POST /api/fleet/adguard/enable?server_id=X — enable AdGuard protection. */
export async function adguardEnable(
  serverId: string,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/adguard/enable?server_id=${encodeURIComponent(serverId)}`,
    { method: 'POST', token },
  );
}

/** POST /api/fleet/adguard/disable?server_id=X — disable AdGuard protection. */
export async function adguardDisable(
  serverId: string,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/adguard/disable?server_id=${encodeURIComponent(serverId)}`,
    { method: 'POST', token },
  );
}

// ---------------------------------------------------------------------------
// Home Assistant (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/homeassistant/get_homeassistant_states?server_id=X — HA entity states. */
export async function getHomeAssistantStates(
  serverId: string,
  token?: string,
): Promise<HomeAssistantState[]> {
  return request<HomeAssistantState[]>(
    `/fleet/homeassistant/get_homeassistant_states?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/homeassistant/get_homeassistant_config?server_id=X — HA server config. */
export async function getHomeAssistantConfig(
  serverId: string,
  token?: string,
): Promise<HomeAssistantConfig> {
  return request<HomeAssistantConfig>(
    `/fleet/homeassistant/get_homeassistant_config?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/homeassistant/get_homeassistant_areas?server_id=X — HA areas. */
export async function getHomeAssistantAreas(
  serverId: string,
  token?: string,
): Promise<HomeAssistantArea[]> {
  return request<HomeAssistantArea[]>(
    `/fleet/homeassistant/get_homeassistant_areas?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/homeassistant/get_homeassistant_devices?server_id=X — HA devices. */
export async function getHomeAssistantDevices(
  serverId: string,
  token?: string,
): Promise<HomeAssistantDevice[]> {
  return request<HomeAssistantDevice[]>(
    `/fleet/homeassistant/get_homeassistant_devices?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/homeassistant/get_homeassistant_entities?server_id=X — HA entity registry. */
export async function getHomeAssistantEntities(
  serverId: string,
  token?: string,
): Promise<HomeAssistantEntity[]> {
  return request<HomeAssistantEntity[]>(
    `/fleet/homeassistant/get_homeassistant_entities?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** POST /api/fleet/homeassistant/homeassistant_toggle?server_id=X&entity_id=X — toggle an entity. */
export async function homeAssistantToggle(
  serverId: string,
  entityId: string,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/homeassistant/homeassistant_toggle?server_id=${encodeURIComponent(
      serverId,
    )}&entity_id=${encodeURIComponent(entityId)}`,
    { method: 'POST', token },
  );
}

/** POST /api/fleet/homeassistant/homeassistant_turn_on?server_id=X&entity_id=X — turn an entity on. */
export async function homeAssistantTurnOn(
  serverId: string,
  entityId: string,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/homeassistant/homeassistant_turn_on?server_id=${encodeURIComponent(
      serverId,
    )}&entity_id=${encodeURIComponent(entityId)}`,
    { method: 'POST', token },
  );
}

/** POST /api/fleet/homeassistant/homeassistant_turn_off?server_id=X&entity_id=X — turn an entity off. */
export async function homeAssistantTurnOff(
  serverId: string,
  entityId: string,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/homeassistant/homeassistant_turn_off?server_id=${encodeURIComponent(
      serverId,
    )}&entity_id=${encodeURIComponent(entityId)}`,
    { method: 'POST', token },
  );
}

// ---------------------------------------------------------------------------
// Arr — one client for Lidarr (/api/v1), Sonarr and Radarr (/api/v3).
// system status, health, artists, albums, wanted/missing, queue, disk space,
// calendar and library total, plus "search missing" / "refresh series"
// commands over the HTTP *arr API (X-Api-Key auth)
// ---------------------------------------------------------------------------

/** GET /api/fleet/arr/status?server_id=X&app=X — *arr system status. */
export async function getArrStatus(
  serverId: string,
  app: ArrApp,
  token?: string,
): Promise<ArrStatus> {
  return request<ArrStatus>(
    `/fleet/arr/status?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}`,
    { token },
  );
}

/** GET /api/fleet/arr/health?server_id=X&app=X — *arr health issues. */
export async function getArrHealth(
  serverId: string,
  app: ArrApp,
  token?: string,
): Promise<ArrHealthIssue[]> {
  return request<ArrHealthIssue[]>(
    `/fleet/arr/health?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}`,
    { token },
  );
}

/** GET /api/fleet/arr/artists?server_id=X&app=X — *arr artists. */
export async function getArrArtists(
  serverId: string,
  app: ArrApp,
  token?: string,
): Promise<ArrArtist[]> {
  return request<ArrArtist[]>(
    `/fleet/arr/artists?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}`,
    { token },
  );
}

/** GET /api/fleet/arr/albums?server_id=X&app=X&artist_id=X&monitored=X — *arr albums. */
export async function getArrAlbums(
  serverId: string,
  app: ArrApp,
  artistId?: number,
  monitored?: boolean,
  token?: string,
): Promise<ArrAlbum[]> {
  const url = `/fleet/arr/albums?server_id=${encodeURIComponent(
    serverId,
  )}&app=${encodeURIComponent(app)}${artistId !== undefined ? `&artist_id=${encodeURIComponent(String(artistId))}` : ""}${
    monitored !== undefined ? `&monitored=${encodeURIComponent(String(monitored))}` : ""
  }`;
  return request<ArrAlbum[]>(url, { token });
}

/** GET /api/fleet/arr/wanted?server_id=X&app=X&page=X&page_size=X — wanted/missing. */
export async function getArrWanted(
  serverId: string,
  app: ArrApp,
  page?: number,
  pageSize?: number,
  token?: string,
): Promise<ArrWantedMissing> {
  const url = `/fleet/arr/wanted?server_id=${encodeURIComponent(
    serverId,
  )}&app=${encodeURIComponent(app)}${page !== undefined ? `&page=${encodeURIComponent(String(page))}` : ""}${
    pageSize !== undefined ? `&page_size=${encodeURIComponent(String(pageSize))}` : ""
  }`;
  return request<ArrWantedMissing>(url, { token });
}

/** GET /api/fleet/arr/queue?server_id=X&app=X&page=X&page_size=X — download queue. */
export async function getArrQueue(
  serverId: string,
  app: ArrApp,
  page?: number,
  pageSize?: number,
  token?: string,
): Promise<ArrQueue> {
  const url = `/fleet/arr/queue?server_id=${encodeURIComponent(
    serverId,
  )}&app=${encodeURIComponent(app)}${page !== undefined ? `&page=${encodeURIComponent(String(page))}` : ""}${
    pageSize !== undefined ? `&page_size=${encodeURIComponent(String(pageSize))}` : ""
  }`;
  return request<ArrQueue>(url, { token });
}

/** GET /api/fleet/arr/diskspace?server_id=X&app=X — *arr disk space. */
export async function getArrDiskspace(
  serverId: string,
  app: ArrApp,
  token?: string,
): Promise<ArrDiskSpace[]> {
  return request<ArrDiskSpace[]>(
    `/fleet/arr/diskspace?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}`,
    { token },
  );
}

/** GET /api/fleet/arr/calendar?server_id=X&app=X&days=X — *arr calendar. */
export async function getArrCalendar(
  serverId: string,
  app: ArrApp,
  days = 7,
  token?: string,
): Promise<ArrCalendarEvent[]> {
  return request<ArrCalendarEvent[]>(
    `/fleet/arr/calendar?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}&days=${encodeURIComponent(
      String(days),
    )}`,
    { token },
  );
}

/** GET /api/fleet/arr/library_total?server_id=X&app=X — *arr library total. */
export async function getArrLibraryTotal(
  serverId: string,
  app: ArrApp,
  token?: string,
): Promise<ArrLibraryTotal> {
  return request<ArrLibraryTotal>(
    `/fleet/arr/library_total?server_id=${encodeURIComponent(serverId)}&app=${encodeURIComponent(app)}`,
    { token },
  );
}

/** POST /api/fleet/arr/refresh_series?server_id=X&app=X&artist_id=X — refresh an artist/series. */
export async function arrRefreshSeries(
  serverId: string,
  app: ArrApp,
  artistId: number,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/arr/refresh_series?server_id=${encodeURIComponent(
      serverId,
    )}&app=${encodeURIComponent(app)}&artist_id=${encodeURIComponent(String(artistId))}`,
    { method: 'POST', token },
  );
}

/** POST /api/fleet/arr/search_missing?server_id=X&app=X&artist_id=X — search missing. */
export async function arrSearchMissing(
  serverId: string,
  app: ArrApp,
  artistId: number,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/arr/search_missing?server_id=${encodeURIComponent(
      serverId,
    )}&app=${encodeURIComponent(app)}&artist_id=${encodeURIComponent(String(artistId))}`,
    { method: 'POST', token },
  );
}

// ---------------------------------------------------------------------------
// Phone / KDE Connect (ported from the original command module)
// Host-local, feature-flagged: the backend runs adb/gdbus on its own machine.
// ---------------------------------------------------------------------------

/** GET /api/fleet/phone/device_info?server_id=X — phone device info. */
export async function getPhoneDeviceInfo(
  serverId: string,
  token?: string,
): Promise<PhoneDeviceInfo> {
  return request<PhoneDeviceInfo>(
    `/fleet/phone/device_info?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/phone/battery?server_id=X — phone battery state. */
export async function getPhoneBattery(
  serverId: string,
  token?: string,
): Promise<PhoneBattery> {
  return request<PhoneBattery>(
    `/fleet/phone/battery?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/phone/storage?server_id=X — phone storage. */
export async function getPhoneStorage(
  serverId: string,
  token?: string,
): Promise<PhoneStorage> {
  return request<PhoneStorage>(
    `/fleet/phone/storage?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/phone/memory?server_id=X — phone memory. */
export async function getPhoneMemory(
  serverId: string,
  token?: string,
): Promise<PhoneMemory> {
  return request<PhoneMemory>(
    `/fleet/phone/memory?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/kdeconnect/battery?server_id=X — KDE Connect battery. */
export async function getKdeConnectBattery(
  serverId: string,
  token?: string,
): Promise<KdeConnectBattery> {
  return request<KdeConnectBattery>(
    `/fleet/kdeconnect/battery?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/kdeconnect/connectivity?server_id=X — connectivity report. */
export async function getKdeConnectConnectivity(
  serverId: string,
  token?: string,
): Promise<KdeConnectConnectivity> {
  return request<KdeConnectConnectivity>(
    `/fleet/kdeconnect/connectivity?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/kdeconnect/list_devices?server_id=X — paired device list. */
export async function getKdeConnectListDevices(
  serverId: string,
  token?: string,
): Promise<string[]> {
  return request<string[]>(
    `/fleet/kdeconnect/list_devices?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// MeshCentral (ported from the original command module)
// ---------------------------------------------------------------------------

/** GET /api/fleet/meshcentral/list_devices?server_id=X — list MeshCentral devices. */
export async function meshcentralListDevices(
  serverId: string,
  token?: string,
): Promise<MeshDevice[]> {
  return request<MeshDevice[]>(
    `/fleet/meshcentral/list_devices?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/meshcentral/get_device_status?server_id=X&device_id=X — device status. */
export async function meshcentralGetDeviceStatus(
  serverId: string,
  deviceId: string,
  token?: string,
): Promise<DeviceStatus> {
  return request<DeviceStatus>(
    `/fleet/meshcentral/get_device_status?server_id=${encodeURIComponent(serverId)}&device_id=${encodeURIComponent(deviceId)}`,
    { token },
  );
}

/** POST /api/fleet/meshcentral/execute_batch — run commands on devices. */
export async function meshcentralExecuteBatch(
  serverId: string,
  deviceIds: string[],
  commands: BatchCommand[],
  token?: string,
): Promise<BatchResult[]> {
  return request<BatchResult[]>(
    '/fleet/meshcentral/execute_batch',
    {
      method: 'POST',
      body: { server_id: serverId, device_ids: deviceIds, commands },
      token,
    },
  );
}

/** GET /api/fleet/meshcentral/get_terminal_url?server_id=X&device_id=X — web terminal URL. */
export async function meshcentralGetTerminalUrl(
  serverId: string,
  deviceId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/meshcentral/get_terminal_url?server_id=${encodeURIComponent(serverId)}&device_id=${encodeURIComponent(deviceId)}`,
    { token },
  );
}

/** GET /api/fleet/meshcentral/get_file_manager_url?server_id=X&device_id=X — file manager URL. */
export async function meshcentralGetFileManagerUrl(
  serverId: string,
  deviceId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/meshcentral/get_file_manager_url?server_id=${encodeURIComponent(serverId)}&device_id=${encodeURIComponent(deviceId)}`,
    { token },
  );
}

/** GET /api/fleet/meshcentral/get_enrollment_info?server_id=X&device_type=X — enrollment info. */
export async function meshcentralGetEnrollmentInfo(
  serverId: string,
  deviceType: string,
  token?: string,
): Promise<EnrollmentInfo> {
  return request<EnrollmentInfo>(
    `/fleet/meshcentral/get_enrollment_info?server_id=${encodeURIComponent(serverId)}&device_type=${encodeURIComponent(deviceType)}`,
    { token },
  );
}

/** POST /api/fleet/meshcentral/sync_fleet — sync MeshCentral inventory to servers.json. */
export async function meshcentralSyncFleet(
  serverId: string,
  token?: string,
): Promise<SyncResult> {
  return request<SyncResult>(
    '/fleet/meshcentral/sync_fleet',
    { method: 'POST', body: { server_id: serverId }, token },
  );
}

/** GET /api/fleet/meshcentral/get_fleet_stats?server_id=X — MeshCentral fleet stats. */
export async function meshcentralGetFleetStats(
  serverId: string,
  token?: string,
): Promise<Record<string, any>> {
  return request<Record<string, any>>(
    `/fleet/meshcentral/get_fleet_stats?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// Remote shell / file listing / process list (ported from the original command module)
// ---------------------------------------------------------------------------

/** POST /api/fleet/meshcentral/shell_exec — run a shell command on a device. */
export async function meshcentralShellExec(
  serverId: string,
  command: string,
  timeoutSecs?: number,
): Promise<ShellResult> {
  return request<ShellResult>('/fleet/meshcentral/shell_exec', {
    method: 'POST',
    body: { server_id: serverId, command, timeout_secs: timeoutSecs ?? 60 },
    token: undefined,
  });
}

/** GET /api/fleet/meshcentral/list_dir?server_id=X&path=X — list a remote dir. */
export async function meshcentralListDir(
  serverId: string,
  path: string,
): Promise<RemoteFileInfo[]> {
  return request<RemoteFileInfo[]>(
    `/fleet/meshcentral/list_dir?server_id=${encodeURIComponent(serverId)}&path=${encodeURIComponent(path)}`,
    { token: undefined },
  );
}

/** GET /api/fleet/meshcentral/get_processes?server_id=X&limit=X — list procs. */
export async function meshcentralGetProcesses(
  serverId: string,
  limit?: number,
): Promise<RemoteProcess[]> {
  return request<RemoteProcess[]>(
    `/fleet/meshcentral/get_processes?server_id=${encodeURIComponent(serverId)}&limit=${limit ?? 50}`,
    { token: undefined },
  );
}

// ---------------------------------------------------------------------------
// Alerts (ported from the original command module)
// ---------------------------------------------------------------------------

/** POST /api/fleet/alerts/create — create a new alert. */
export async function alertCreate(
  severity: AlertSeverity,
  title: string,
  message: string,
  deviceId?: string,
  source?: string,
  autoAckRule?: string,
  token?: string,
): Promise<Alert> {
  return request<Alert>('/fleet/alerts/create', {
    method: 'POST',
    body: { severity, title, message, device_id: deviceId, source, auto_ack_rule: autoAckRule },
    token,
  });
}

/** GET /api/fleet/alerts/list?severity=&device_id=&acknowledged=&since=&limit=&offset= — list alerts. */
export async function alertList(
  filter: AlertFilter = {},
  token?: string,
): Promise<Alert[]> {
  const params = new URLSearchParams();
  if (filter.severity) params.set('severity', filter.severity);
  if (filter.device_id) params.set('device_id', filter.device_id);
  if (filter.acknowledged !== undefined)
    params.set('acknowledged', String(filter.acknowledged));
  if (filter.since) params.set('since', filter.since);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.offset !== undefined) params.set('offset', String(filter.offset));
  return request<Alert[]>(`/fleet/alerts/list?${params.toString()}`, { token });
}

/** GET /api/fleet/alerts/get?id=X — return one alert by id. */
export async function alertGet(id: number, token?: string): Promise<Alert> {
  return request<Alert>(`/fleet/alerts/get?id=${encodeURIComponent(String(id))}`, { token });
}

/** POST /api/fleet/alerts/acknowledge — acknowledge one alert. */
export async function alertAcknowledge(
  id: number,
  acknowledgedBy: string,
  token?: string,
): Promise<Alert> {
  return request<Alert>('/fleet/alerts/acknowledge', {
    method: 'POST',
    body: { id, acknowledged_by: acknowledgedBy },
    token,
  });
}

/** POST /api/fleet/alerts/acknowledge_all — acknowledge all unacknowledged alerts. */
export async function alertAcknowledgeAll(
  deviceId?: string,
  acknowledgedBy: string = 'user',
  token?: string,
): Promise<number> {
  return request<number>('/fleet/alerts/acknowledge_all', {
    method: 'POST',
    body: { device_id: deviceId, acknowledged_by: acknowledgedBy },
    token,
  });
}

/** POST /api/fleet/alerts/delete — delete one alert by id. */
export async function alertDelete(id: number, token?: string): Promise<void> {
  return request<void>('/fleet/alerts/delete', {
    method: 'POST',
    body: { id },
    token,
  });
}

/** POST /api/fleet/alerts/auto_ack_run — run auto-acknowledgment rules. */
export async function alertEvaluateAutoAck(token?: string): Promise<number> {
  return request<number>('/fleet/alerts/auto_ack_run', {
    method: 'POST',
    body: {},
    token,
  });
}

// ---------------------------------------------------------------------------
// Historical metrics (ported from the original command module)
// ---------------------------------------------------------------------------

/** POST /api/fleet/metrics/record — record one metric sample. */
export async function metricRecord(
  deviceId: string,
  metric: string,
  value: number,
  token?: string,
): Promise<void> {
  return request<void>('/fleet/metrics/record', {
    method: 'POST',
    body: { device_id: deviceId, metric, value },
    token,
  });
}

/** GET /api/fleet/metrics/query?device_id=&metric=&from=&to=&limit= — query metric points. */
export async function metricQuery(
  deviceId: string,
  metric: string,
  from: string,
  to?: string,
  limit?: number,
  token?: string,
): Promise<MetricPoint[]> {
  const params = new URLSearchParams({
    device_id: deviceId,
    metric,
    from,
  });
  if (to) params.set('to', to);
  if (limit !== undefined) params.set('limit', String(limit));
  return request<MetricPoint[]>(`/fleet/metrics/query?${params.toString()}`, { token });
}

/** GET /api/fleet/metrics/query_multi — multiple device/metric series. */
export async function metricQueryMulti(
  deviceIds: string[],
  metrics: string[],
  from: string,
  to?: string,
  token?: string,
): Promise<MetricSeries[]> {
  const params = new URLSearchParams({ from });
  for (const deviceId of deviceIds) params.append('device_ids', deviceId);
  for (const m of metrics) params.append('metrics', m);
  if (to) params.set('to', to);
  return request<MetricSeries[]>(`/fleet/metrics/query_multi?${params.toString()}`, { token });
}

/** POST /api/fleet/metrics/collect_all — run all metric collectors. */
export async function metricCollectAll(token?: string): Promise<number> {
  return request<number>('/fleet/metrics/collect_all', {
    method: 'POST',
    body: {},
    token,
  });
}

// ---------------------------------------------------------------------------
// Dropped commands — web stubs (not ported to /api/fleet)
// ---------------------------------------------------------------------------
// These commands were in the original command module as invoke stubs
// but are NOT ported to the FastAPI backend (marked "dropped" in
// the port doc by P16). They remain here as web stubs so the
// UI can compile and import everything from fleet-api.ts. They return empty
// data / resolve without effect; no real command is executed.

/** One Prometheus range-query series (instance label + points). */
export interface PromSeries {
  instance: string;
  points: MetricPoint[];
}

/** Single Prometheus alert from polling. */
export interface PromAlertCreated {
  id: number;
  severity: AlertSeverity;
  title: string;
  message: string;
  device_id?: string;
  source: string;
}

/** Web stub: not ported. Returns an empty alert list. */
export async function pollAllAlertSources(
  _prometheusBaseUrl: string,
): Promise<PromAlertCreated[]> {
  return [];
}

/** Web stub: not ported. Resolves without effect. */
export async function meshcentralReboot(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function meshcentralShutdown(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Returns an empty result array. */
export async function meshcentralShellFleet(
  _serverIds: string[],
  _command: string,
  _timeoutSecs?: number,
): Promise<ShellResult[]> {
  return [];
}

/** GET /api/fleet/unraid/get_processes?server_id=X — process list over SSH. */
export async function getProcesses(
  serverId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/unraid/get_processes?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_syslog?server_id=X&lines=N — syslog tail over SSH. */
export async function getSyslog(
  serverId: string,
  lines = 100,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/unraid/get_syslog?server_id=${encodeURIComponent(serverId)}&lines=${encodeURIComponent(
      String(lines),
    )}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_user_scripts?server_id=X — user scripts over SSH. */
export async function getUserScripts(
  serverId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/unraid/get_user_scripts?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** POST /api/fleet/unraid/run_user_script — run a user script over SSH. */
export async function runUserScript(
  serverId: string,
  script: string,
  token?: string,
): Promise<string> {
  return request<string>('/fleet/unraid/run_user_script', {
    method: 'POST',
    body: { server_id: serverId, script },
    token,
  });
}

/** GET /api/fleet/unraid/get_plugins?server_id=X — installed plugins over SSH. */
export async function getPlugins(
  serverId: string,
  token?: string,
): Promise<string[]> {
  return request<string[]>(
    `/fleet/unraid/get_plugins?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_network_interfaces?server_id=X — network interfaces over SSH. */
export async function getNetworkInterfaces(
  serverId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/unraid/get_network_interfaces?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/unraid/get_tailscale_peers?server_id=X — Tailscale peers over SSH. */
export async function getTailscalePeers(
  serverId: string,
  token?: string,
): Promise<string> {
  return request<string>(
    `/fleet/unraid/get_tailscale_peers?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** Web stub: not ported. Resolves without effect. */
export async function dockerRemove(
  _serverId: string,
  _container: string,
): Promise<string> {
  return '';
}

/** Web stub: not ported. Returns null. */
export async function getPhoneCpu(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getKdeConnectNotifications(
  _serverId: string,
): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getKdeConnectMpris(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getPhoneThermal(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getPhoneScreen(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getPhoneNetwork(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function getPhoneActivity(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectMprisPlayPause(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectMprisNext(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectMprisPrevious(
  _serverId: string,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectMprisSetVolume(
  _serverId: string,
  _volume: number,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectRingDevice(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectSendPing(
  _serverId: string,
  _message: string,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectGetClipboard(_serverId: string): Promise<string> {
  return '';
}

/** Web stub: not ported. Returns null. */
export async function getKdeConnectTelephony(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectShareUrl(
  _serverId: string,
  _url: string,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectShareText(
  _serverId: string,
  _text: string,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function phoneSetScreen(
  _serverId: string,
  _on: boolean,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function phoneVolumeUp(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function phoneVolumeDown(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function phoneReboot(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Returns an empty Uint8Array. */
export async function phoneScreenshot(_serverId: string): Promise<Uint8Array> {
  return new Uint8Array(0);
}

/** Web stub: not ported. Resolves without effect. */
export async function launchRustdesk(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Resolves without effect. */
export async function phoneGetSmsByAddress(
  _serverId: string,
  _address: string,
): Promise<any[]> {
  return [];
}

/** Web stub: not ported. Returns an empty array. */
export async function phoneGetSmsConversations(_serverId: string): Promise<any[]> {
  return [];
}

/** Web stub: not ported. Resolves without effect. */
export async function kdeConnectSendSms(
  _serverId: string,
  _number: string,
  _message: string,
): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Returns an empty array. */
export async function phoneGetCallLog(_serverId: string): Promise<any[]> {
  return [];
}

/** Web stub: not ported. Returns an empty array. */
export async function phoneGetContacts(_serverId: string): Promise<any[]> {
  return [];
}

/** Web stub: not ported. Returns an empty array. */
export async function kdeConnectSftpList(
  _serverId: string,
  _path: string,
): Promise<any[]> {
  return [];
}

/** Web stub: not ported. Returns an empty array. */
export async function steamdeckGetSystemStats(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetBattery(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetThermal(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetDisk(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetNetwork(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetGpu(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Resolves without effect. */
export async function steamdeckLaunchRustdesk(_serverId: string): Promise<void> {
  return undefined;
}

/** Web stub: not ported. Returns null. */
export async function steamdeckGetDeskflowStatus(
  _serverId: string,
): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function allyProvision(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function allyLaunchAgent(_serverId: string): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns null. */
export async function meshcentralGetSystemStats(
  _serverId: string,
): Promise<any> {
  return null;
}

/** Web stub: not ported. Returns an empty array. */
export async function promQueryRange(
  _baseUrl: string,
  _query: string,
  _start: string,
  _end: string,
  _step: string,
): Promise<PromSeries[]> {
  return [];
}

/** Web stub: not ported. Returns false. */
export async function prometheusHealth(_baseUrl: string): Promise<boolean> {
  return false;
}
