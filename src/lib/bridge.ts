// KTS Master Control — HTTP bridge client (replaces Tauri `invoke`).
// Pure fetch layer: no Tauri, no Node `fs`. Testable with `fetch` mocked.
//
// Every function below mirrors a former `src/lib/tauri-commands.ts`
// `invoke('<command>', ...)` wrapper, so existing callers keep working once
// `tauri-commands.ts` delegates to this module. Endpoint paths are best-guess
// REST paths and are concentrated here so they can be re-pointed in one place
// when the real bridge contract is known.

export class BridgeError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.status = status;
  }
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8799';
const REQUEST_TIMEOUT_MS = 10_000;

function getBaseUrl(): string {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="bridge-url"]');
    const content = meta?.getAttribute('content');
    if (content) return content;
  }
  return DEFAULT_BASE_URL;
}

function getToken(): string {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="bridge-token"]');
    const content = meta?.getAttribute('content');
    if (content) return content;
  }
  return '';
}

/**
 * Single fetch entry point for every former Tauri `invoke` operation.
 * Resolves the bridge base URL, attaches the `X-API-Token`, applies a
 * timeout, parses JSON responses, and throws a `BridgeError` on non-ok.
 */
export async function bridgeRequest(method: string, path: string, body?: unknown): Promise<any> {
  const url = getBaseUrl() + path;
  const headers: Record<string, string> = { 'X-API-Token': getToken() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const json = await res.json();
        detail = json.error ?? json.message ?? detail;
      } catch {
        // not JSON — keep statusText
      }
      throw new BridgeError(res.status, String(detail));
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) return res.json();
    return res.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

/* ------------------------------------------------------------------ */
/* Servers & devices                                                  */
/* ------------------------------------------------------------------ */

export async function getServers(): Promise<any> {
  return bridgeRequest('GET', '/servers');
}

export async function saveServer(config: unknown): Promise<any> {
  return bridgeRequest('POST', '/servers', config);
}

export async function removeServer(id: string): Promise<any> {
  return bridgeRequest('DELETE', `/servers/${encodeURIComponent(id)}`);
}

export async function getSystemStats(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/system/stats`);
}

export async function getLocalSystemStats(): Promise<any> {
  return bridgeRequest('GET', '/local/system/stats');
}

export async function meshcentralGetFleetStats(): Promise<any> {
  return bridgeRequest('GET', '/meshcentral/fleet/stats');
}

export async function meshcentralGetSystemStats(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/system/stats/${encodeURIComponent(serverId)}`);
}

export async function meshcentralGetProcesses(serverId: string, limit?: number): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/devices/${encodeURIComponent(serverId)}/processes`, {
    serverId,
    limit,
  });
}

export async function meshcentralListDevices(): Promise<any> {
  return bridgeRequest('GET', '/meshcentral/devices');
}

export async function meshcentralGetDeviceStatus(deviceId: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/devices/${encodeURIComponent(deviceId)}/status`);
}

export async function meshcentralExecuteBatch(
  deviceIds: string[],
  commands: { command: string; args?: string[] }[],
): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/devices/batch', { deviceIds, commands });
}

export async function meshcentralSyncFleet(): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/fleet/sync');
}

export async function meshcentralGetTerminalUrl(deviceId: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/devices/${encodeURIComponent(deviceId)}/terminal-url`);
}

export async function meshcentralGetFileManagerUrl(deviceId: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/devices/${encodeURIComponent(deviceId)}/file-manager-url`);
}

export async function meshcentralGetEnrollmentInfo(deviceType: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/enrollment/${encodeURIComponent(deviceType)}`);
}

export async function meshcentralShellFleet(
  serverIds: string[],
  command: string,
  timeoutSecs?: number,
): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/shell/fleet', { serverIds, command, timeoutSecs });
}

export async function meshcentralReboot(serverId: string): Promise<any> {
  return bridgeRequest('POST', `/servers/${encodeURIComponent(serverId)}/reboot`);
}

export async function meshcentralShutdown(serverId: string): Promise<any> {
  return bridgeRequest('POST', `/servers/${encodeURIComponent(serverId)}/shutdown`);
}

export async function testConnection(config: unknown): Promise<any> {
  return bridgeRequest('POST', '/servers/test-connection', config);
}

export async function getTailscalePeers(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/tailscale/peers`);
}

