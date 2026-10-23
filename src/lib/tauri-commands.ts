import { invoke, Channel } from '@tauri-apps/api/core';
import type {
  ServerConfig, GpuInfo, SmartInfo, TestConnectionResult,
  RestServiceHealth, PlexIdentity, PlexLibrary,
  MeshDevice, DeviceStatus, BatchCommand, BatchResult,
  EnrollmentInfo, SyncResult,
  ShellResult, RemoteFileInfo, RemoteProcess, MeshSystemStats,
  Alert, AlertFilter, AlertSeverity, MetricPoint, MetricSeries,
  OpencodeStatus, ChatMessage,
} from './types';

export type { Alert, AlertFilter, AlertSeverity, MetricPoint, MetricSeries };

export async function testConnection(config: ServerConfig): Promise<TestConnectionResult> {
  return invoke('test_connection', { config });
}

export async function saveServer(config: ServerConfig): Promise<void> {
  return invoke('save_server', { config });
}

export async function removeServer(id: string): Promise<void> {
  return invoke('remove_server', { id });
}

export async function getServers(): Promise<ServerConfig[]> {
  return invoke('get_servers');
}

export async function getSystemStats(serverId: string): Promise<any> {
  return invoke('get_system_stats', { serverId });
}

export async function getDockerContainers(serverId: string): Promise<any[]> {
  return invoke('get_docker_containers', { serverId });
}

export async function dockerStart(serverId: string, container: string): Promise<string> {
  return invoke('docker_start', { serverId, container });
}

export async function dockerStop(serverId: string, container: string): Promise<string> {
  return invoke('docker_stop', { serverId, container });
}

export async function dockerRestart(serverId: string, container: string): Promise<string> {
  return invoke('docker_restart', { serverId, container });
}

export async function dockerLogs(serverId: string, container: string, lines: number): Promise<string> {
  return invoke('docker_logs', { serverId, container, lines });
}

export async function dockerRemove(serverId: string, container: string): Promise<string> {
  return invoke('docker_remove', { serverId, container });
}

export async function getGpuInfo(serverId: string): Promise<GpuInfo | null> {
  return invoke('get_gpu_info', { serverId });
}

export async function getDisks(serverId: string): Promise<any[]> {
  return invoke('get_disks', { serverId });
}

export async function getSmartData(serverId: string, device: string): Promise<SmartInfo> {
  return invoke('get_smart_data', { serverId, device });
}

export async function getShares(serverId: string): Promise<any[]> {
  return invoke('get_shares', { serverId });
}

export async function getProcesses(serverId: string): Promise<string> {
  return invoke('get_processes', { serverId });
}

export async function getSyslog(serverId: string, lines: number): Promise<string> {
  return invoke('get_syslog', { serverId, lines });
}

export async function getUserScripts(serverId: string): Promise<string> {
  return invoke('get_user_scripts', { serverId });
}

export async function runUserScript(serverId: string, script: string): Promise<string> {
  return invoke('run_user_script', { serverId, script });
}

export async function getPlugins(serverId: string): Promise<string[]> {
  return invoke('get_plugins', { serverId });
}

export async function getNetworkInterfaces(serverId: string): Promise<string> {
  return invoke('get_network_interfaces', { serverId });
}

export async function getTailscalePeers(serverId: string): Promise<string> {
  return invoke('get_tailscale_peers', { serverId });
}

export async function rebootServer(serverId: string): Promise<string> {
  return invoke('reboot_server', { serverId });
}

export async function shutdownServer(serverId: string): Promise<string> {
  return invoke('shutdown_server', { serverId });
}

export async function getArrayInfo(serverId: string): Promise<any> {
  return invoke('get_array_info', { serverId });
}

// Nextcloud
export async function getNextcloudInfo(serverId: string): Promise<any> {
  return invoke('get_nextcloud_info', { serverId });
}

export async function getNextcloudStatus(serverId: string): Promise<any> {
  return invoke('get_nextcloud_status', { serverId });
}

export async function getNextcloudStorage(serverId: string): Promise<any> {
  return invoke('get_nextcloud_storage', { serverId });
}

export async function getNextcloudUsers(serverId: string): Promise<any> {
  return invoke('get_nextcloud_users', { serverId });
}

export async function getNextcloudActivity(serverId: string, limit?: number): Promise<any> {
  return invoke('get_nextcloud_activity', { serverId, limit });
}

