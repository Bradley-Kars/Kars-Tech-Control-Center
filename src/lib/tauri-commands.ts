import { invoke as rawInvoke, Channel, isTauri as isTauriCheck } from '@tauri-apps/api/core';
import type {
  RestServiceHealth, PlexIdentity, PlexLibrary,
  MeshDevice, DeviceStatus, BatchCommand, BatchResult,
  EnrollmentInfo, SyncResult,
  ShellResult, MeshSystemStats,
  Alert, AlertFilter, AlertSeverity, MetricPoint, MetricSeries,
  OpencodeStatus, ChatMessage,
} from './types';

export type { Alert, AlertFilter, AlertSeverity, MetricPoint, MetricSeries };

const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI__ || isTauriCheck());

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error(`Tauri IPC not available: ${cmd}`);
  }
  return rawInvoke(cmd, args) as T;
}

export {
  getServers,
  saveServer,
  removeServer,
  testConnection,
  getSystemStats,
  getGpuInfo,
  getSmartData,
  getLocalSystemStats,
  getDockerContainers,
  dockerStart,
  dockerStop,
  dockerRestart,
  dockerLogs,
  getNextcloudInfo,
  getNextcloudStatus,
  getNextcloudStorage,
  getNextcloudUsers,
  getNextcloudActivity,
  getAdGuardStatus,
  getAdGuardStats,
  getAdGuardQueryLog,
  getAdGuardClients,
  getAdGuardFilters,
  getAdGuardDhcp,
  adguardEnable,
  adguardDisable,
  getHomeAssistantStates,
  getHomeAssistantConfig,
  getHomeAssistantAreas,
  getHomeAssistantDevices,
  getHomeAssistantEntities,
  homeAssistantToggle,
  homeAssistantTurnOn,
  homeAssistantTurnOff,
  getLidarrStatus,
  getLidarrHealth,
  getLidarrArtists,
  getLidarrAlbums,
  getLidarrWanted,
  getLidarrQueue,
  getLidarrDiskspace,
  lidarrRefreshArtist,
  lidarrSearchMissing,
  getMySpeedSummary,
  getMySpeedTests,
  getMySpeedServers,
  getPhoneDeviceInfo,
  getPhoneBattery,
  getPhoneStorage,
  getPhoneMemory,
  getKdeConnectBattery,
  getKdeConnectConnectivity,
  getKdeConnectListDevices,
  meshcentralShellExec,
  meshcentralListDir,
  meshcentralGetProcesses,
  alertCreate,
  alertList,
  alertGet,
  alertAcknowledge,
  alertAcknowledgeAll,
  alertDelete,
  alertEvaluateAutoAck,
  metricRecord,
  metricQuery,
  metricQueryMulti,
  metricCollectAll,
  getArrayInfo,
  getDisks,
  getShares,
} from './fleet-api';

import * as fleetApi from './fleet-api';

export async function dockerRemove(serverId: string, container: string): Promise<string> {
  return invoke('docker_remove', { serverId, container });
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

// Home Assistant — ported to fleet-api.ts (re-exported above)

// MySpeed — ported to fleet-api.ts (re-exported above)

// AdGuard Home — ported to fleet-api.ts (re-exported above)

// Phone
// Phone device_info/battery/storage/memory ported to fleet-api.ts (re-exported above).

export async function getPhoneThermal(serverId: string): Promise<any> {
  return invoke('get_phone_thermal', { serverId });
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

// KDE Connect — battery/connectivity/list_devices ported to fleet-api.ts (re-exported above).
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

// getKdeConnectConnectivity ported to fleet-api.ts (re-exported above).
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

// kdeConnectListDevices ported to fleet-api.ts (re-exported above).
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

// MeshCentral commands (2026-10-07) — ported to fleet-api (P11).
// Wrappers add serverId as the first arg; callers pass the selected server's id.
export async function meshcentralListDevices(
  serverId: string,
): Promise<MeshDevice[]> {
  return fleetApi.meshcentralListDevices(serverId);
}

export async function meshcentralGetDeviceStatus(
  serverId: string,
  deviceId: string,
): Promise<DeviceStatus> {
  return fleetApi.meshcentralGetDeviceStatus(serverId, deviceId);
}

export async function meshcentralExecuteBatch(
  serverId: string,
  deviceIds: string[],
  commands: BatchCommand[],
): Promise<BatchResult[]> {
  return fleetApi.meshcentralExecuteBatch(serverId, deviceIds, commands);
}

export async function meshcentralGetTerminalUrl(
  serverId: string,
  deviceId: string,
): Promise<string> {
  return fleetApi.meshcentralGetTerminalUrl(serverId, deviceId);
}

export async function meshcentralGetFileManagerUrl(
  serverId: string,
  deviceId: string,
): Promise<string> {
  return fleetApi.meshcentralGetFileManagerUrl(serverId, deviceId);
}

export async function meshcentralGetEnrollmentInfo(
  serverId: string,
  deviceType: string,
): Promise<EnrollmentInfo> {
  return fleetApi.meshcentralGetEnrollmentInfo(serverId, deviceType);
}

export async function meshcentralSyncFleet(
  serverId: string,
): Promise<SyncResult> {
  return fleetApi.meshcentralSyncFleet(serverId);
}

export async function meshcentralGetFleetStats(
  serverId: string,
): Promise<Record<string, any>> {
  return fleetApi.meshcentralGetFleetStats(serverId);
}

// MeshCentral Transport Commands (2026-10-08) — PRIMARY transport.
// shell_exec, list_dir and get_processes are ported to fleet-api (P12) and
// re-exported below; the rest stay Tauri-based until a later port task.
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

export async function meshcentralGetSystemStats(
  serverId: string,
): Promise<MeshSystemStats> {
  return invoke('meshcentral_get_system_stats', { serverId });
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

// Alert Center and Historical Metrics commands are now ported to
// fleet-api.ts (re-exported above) and talk to /api/fleet/alerts/* and
// /api/fleet/metrics/* instead of Tauri IPC. The poll_* functions below
// remain Tauri-based until their sources are ported in a later phase.

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