export async function getArrayInfo(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/array`);
}

/* ------------------------------------------------------------------ */
/* Docker                                                             */
/* ------------------------------------------------------------------ */

export async function getDockerContainers(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/docker/containers`);
}

export async function dockerStart(serverId: string, container: string): Promise<any> {
  return bridgeRequest(
    'POST',
    `/servers/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(container)}/start`,
  );
}

export async function dockerStop(serverId: string, container: string): Promise<any> {
  return bridgeRequest(
    'POST',
    `/servers/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(container)}/stop`,
  );
}

export async function dockerRestart(serverId: string, container: string): Promise<any> {
  return bridgeRequest(
    'POST',
    `/servers/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(container)}/restart`,
  );
}

export async function dockerRemove(serverId: string, container: string): Promise<any> {
  return bridgeRequest(
    'DELETE',
    `/servers/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(container)}`,
  );
}

export async function dockerLogs(
  serverId: string,
  container: string,
  lines: number,
): Promise<any> {
  return bridgeRequest(
    'GET',
    `/servers/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(
      container,
    )}/logs?lines=${lines}`,
  );
}

/* ------------------------------------------------------------------ */
/* Unraid storage / system / network                                  */
/* ------------------------------------------------------------------ */

export async function getDisks(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/disks`);
}

export async function getSmartData(serverId: string, device: string): Promise<any> {
  return bridgeRequest(
    'GET',
    `/servers/${encodeURIComponent(serverId)}/disks/${encodeURIComponent(device)}/smart`,
  );
}

export async function getShares(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/shares`);
}

export async function getProcesses(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/processes`);
}

export async function getSyslog(serverId: string, lines: number): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/syslog?lines=${lines}`);
}

export async function getUserScripts(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/scripts`);
}

export async function runUserScript(serverId: string, script: string): Promise<any> {
  return bridgeRequest('POST', `/servers/${encodeURIComponent(serverId)}/scripts/run`, { script });
}

export async function getPlugins(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/plugins`);
}

export async function getNetworkInterfaces(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/network/interfaces`);
}

export async function getGpuInfo(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/servers/${encodeURIComponent(serverId)}/gpu`);
}

/* ------------------------------------------------------------------ */
/* Alerts                                                             */
/* ------------------------------------------------------------------ */

export async function alertList(filter?: unknown): Promise<any> {
  return bridgeRequest('GET', '/alerts', filter);
}

export async function alertGet(id: number): Promise<any> {
  return bridgeRequest('GET', `/alerts/${id}`);
}

export async function alertCreate(
  severity: string,
  title: string,
  message: string,
  deviceId?: string,
  source: string = 'manual',
  autoAckRule?: string,
): Promise<any> {
  return bridgeRequest('POST', '/alerts', { severity, title, message, deviceId, source, autoAckRule });
}

export async function alertDelete(id: number): Promise<any> {
  return bridgeRequest('DELETE', `/alerts/${id}`);
}

export async function alertAcknowledge(id: number, acknowledgedBy: string): Promise<any> {
  return bridgeRequest('POST', `/alerts/${id}/acknowledge`, { acknowledgedBy });
}

export async function alertAcknowledgeAll(
  deviceId?: string,
  acknowledgedBy: string = 'user',
): Promise<any> {
  return bridgeRequest('POST', '/alerts/acknowledge-all', { deviceId, acknowledgedBy });
}

export async function alertEvaluateAutoAck(): Promise<any> {
  return bridgeRequest('POST', '/alerts/auto-ack');
}

/* ------------------------------------------------------------------ */
/* Nextcloud                                                          */
/* ------------------------------------------------------------------ */

export async function getNextcloudInfo(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/nextcloud/info');
}

export async function getNextcloudStatus(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/nextcloud/status');
}

export async function getNextcloudStorage(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/nextcloud/storage');
}

export async function getNextcloudUsers(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/nextcloud/users');
}