// Lidarr
export async function getLidarrStatus(serverId: string): Promise<any> {
  return invoke('get_lidarr_status', { serverId });
}

export async function getLidarrHealth(serverId: string): Promise<any> {
  return invoke('get_lidarr_health', { serverId });
}

export async function getLidarrArtists(serverId: string): Promise<any> {
  return invoke('get_lidarr_artists', { serverId });
}

export async function getLidarrAlbums(serverId: string): Promise<any> {
  return invoke('get_lidarr_albums', { serverId });
}

export async function getLidarrWanted(serverId: string): Promise<any> {
  return invoke('get_lidarr_wanted', { serverId });
}

export async function getLidarrQueue(serverId: string): Promise<any> {
  return invoke('get_lidarr_queue', { serverId });
}

export async function getLidarrDiskspace(serverId: string): Promise<any> {
  return invoke('get_lidarr_diskspace', { serverId });
}

export async function lidarrRefreshArtist(serverId: string, artistId: number): Promise<void> {
  return invoke('lidarr_refresh_artist', { serverId, artistId });
}

export async function lidarrSearchMissing(serverId: string, artistId: number): Promise<void> {
  return invoke('lidarr_search_missing', { serverId, artistId });
}

// Home Assistant
export async function getHomeAssistantStates(serverId: string): Promise<any> {
  return invoke('get_homeassistant_states', { serverId });
}

export async function getHomeAssistantConfig(serverId: string): Promise<any> {
  return invoke('get_homeassistant_config', { serverId });
}

export async function getHomeAssistantAreas(serverId: string): Promise<any> {
  return invoke('get_homeassistant_areas', { serverId });
}

export async function getHomeAssistantDevices(serverId: string): Promise<any> {
  return invoke('get_homeassistant_devices', { serverId });
}

export async function getHomeAssistantEntities(serverId: string): Promise<any> {
  return invoke('get_homeassistant_entities', { serverId });
}

export async function homeAssistantToggle(serverId: string, entityId: string): Promise<void> {
  return invoke('homeassistant_toggle', { serverId, entityId });
}

export async function homeAssistantTurnOn(serverId: string, entityId: string): Promise<void> {
  return invoke('homeassistant_turn_on', { serverId, entityId });
}

export async function homeAssistantTurnOff(serverId: string, entityId: string): Promise<void> {
  return invoke('homeassistant_turn_off', { serverId, entityId });
}

// MySpeed
export async function getMySpeedSummary(serverId: string, limit?: number): Promise<any> {
  return invoke('get_myspeed_summary', { serverId, limit });
}

export async function getMySpeedTests(serverId: string, limit: number): Promise<any> {
  return invoke('get_myspeed_tests', { serverId, limit });
}

export async function getMySpeedServers(serverId: string): Promise<any> {
  return invoke('get_myspeed_servers', { serverId });
}

// AdGuard Home
export async function getAdGuardStatus(serverId: string): Promise<any> {
  return invoke('get_adguard_status', { serverId });
}

export async function getAdGuardStats(serverId: string): Promise<any> {
  return invoke('get_adguard_stats', { serverId });
}

export async function getAdGuardQueryLog(serverId: string, limit: number, offset: number): Promise<any> {
  return invoke('get_adguard_query_log', { serverId, limit, offset });
}

export async function getAdGuardClients(serverId: string): Promise<any> {
  return invoke('get_adguard_clients', { serverId });
}

export async function getAdGuardFilters(serverId: string): Promise<any> {
  return invoke('get_adguard_filters', { serverId });
}

export async function getAdGuardDhcp(serverId: string): Promise<any> {
  return invoke('get_adguard_dhcp', { serverId });
}

export async function adguardEnable(serverId: string): Promise<void> {
  return invoke('adguard_enable', { serverId });
}

export async function adguardDisable(serverId: string): Promise<void> {
  return invoke('adguard_disable', { serverId });
}

// Phone
export async function getPhoneDeviceInfo(serverId: string): Promise<any> {
  return invoke('get_phone_device_info', { serverId });
}

export async function getPhoneBattery(serverId: string): Promise<any> {
  return invoke('get_phone_battery', { serverId });
}

export async function getPhoneThermal(serverId: string): Promise<any> {
  return invoke('get_phone_thermal', { serverId });
}

export async function getPhoneStorage(serverId: string): Promise<any> {
  return invoke('get_phone_storage', { serverId });
}

export async function getPhoneMemory(serverId: string): Promise<any> {
  return invoke('get_phone_memory', { serverId });
}

