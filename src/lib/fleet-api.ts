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
 * Everything else in tauri-commands.ts stays a "not ported yet" stub there.
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
  LidarrStatus,
  LidarrHealthIssue,
  LidarrArtist,
  LidarrAlbum,
  LidarrWantedMissing,
  LidarrQueue,
  LidarrDiskSpace,
  MySpeedTest,
  MySpeedServer,
  MySpeedSummary,
  MeshDevice,
  DeviceStatus,
  BatchCommand,
  BatchResult,
  EnrollmentInfo,
  SyncResult,
} from './types';

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
// REST health (ported from tauri-commands.ts)
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
// Nextcloud (ported from tauri-commands.ts)
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
// AdGuard Home (ported from tauri-commands.ts)
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
// Home Assistant (ported from tauri-commands.ts)
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
// Lidarr (ported from tauri-commands.ts)
// ---------------------------------------------------------------------------

/** GET /api/fleet/lidarr/get_lidarr_status?server_id=X — Lidarr server status. */
export async function getLidarrStatus(
  serverId: string,
  token?: string,
): Promise<LidarrStatus> {
  return request<LidarrStatus>(
    `/fleet/lidarr/get_lidarr_status?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/lidarr/get_lidarr_health?server_id=X — Lidarr health issues. */
export async function getLidarrHealth(
  serverId: string,
  token?: string,
): Promise<LidarrHealthIssue[]> {
  return request<LidarrHealthIssue[]>(
    `/fleet/lidarr/get_lidarr_health?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/lidarr/get_lidarr_artists?server_id=X — Lidarr artists. */
export async function getLidarrArtists(
  serverId: string,
  token?: string,
): Promise<LidarrArtist[]> {
  return request<LidarrArtist[]>(
    `/fleet/lidarr/get_lidarr_artists?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** GET /api/fleet/lidarr/get_lidarr_albums?server_id=X&artistId=X&monitored=X — Lidarr albums. */
export async function getLidarrAlbums(
  serverId: string,
  artistId?: number,
  monitored?: boolean,
  token?: string,
): Promise<LidarrAlbum[]> {
  const url = `/fleet/lidarr/get_lidarr_albums?server_id=${encodeURIComponent(
    serverId,
  )}${artistId !== undefined ? `&artist_id=${encodeURIComponent(String(artistId))}` : ""}${
    monitored !== undefined ? `&monitored=${encodeURIComponent(String(monitored))}` : ""
  }`;
  return request<LidarrAlbum[]>(url, { token });
}

/** GET /api/fleet/lidarr/get_lidarr_wanted?server_id=X&page=X&pageSize=X — wanted/missing. */
export async function getLidarrWanted(
  serverId: string,
  page?: number,
  pageSize?: number,
  token?: string,
): Promise<LidarrWantedMissing> {
  const url = `/fleet/lidarr/get_lidarr_wanted?server_id=${encodeURIComponent(
    serverId,
  )}${page !== undefined ? `&page=${encodeURIComponent(String(page))}` : ""}${
    pageSize !== undefined
      ? `&pageSize=${encodeURIComponent(String(pageSize))}`
      : ""
  }`;
  return request<LidarrWantedMissing>(url, { token });
}

/** GET /api/fleet/lidarr/get_lidarr_queue?server_id=X&page=X&pageSize=X — download queue. */
export async function getLidarrQueue(
  serverId: string,
  page?: number,
  pageSize?: number,
  token?: string,
): Promise<LidarrQueue> {
  const url = `/fleet/lidarr/get_lidarr_queue?server_id=${encodeURIComponent(
    serverId,
  )}${page !== undefined ? `&page=${encodeURIComponent(String(page))}` : ""}${
    pageSize !== undefined
      ? `&pageSize=${encodeURIComponent(String(pageSize))}`
      : ""
  }`;
  return request<LidarrQueue>(url, { token });
}

/** GET /api/fleet/lidarr/get_lidarr_diskspace?server_id=X — Lidarr disk space. */
export async function getLidarrDiskspace(
  serverId: string,
  token?: string,
): Promise<LidarrDiskSpace[]> {
  return request<LidarrDiskSpace[]>(
    `/fleet/lidarr/get_lidarr_diskspace?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

/** POST /api/fleet/lidarr/lidarr_refresh_artist?server_id=X&artistId=X — refresh an artist. */
export async function lidarrRefreshArtist(
  serverId: string,
  artistId: number,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/lidarr/lidarr_refresh_artist?server_id=${encodeURIComponent(
      serverId,
    )}&artist_id=${encodeURIComponent(String(artistId))}`,
    { method: 'POST', token },
  );
}

/** POST /api/fleet/lidarr/lidarr_search_missing?server_id=X&artistId=X — search missing albums. */
export async function lidarrSearchMissing(
  serverId: string,
  artistId: number,
  token?: string,
): Promise<void> {
  return request<void>(
    `/fleet/lidarr/lidarr_search_missing?server_id=${encodeURIComponent(
      serverId,
    )}&artist_id=${encodeURIComponent(String(artistId))}`,
    { method: 'POST', token },
  );
}

// ---------------------------------------------------------------------------
// MySpeed (ported from tauri-commands.ts)
// ---------------------------------------------------------------------------

/** GET /api/fleet/myspeed/summary?server_id=X&limit=X — MySpeed summary. */
export async function getMySpeedSummary(
  serverId: string,
  limit?: number,
  token?: string,
): Promise<MySpeedSummary> {
  const url = `/fleet/myspeed/summary?server_id=${encodeURIComponent(
    serverId,
  )}${limit !== undefined ? `&limit=${encodeURIComponent(String(limit))}` : ""}`;
  return request<MySpeedSummary>(url, { token });
}

/** GET /api/fleet/myspeed/tests?server_id=X&limit=X — recent speedtest results. */
export async function getMySpeedTests(
  serverId: string,
  limit: number,
  token?: string,
): Promise<MySpeedTest[]> {
  return request<MySpeedTest[]>(
    `/fleet/myspeed/tests?server_id=${encodeURIComponent(serverId)}&limit=${encodeURIComponent(String(limit))}`,
    { token },
  );
}

/** GET /api/fleet/myspeed/servers?server_id=X — MySpeed test servers. */
export async function getMySpeedServers(
  serverId: string,
  token?: string,
): Promise<MySpeedServer[]> {
  return request<MySpeedServer[]>(
    `/fleet/myspeed/servers?server_id=${encodeURIComponent(serverId)}`,
    { token },
  );
}

// ---------------------------------------------------------------------------
// MeshCentral (ported from tauri-commands.ts)
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