export async function getNextcloudActivity(serverId: string, limit?: number): Promise<any> {
  return bridgeRequest('GET', `/services/nextcloud/activity`, { serverId, limit });
}

/* ------------------------------------------------------------------ */
/* Lidarr                                                             */
/* ------------------------------------------------------------------ */

export async function getLidarrStatus(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/status');
}

export async function getLidarrHealth(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/health');
}

export async function getLidarrArtists(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/artists');
}

export async function getLidarrAlbums(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/albums');
}

export async function getLidarrWanted(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/wanted');
}

export async function getLidarrQueue(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/queue');
}

export async function getLidarrDiskspace(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/lidarr/diskspace');
}

export async function lidarrRefreshArtist(_serverId: string, artistId: number): Promise<any> {
  return bridgeRequest('POST', `/services/lidarr/artists/${artistId}/refresh`);
}

export async function lidarrSearchMissing(_serverId: string, artistId: number): Promise<any> {
  return bridgeRequest('POST', `/services/lidarr/artists/${artistId}/search-missing`);
}

/* ------------------------------------------------------------------ */
/* Home Assistant                                                     */
/* ------------------------------------------------------------------ */

export async function getHomeAssistantStates(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/homeassistant/states');
}

export async function getHomeAssistantConfig(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/homeassistant/config');
}

export async function getHomeAssistantAreas(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/homeassistant/areas');
}

export async function getHomeAssistantDevices(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/homeassistant/devices');
}

export async function getHomeAssistantEntities(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/homeassistant/entities');
}

export async function homeAssistantToggle(_serverId: string, entityId: string): Promise<any> {
  return bridgeRequest(
    'POST',
    `/services/homeassistant/entities/${encodeURIComponent(entityId)}/toggle`,
  );
}

export async function homeAssistantTurnOn(_serverId: string, entityId: string): Promise<any> {
  return bridgeRequest('POST', `/services/homeassistant/entities/${encodeURIComponent(entityId)}/on`);
}

export async function homeAssistantTurnOff(_serverId: string, entityId: string): Promise<any> {
  return bridgeRequest('POST', `/services/homeassistant/entities/${encodeURIComponent(entityId)}/off`);
}

/* ------------------------------------------------------------------ */
/* MySpeed                                                            */
/* ------------------------------------------------------------------ */

export async function getMySpeedSummary(serverId: string, limit?: number): Promise<any> {
  return bridgeRequest('GET', `/services/myspeed/summary`, { serverId, limit });
}

export async function getMySpeedTests(serverId: string, limit: number): Promise<any> {
  return bridgeRequest('GET', `/services/myspeed/tests`, { serverId, limit });
}

export async function getMySpeedServers(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/myspeed/servers');
}

/* ------------------------------------------------------------------ */
/* AdGuard Home                                                       */
/* ------------------------------------------------------------------ */

export async function getAdGuardStatus(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/adguard/status');
}

export async function getAdGuardStats(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/adguard/stats');
}

export async function getAdGuardQueryLog(
  serverId: string,
  limit: number,
  offset: number,
): Promise<any> {
  return bridgeRequest('GET', `/services/adguard/query-log`, { serverId, limit, offset });
}

export async function getAdGuardClients(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/adguard/clients');
}

export async function getAdGuardFilters(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/adguard/filters');
}

export async function getAdGuardDhcp(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/adguard/dhcp');
}

export async function adguardEnable(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/services/adguard/enable');
}

export async function adguardDisable(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/services/adguard/disable');
}

/* ------------------------------------------------------------------ */
/* Phone                                                              */
/* ------------------------------------------------------------------ */

export async function getPhoneDeviceInfo(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/device-info');
}

export async function getPhoneBattery(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/battery');
}

export async function getPhoneThermal(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/thermal');
}

export async function getPhoneStorage(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/storage');
}

export async function getPhoneMemory(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/memory');
}

export async function getPhoneCpu(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/cpu');
}

export async function getPhoneScreen(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/screen');
}

export async function getPhoneNetwork(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/network');
}

export async function getPhoneApps(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/apps');
}

export async function getPhoneProcesses(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/processes');
}