export async function getPhoneCpu(serverId: string): Promise<any> {
  return invoke('get_phone_cpu', { serverId });
}

export async function getPhoneScreen(serverId: string): Promise<any> {
  return invoke('get_phone_screen', { serverId });
}

export async function getPhoneNetwork(serverId: string): Promise<any> {
  return invoke('get_phone_network', { serverId });
}

export async function getPhoneApps(serverId: string): Promise<any> {
  return invoke('get_phone_apps', { serverId });
}

export async function getPhoneProcesses(serverId: string): Promise<any> {
  return invoke('get_phone_processes', { serverId });
}

export async function getPhoneActivity(serverId: string): Promise<any> {
  return invoke('get_phone_activity', { serverId });
}

export async function phoneSetScreen(serverId: string, on: boolean): Promise<void> {
  return invoke('phone_set_screen', { serverId, on });
}

export async function phoneSetBrightness(serverId: string, value: number): Promise<void> {
  return invoke('phone_set_brightness', { serverId, value });
}

export async function phoneSetAutoBrightness(serverId: string, enabled: boolean): Promise<void> {
  return invoke('phone_set_auto_brightness', { serverId, enabled });
}

export async function phoneVolumeUp(serverId: string): Promise<void> {
  return invoke('phone_volume_up', { serverId });
}

export async function phoneVolumeDown(serverId: string): Promise<void> {
  return invoke('phone_volume_down', { serverId });
}

export async function phoneReboot(serverId: string): Promise<void> {
  return invoke('phone_reboot', { serverId });
}

export async function phoneScreenshot(serverId: string): Promise<Uint8Array> {
  return invoke('phone_screenshot', { serverId });
}

export async function phoneScreenshotSave(serverId: string): Promise<string> {
  return invoke('phone_screenshot_save', { serverId });
}

export async function phoneForceStopApp(serverId: string, packageName: string): Promise<void> {
  return invoke('phone_force_stop_app', { serverId, package: packageName });
}

export async function phoneGetSmsInbox(serverId: string, limit?: number): Promise<any[]> {
  return invoke('phone_get_sms_inbox', { serverId, limit });
}

export async function phoneGetSmsByAddress(serverId: string, address: string): Promise<any[]> {
  return invoke('phone_get_sms_by_address', { serverId, address });
}

export async function phoneGetSmsConversations(serverId: string): Promise<any[]> {
  return invoke('phone_get_sms_conversations', { serverId });
}

export async function phoneSendSms(serverId: string, address: string, body: string): Promise<void> {
  return invoke('phone_send_sms', { serverId, address, body });
}

export async function launchRustdesk(serverId: string): Promise<void> {
  return invoke('launch_rustdesk', { serverId });
}

// KDE Connect
export async function getKdeConnectBattery(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_battery', { serverId });
}

export async function getKdeConnectNotifications(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_notifications', { serverId });
}

export async function getKdeConnectNotification(serverId: string, id: string): Promise<any> {
  return invoke('get_kdeconnect_notification', { serverId, id });
}

export async function getKdeConnectMpris(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_mpris', { serverId });
}

export async function kdeConnectMprisPlay(serverId: string): Promise<void> {
  return invoke('kdeconnect_mpris_play', { serverId });
}

export async function kdeConnectMprisPause(serverId: string): Promise<void> {
  return invoke('kdeconnect_mpris_pause', { serverId });
}

export async function kdeConnectMprisPlayPause(serverId: string): Promise<void> {
  return invoke('kdeconnect_mpris_play_pause', { serverId });
}

export async function kdeConnectMprisNext(serverId: string): Promise<void> {
  return invoke('kdeconnect_mpris_next', { serverId });
}

export async function kdeConnectMprisPrevious(serverId: string): Promise<void> {
  return invoke('kdeconnect_mpris_previous', { serverId });
}

export async function kdeConnectMprisSetVolume(serverId: string, volume: number): Promise<void> {
  return invoke('kdeconnect_mpris_set_volume', { serverId, volume });
}

export async function getKdeConnectConnectivity(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_connectivity', { serverId });
}

export async function getKdeConnectTelephony(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_telephony', { serverId });
}

export async function kdeConnectRingDevice(serverId: string): Promise<void> {
  return invoke('kdeconnect_ring_device', { serverId });
}

export async function kdeConnectSendPing(serverId: string, message: string): Promise<void> {
  return invoke('kdeconnect_send_ping', { serverId, message });
}

export async function kdeConnectSendSms(serverId: string, number: string, message: string): Promise<void> {
  return invoke('kdeconnect_send_sms', { serverId, number, message });
}

export async function kdeConnectSendClipboard(serverId: string, text: string): Promise<void> {
  return invoke('kdeconnect_send_clipboard', { serverId, text });
}

export async function kdeConnectGetClipboard(serverId: string): Promise<string> {
  return invoke('kdeconnect_get_clipboard', { serverId });
}

export async function getKdeConnectContacts(serverId: string): Promise<any> {
  return invoke('get_kdeconnect_contacts', { serverId });
}

export async function kdeConnectSftpList(serverId: string, path: string): Promise<any> {
  return invoke('kdeconnect_sftp_list', { serverId, path });
}

export async function kdeConnectShareFile(serverId: string, path: string): Promise<void> {
  return invoke('kdeconnect_share_file', { serverId, path });
}

export async function kdeConnectShareUrl(serverId: string, url: string): Promise<void> {
  return invoke('kdeconnect_share_url', { serverId, url });
}

export async function kdeConnectShareText(serverId: string, text: string): Promise<void> {
  return invoke('kdeconnect_share_text', { serverId, text });
}

export async function getKdeConnectConversations(serverId: string): Promise<any> {
  return invoke('kdeconnect_get_conversations', { serverId });
}

export async function replyKdeConnectConversation(serverId: string, threadId: number, message: string): Promise<void> {
  return invoke('kdeconnect_reply_conversation', { serverId, threadId, message });
}

export async function requestKdeConnectConversation(serverId: string, threadId: number): Promise<void> {
  return invoke('kdeconnect_request_conversation', { serverId, threadId });
}

export async function phoneGetContacts(serverId: string): Promise<any> {
  return invoke('phone_get_contacts', { serverId });
}

export async function phoneGetCallLog(serverId: string): Promise<any> {
  return invoke('phone_get_call_log', { serverId });
}

export async function kdeConnectListDevices(serverId: string): Promise<any> {
  return invoke('kdeconnect_list_devices', { serverId });
}

// Steam Deck / Linux Handheld
export async function steamdeckGetSystemStats(serverId: string): Promise<any> {
  return invoke('steamdeck_get_system_stats', { serverId });
}

export async function steamdeckGetBattery(serverId: string): Promise<any> {
  return invoke('steamdeck_get_battery', { serverId });
}

export async function steamdeckGetThermal(serverId: string): Promise<any> {
  return invoke('steamdeck_get_thermal', { serverId });
}

export async function steamdeckGetDisk(serverId: string): Promise<any> {
  return invoke('steamdeck_get_disk', { serverId });
}

export async function steamdeckGetNetwork(serverId: string): Promise<any> {
  return invoke('steamdeck_get_network', { serverId });
}

export async function steamdeckGetGpu(serverId: string): Promise<any> {
  return invoke('steamdeck_get_gpu', { serverId });
}

export async function steamdeckLaunchRustdesk(serverId: string): Promise<void> {
  return invoke('steamdeck_launch_rustdesk', { serverId });
}

export async function steamdeckGetDeskflowStatus(serverId: string): Promise<any> {
  return invoke('steamdeck_get_deskflow_status', { serverId });
}

export async function allyProvision(serverId: string): Promise<any> {
  return invoke('ally_provision', { serverId });
}

export async function allyLaunchAgent(serverId: string): Promise<{ ok: boolean; terminal?: string }> {
  return invoke('ally_launch_agent', { serverId });
}

// Local "This System" (the machine running KTS Master Control itself)
export async function getLocalSystemStats(): Promise<any> {
  return invoke('get_local_system_stats');
}
// REST services — see the note on RestServiceHealth in types.ts.
export async function getRestServiceHealth(serverId: string): Promise<RestServiceHealth[]> {
  return invoke('get_rest_service_health', { serverId });
}

export async function getPlexIdentity(serverId: string): Promise<PlexIdentity> {
  return invoke('get_plex_identity', { serverId });
}

export async function getPlexLibraries(serverId: string): Promise<PlexLibrary[]> {
  return invoke('get_plex_libraries', { serverId });
}

// MeshCentral commands (2026-10-07)
export async function meshcentralListDevices(): Promise<MeshDevice[]> {
  return invoke('meshcentral_list_devices');
}