export async function getPhoneActivity(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/activity');
}

export async function phoneSetScreen(_serverId: string, on: boolean): Promise<any> {
  return bridgeRequest('POST', '/phone/screen', { on });
}

export async function phoneSetBrightness(_serverId: string, value: number): Promise<any> {
  return bridgeRequest('POST', '/phone/brightness', { value });
}

export async function phoneSetAutoBrightness(_serverId: string, enabled: boolean): Promise<any> {
  return bridgeRequest('POST', '/phone/brightness/auto', { enabled });
}

export async function phoneVolumeUp(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/phone/volume/up');
}

export async function phoneVolumeDown(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/phone/volume/down');
}

export async function phoneReboot(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/phone/reboot');
}

export async function launchRustdesk(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/phone/rustdesk/launch');
}

export async function phoneScreenshot(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/screenshot');
}

export async function phoneScreenshotSave(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/phone/screenshot/save');
}

export async function phoneForceStopApp(_serverId: string, packageName: string): Promise<any> {
  return bridgeRequest('POST', '/phone/apps/force-stop', { package: packageName });
}

export async function phoneGetSmsInbox(_serverId: string, limit?: number): Promise<any> {
  return bridgeRequest('GET', '/phone/sms/inbox', { limit });
}

export async function phoneGetSmsByAddress(serverId: string, address: string): Promise<any> {
  return bridgeRequest('GET', `/phone/sms/by-address`, { serverId, address });
}

export async function phoneGetSmsConversations(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/sms/conversations');
}

export async function phoneSendSms(_serverId: string, address: string, body: string): Promise<any> {
  return bridgeRequest('POST', '/phone/sms/send', { address, body });
}

export async function phoneGetContacts(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/contacts');
}

export async function phoneGetCallLog(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/phone/call-log');
}

/* ------------------------------------------------------------------ */
/* KDE Connect                                                        */
/* ------------------------------------------------------------------ */

export async function getKdeConnectBattery(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/battery');
}

export async function getKdeConnectNotifications(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/notifications');
}

export async function getKdeConnectNotification(_serverId: string, id: string): Promise<any> {
  return bridgeRequest('GET', `/kdeconnect/notifications/${encodeURIComponent(id)}`);
}

export async function getKdeConnectMpris(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/mpris');
}

export async function kdeConnectMprisPlay(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/play');
}

export async function kdeConnectMprisPause(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/pause');
}

export async function kdeConnectMprisPlayPause(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/play-pause');
}

export async function kdeConnectMprisNext(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/next');
}

export async function kdeConnectMprisPrevious(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/previous');
}

export async function kdeConnectMprisSetVolume(_serverId: string, volume: number): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/mpris/volume', { volume });
}

export async function getKdeConnectConnectivity(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/connectivity');
}

export async function getKdeConnectTelephony(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/telephony');
}

export async function kdeConnectRingDevice(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/ring');
}

export async function kdeConnectSendPing(_serverId: string, message: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/ping', { message });
}

export async function kdeConnectSendSms(_serverId: string, number: string, message: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/sms/send', { number, message });
}

export async function kdeConnectSendClipboard(_serverId: string, text: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/clipboard/send', { text });
}

export async function kdeConnectGetClipboard(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/clipboard');
}

export async function getKdeConnectContacts(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/contacts');
}

export async function kdeConnectSftpList(_serverId: string, path: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/sftp/list', { path });
}

export async function kdeConnectShareFile(_serverId: string, path: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/share/file', { path });
}

export async function kdeConnectShareUrl(_serverId: string, url: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/share/url', { url });
}

export async function kdeConnectShareText(_serverId: string, text: string): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/share/text', { text });
}

export async function getKdeConnectConversations(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/conversations');
}

export async function replyKdeConnectConversation(
  _serverId: string,
  threadId: number,
  message: string,
): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/conversations/reply', { threadId, message });
}

export async function requestKdeConnectConversation(
  _serverId: string,
  threadId: number,
): Promise<any> {
  return bridgeRequest('POST', '/kdeconnect/conversations/request', { threadId });
}

export async function kdeConnectListDevices(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/kdeconnect/devices');
}