export async function meshcentralGetDeviceStatus(deviceId: string): Promise<DeviceStatus> {
  return invoke('meshcentral_get_device_status', { deviceId });
}

export async function meshcentralExecuteBatch(deviceIds: string[], commands: BatchCommand[]): Promise<BatchResult[]> {
  return invoke('meshcentral_execute_batch', { deviceIds, commands });
}

export async function meshcentralGetTerminalUrl(deviceId: string): Promise<string> {
  return invoke('meshcentral_get_terminal_url', { deviceId });
}

export async function meshcentralGetFileManagerUrl(deviceId: string): Promise<string> {
  return invoke('meshcentral_get_file_manager_url', { deviceId });
}

export async function meshcentralGetEnrollmentInfo(deviceType: string): Promise<EnrollmentInfo> {
  return invoke('meshcentral_get_enrollment_info', { deviceType });
}

export async function meshcentralSyncFleet(): Promise<SyncResult> {
  return invoke('meshcentral_sync_fleet');
}

export async function meshcentralGetFleetStats(): Promise<Record<string, any>> {
  return invoke('meshcentral_get_fleet_stats');
}

// MeshCentral Transport Commands (2026-10-08) — PRIMARY transport
export async function meshcentralShellExec(
  serverId: string,
  command: string,
  timeoutSecs?: number,
): Promise<ShellResult> {
  return invoke('meshcentral_shell_exec', { serverId, command, timeoutSecs });
}

export async function meshcentralShellBatch(
  serverId: string,
  commands: string[],
  timeoutSecs?: number,
): Promise<ShellResult[]> {
  return invoke('meshcentral_shell_batch', { serverId, commands, timeoutSecs });
}

export async function meshcentralShellFleet(
  serverIds: string[],
  command: string,
  timeoutSecs?: number,
): Promise<ShellResult[]> {
  return invoke('meshcentral_shell_fleet', { serverIds, command, timeoutSecs });
}

export async function meshcentralReadFile(
  serverId: string,
  path: string,
): Promise<string> {
  return invoke('meshcentral_read_file', { serverId, path });
}

export async function meshcentralWriteFile(
  serverId: string,
  path: string,
  content: string,
  mode?: number,
): Promise<void> {
  return invoke('meshcentral_write_file', { serverId, path, content, mode });
}

export async function meshcentralListDir(
  serverId: string,
  path: string,
): Promise<RemoteFileInfo[]> {
  return invoke('meshcentral_list_dir', { serverId, path });
}

export async function meshcentralGetSystemStats(
  serverId: string,
): Promise<MeshSystemStats> {
  return invoke('meshcentral_get_system_stats', { serverId });
}

export async function meshcentralGetProcesses(
  serverId: string,
  limit?: number,
): Promise<RemoteProcess[]> {
  return invoke('meshcentral_get_processes', { serverId, limit });
}

export async function meshcentralReboot(
  serverId: string,
): Promise<void> {
  return invoke('meshcentral_reboot', { serverId });
}

export async function meshcentralShutdown(
  serverId: string,
): Promise<void> {
  return invoke('meshcentral_shutdown', { serverId });
}

export async function meshcentralDockerContainers(
  serverId: string,
): Promise<any[]> {
  return invoke('meshcentral_docker_containers', { serverId });
}

export async function meshcentralDockerStart(
  serverId: string,
  container: string,
): Promise<string> {
  return invoke('meshcentral_docker_start', { serverId, container });
}

export async function meshcentralDockerStop(
  serverId: string,
  container: string,
): Promise<string> {
  return invoke('meshcentral_docker_stop', { serverId, container });
}

export async function meshcentralDockerRestart(
  serverId: string,
  container: string,
): Promise<string> {
  return invoke('meshcentral_docker_restart', { serverId, container });
}

// Alert Center Commands (2026-10-08)
export async function alertCreate(
  severity: string,
  title: string,
  message: string,
  deviceId?: string,
  source: string = 'manual',
  autoAckRule?: string,
): Promise<Alert> {
  return invoke('alert_create', { severity, title, message, deviceId, source, autoAckRule });
}

export async function alertList(filter?: AlertFilter): Promise<Alert[]> {
  return invoke('alert_list', { filter });
}

export async function alertAcknowledge(id: number, acknowledgedBy: string): Promise<Alert> {
  return invoke('alert_acknowledge', { id, acknowledgedBy });
}

export async function alertAcknowledgeAll(deviceId?: string, acknowledgedBy: string = 'user'): Promise<number> {
  return invoke('alert_acknowledge_all', { deviceId, acknowledgedBy });
}

export async function alertGet(id: number): Promise<Alert> {
  return invoke('alert_get', { id });
}

export async function alertDelete(id: number): Promise<void> {
  return invoke('alert_delete', { id });
}

export async function alertEvaluateAutoAck(): Promise<number> {
  return invoke('alert_auto_ack_run');
}

// Historical Metrics Commands (2026-10-08)
export async function metricRecord(deviceId: string, metric: string, value: number): Promise<void> {
  return invoke('metric_record', { deviceId, metric, value });
}

export async function metricQuery(
  deviceId: string,
  metric: string,
  from: string,
  to?: string,
  limit?: number,
): Promise<MetricPoint[]> {
  return invoke('metric_query', { deviceId, metric, from, to, limit });
}

export async function metricQueryMulti(
  deviceIds: string[],
  metrics: string[],
  from: string,
  to?: string,
): Promise<MetricSeries[]> {
  return invoke('metric_query_multi', { deviceIds, metrics, from, to });
}

export async function metricCollectAll(): Promise<number> {
  return invoke('metric_collect_all');
}

/** One Prometheus range-query series (instance label + points). */
export interface PromSeries {
  instance: string;
  points: MetricPoint[];
}

/**
 * Range query against the Unraid Prometheus (1y retention). `baseUrl` is
 * derived in the UI from servers.json (unraid tailscale_ip:9090).
 */
export async function promQueryRange(
  baseUrl: string,
  query: string,
  start: string,
  end: string,
  step: string,
): Promise<PromSeries[]> {
  return invoke('prom_query_range', { baseUrl, query, start, end, step });
}

/** Readiness probe for Prometheus; false when unreachable (not an error). */
export async function prometheusHealth(baseUrl: string): Promise<boolean> {
  return invoke('prometheus_health', { baseUrl });
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

/** Poll Prometheus /api/v1/alerts for firing alerts, create in AlertCenter. */
export async function pollPrometheusAlerts(baseUrl: string): Promise<PromAlertCreated[]> {
  return invoke('poll_prometheus_alerts', { baseUrl });
}

/** Poll MeshCentral device statuses for online/offline transitions. */
export async function pollMeshcentralStatusChanges(): Promise<PromAlertCreated[]> {
  return invoke('poll_meshcentral_status_changes');
}

/** Combined poller for all alert sources (Prometheus + MeshCentral). */
export async function pollAllAlertSources(prometheusBaseUrl: string): Promise<PromAlertCreated[]> {
  return invoke('poll_all_alert_sources', { prometheusBaseUrl });
}

/* ------------------------------------------------------------------ */
/* Embedded terminal (SSH PTY streamed over an IPC Channel)            */
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
  onChunk: (chunk: TerminalChunk) => void,
): Promise<string> {
  const ch = new Channel<TerminalChunk>();
  ch.onmessage = (m) => onChunk(m);
  return invoke<string>('terminal_open', { serverId, cols, rows, onChunk: ch });
}

export async function terminalWrite(sessionId: string, data: string): Promise<void> {
  return invoke('terminal_write', { sessionId, data });
}

export async function terminalResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke('terminal_resize', { sessionId, cols, rows });
}

export async function terminalClose(sessionId: string): Promise<void> {
  return invoke('terminal_close', { sessionId });
}

/* ------------------------------------------------------------------ */
/* OpenCode chat (sidecar opencode serve)                              */
/* ------------------------------------------------------------------ */

export async function opencodeStart(): Promise<OpencodeStatus> {
  return invoke('opencode_start');
}

export async function opencodeStop(): Promise<OpencodeStatus> {
  return invoke('opencode_stop');
}

export async function opencodeStatus(): Promise<OpencodeStatus> {
  return invoke('opencode_status');
}

export async function opencodeNewSession(title?: string): Promise<string> {
  return invoke('opencode_new_session', { title });
}

export async function opencodeSendMessage(
  sessionId: string,
  message: string,
  agent?: string,
): Promise<ChatMessage[]> {
  return invoke('opencode_send_message', { sessionId, message, agent });
}

export async function opencodeGetHistory(sessionId: string): Promise<ChatMessage[]> {
  return invoke('opencode_get_history', { sessionId });
}

export async function opencodeAbort(sessionId: string): Promise<boolean> {
  return invoke('opencode_abort', { sessionId });
}