/* ------------------------------------------------------------------ */
/* Steam Deck / ROG Ally                                              */
/* ------------------------------------------------------------------ */

export async function steamdeckGetSystemStats(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/system/stats');
}

export async function steamdeckGetBattery(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/battery');
}

export async function steamdeckGetThermal(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/thermal');
}

export async function steamdeckGetDisk(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/disk');
}

export async function steamdeckGetNetwork(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/network');
}

export async function steamdeckGetGpu(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/gpu');
}

export async function steamdeckLaunchRustdesk(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/steamdeck/rustdesk/launch');
}

export async function steamdeckGetDeskflowStatus(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/steamdeck/deskflow/status');
}

export async function allyProvision(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/ally/provision');
}

export async function allyLaunchAgent(_serverId: string): Promise<any> {
  return bridgeRequest('POST', '/ally/agent');
}

/* ------------------------------------------------------------------ */
/* MeshCentral transport (shell / files / docker)                     */
/* ------------------------------------------------------------------ */

export async function meshcentralShellExec(
  serverId: string,
  command: string,
  timeoutSecs?: number,
): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/shell/exec', { serverId, command, timeoutSecs });
}

export async function meshcentralShellBatch(
  serverId: string,
  commands: string[],
  timeoutSecs?: number,
): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/shell/batch', { serverId, commands, timeoutSecs });
}

export async function meshcentralReadFile(serverId: string, path: string): Promise<any> {
  return bridgeRequest('GET', '/meshcentral/read-file', { serverId, path });
}

export async function meshcentralWriteFile(
  serverId: string,
  path: string,
  content: string,
  mode?: number,
): Promise<any> {
  return bridgeRequest('POST', '/meshcentral/write-file', { serverId, path, content, mode });
}

export async function meshcentralListDir(serverId: string, path: string): Promise<any> {
  return bridgeRequest('GET', '/meshcentral/list-dir', { serverId, path });
}

export async function meshcentralDockerContainers(serverId: string): Promise<any> {
  return bridgeRequest('GET', `/meshcentral/devices/${encodeURIComponent(serverId)}/docker/containers`);
}

export async function meshcentralDockerStart(
  serverId: string,
  container: string,
): Promise<any> {
  return bridgeRequest(
    'POST',
    `/meshcentral/devices/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(
      container,
    )}/start`,
  );
}

export async function meshcentralDockerStop(
  serverId: string,
  container: string,
): Promise<any> {
  return bridgeRequest(
    'POST',
    `/meshcentral/devices/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(
      container,
    )}/stop`,
  );
}

export async function meshcentralDockerRestart(
  serverId: string,
  container: string,
): Promise<any> {
  return bridgeRequest(
    'POST',
    `/meshcentral/devices/${encodeURIComponent(serverId)}/docker/containers/${encodeURIComponent(
      container,
    )}/restart`,
  );
}

/* ------------------------------------------------------------------ */
/* Metrics / Prometheus                                               */
/* ------------------------------------------------------------------ */

export async function metricRecord(
  deviceId: string,
  metric: string,
  value: number,
): Promise<any> {
  return bridgeRequest('POST', '/metrics/record', { deviceId, metric, value });
}

export async function metricQuery(
  deviceId: string,
  metric: string,
  from: string,
  to?: string,
  limit?: number,
): Promise<any> {
  return bridgeRequest('POST', '/metrics/query', { deviceId, metric, from, to, limit });
}

export async function metricQueryMulti(
  deviceIds: string[],
  metrics: string[],
  from: string,
  to?: string,
): Promise<any> {
  return bridgeRequest('POST', '/metrics/query-multi', { deviceIds, metrics, from, to });
}

export async function metricCollectAll(): Promise<any> {
  return bridgeRequest('POST', '/metrics/collect-all');
}

export async function promQueryRange(
  baseUrl: string,
  query: string,
  start: string,
  end: string,
  step: string,
): Promise<any> {
  return bridgeRequest('POST', '/prometheus/query-range', { baseUrl, query, start, end, step });
}

export async function prometheusHealth(baseUrl: string): Promise<any> {
  return bridgeRequest('GET', '/prometheus/health', { baseUrl });
}

export async function pollPrometheusAlerts(baseUrl: string): Promise<any> {
  return bridgeRequest('POST', '/alerts/poll-prometheus', { baseUrl });
}

export async function pollMeshcentralStatusChanges(): Promise<any> {
  return bridgeRequest('POST', '/alerts/poll-meshcentral');
}

export async function pollAllAlertSources(prometheusBaseUrl: string): Promise<any> {
  return bridgeRequest('POST', '/alerts/poll-all', { prometheusBaseUrl });
}

/* ------------------------------------------------------------------ */
/* Embedded terminal                                                  */
/* ------------------------------------------------------------------ */

export interface TerminalChunk {
  session_id: string;
  data: number[];
  closed: boolean;
  exit_status: number | null;
}

export async function terminalOpen(
  serverId: string,
  cols: number,
  rows: number,
  _onChunk: (chunk: TerminalChunk) => void,
): Promise<string> {
  return bridgeRequest('POST', '/terminal/open', { serverId, cols, rows });
}

export async function terminalWrite(sessionId: string, data: string): Promise<any> {
  return bridgeRequest('POST', '/terminal/write', { sessionId, data });
}

export async function terminalResize(
  sessionId: string,
  cols: number,
  rows: number,
): Promise<any> {
  return bridgeRequest('POST', '/terminal/resize', { sessionId, cols, rows });
}

export async function terminalClose(sessionId: string): Promise<any> {
  return bridgeRequest('POST', '/terminal/close', { sessionId });
}

/* ------------------------------------------------------------------ */
/* OpenCode chat                                                      */
/* ------------------------------------------------------------------ */

export async function opencodeStart(): Promise<any> {
  return bridgeRequest('POST', '/opencode/start');
}

export async function opencodeStop(): Promise<any> {
  return bridgeRequest('POST', '/opencode/stop');
}

export async function opencodeStatus(): Promise<any> {
  return bridgeRequest('GET', '/opencode/status');
}

export async function opencodeNewSession(title?: string): Promise<any> {
  return bridgeRequest('POST', '/opencode/session', { title });
}

export async function opencodeSendMessage(
  sessionId: string,
  message: string,
  agent?: string,
): Promise<any> {
  return bridgeRequest('POST', '/opencode/session/message', { sessionId, message, agent });
}

export async function opencodeGetHistory(sessionId: string): Promise<any> {
  return bridgeRequest('GET', `/opencode/session/${encodeURIComponent(sessionId)}/history`);
}

export async function opencodeAbort(sessionId: string): Promise<any> {
  return bridgeRequest('POST', '/opencode/session/abort', { sessionId });
}

/* ------------------------------------------------------------------ */
/* Ticketing (TicketingPage calls these via invoke strings today)     */
/* ------------------------------------------------------------------ */

export async function ticketingOverview(): Promise<any> {
  return bridgeRequest('GET', '/tickets?all=true');
}

export async function ticketingCreateTicket(payload: {
  title: string;
  priority?: string;
  type?: string;
  category?: string;
}): Promise<any> {
  return bridgeRequest('POST', '/tickets', payload);
}

export async function ticketingAddWorklog(
  ticketId: string,
  entry: { date: string; mode: string; hours: number; payment: string; entry: string },
): Promise<any> {
  return bridgeRequest('POST', `/tickets/${encodeURIComponent(ticketId)}/worklog`, entry);
}

export async function ticketingChangeStatus(ticketId: string, status: string): Promise<any> {
  return bridgeRequest('POST', `/tickets/${encodeURIComponent(ticketId)}/status`, { status });
}

/* ------------------------------------------------------------------ */
/* Defined in tauri-commands.ts but not imported by src (kept for       */
/* completeness of the re-export surface).                            */
/* ------------------------------------------------------------------ */

export async function getRestServiceHealth(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/rest/health');
}

export async function getPlexIdentity(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/plex/identity');
}

export async function getPlexLibraries(_serverId: string): Promise<any> {
  return bridgeRequest('GET', '/services/plex/libraries');
}
