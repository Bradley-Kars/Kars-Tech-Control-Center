import { describe, it, expect, vi, beforeEach, afterEach, test } from 'vitest';
import * as bridge from './bridge';

const mockFetch = vi.fn();
beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch as any);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bridgeRequest', () => {
  test('GET /servers calls fetch with base URL, path, method, and X-API-Token header', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify([{ id: 's1' }]), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await bridge.bridgeRequest('GET', '/servers');
    expect(data).toEqual([{ id: 's1' }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toContain('/servers');
    expect(opts.method).toBe('GET');
    expect(typeof opts.headers['X-API-Token']).toBe('string');
  });

  test('POST /tickets sends a JSON body', async () => {
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 't1' }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    await bridge.bridgeRequest('POST', '/tickets', { title: 'server down' });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.body).toBe(JSON.stringify({ title: 'server down' }));
    expect(typeof opts.headers['Content-Type']).toBe('string');
  });

  test('throws BridgeError with status on a non-ok response', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'nope' }), { status: 500 }));
    await expect(bridge.bridgeRequest('GET', '/servers')).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('bridge surface (every function src/ imports from tauri-commands)', () => {
  const EXPECTED = [
    // Servers & devices
    'getServers',
    'saveServer',
    'removeServer',
    'getSystemStats',
    'getLocalSystemStats',
    'meshcentralGetFleetStats',
    'meshcentralGetSystemStats',
    'meshcentralListDevices',
    'meshcentralGetDeviceStatus',
    'meshcentralExecuteBatch',
    'meshcentralSyncFleet',
    'meshcentralGetTerminalUrl',
    'meshcentralGetFileManagerUrl',
    'meshcentralGetEnrollmentInfo',
    'meshcentralShellFleet',
    'meshcentralReboot',
    'meshcentralShutdown',
    'testConnection',
    'getTailscalePeers',
    'getArrayInfo',
    // Docker
    'getDockerContainers',
    'dockerStart',
    'dockerStop',
    'dockerRestart',
    'dockerRemove',
    'dockerLogs',
    // Unraid storage/system/network
    'getDisks',
    'getSmartData',
    'getShares',
    'getProcesses',
    'getSyslog',
    'getUserScripts',
    'runUserScript',
    'getPlugins',
    'getNetworkInterfaces',
    'getGpuInfo',
    // Alerts
    'alertList',
    'alertGet',
    'alertCreate',
    'alertDelete',
    'alertEvaluateAutoAck',
    'alertAcknowledge',
    'alertAcknowledgeAll',
    // Nextcloud
    'getNextcloudInfo',
    'getNextcloudStatus',
    'getNextcloudStorage',
    'getNextcloudUsers',
    'getNextcloudActivity',
    // Lidarr
    'getLidarrStatus',
    'getLidarrHealth',
    'getLidarrArtists',
    'getLidarrAlbums',
    'getLidarrWanted',
    'getLidarrQueue',
    'getLidarrDiskspace',
    'lidarrRefreshArtist',
    'lidarrSearchMissing',
    // Home Assistant
    'getHomeAssistantStates',
    'getHomeAssistantConfig',
    'getHomeAssistantAreas',
    'getHomeAssistantDevices',
    'getHomeAssistantEntities',
    'homeAssistantToggle',
    'homeAssistantTurnOn',
    'homeAssistantTurnOff',
    // MySpeed
    'getMySpeedSummary',
    'getMySpeedTests',
    'getMySpeedServers',
    // AdGuard
    'getAdGuardStatus',
    'getAdGuardStats',
    'getAdGuardQueryLog',
    'getAdGuardClients',
    'getAdGuardFilters',
    'getAdGuardDhcp',
    'adguardEnable',
    'adguardDisable',
    // Phone
    'getPhoneDeviceInfo',
    'getPhoneBattery',
    'getPhoneThermal',
    'getPhoneStorage',
    'getPhoneMemory',
    'getPhoneCpu',
    'getPhoneScreen',
    'getPhoneNetwork',
    'getPhoneApps',
    'getPhoneProcesses',
    'getPhoneActivity',
    'phoneSetScreen',
    'phoneSetBrightness',
    'phoneSetAutoBrightness',
    'phoneVolumeUp',
    'phoneVolumeDown',
    'phoneReboot',
    'phoneScreenshot',
    'phoneScreenshotSave',
    'phoneForceStopApp',
    'phoneGetSmsInbox',
    'phoneGetSmsByAddress',
    'phoneGetSmsConversations',
    'phoneSendSms',
    'phoneGetContacts',
    'phoneGetCallLog',
    // KDE Connect
    'getKdeConnectBattery',
    'getKdeConnectNotifications',
    'getKdeConnectNotification',
    'getKdeConnectMpris',
    'kdeConnectMprisPlay',
    'kdeConnectMprisPause',
    'kdeConnectMprisPlayPause',
    'kdeConnectMprisNext',
    'kdeConnectMprisPrevious',
    'kdeConnectMprisSetVolume',
    'getKdeConnectConnectivity',
    'getKdeConnectTelephony',
    'kdeConnectRingDevice',
    'kdeConnectSendPing',
    'kdeConnectSendSms',
    'kdeConnectSendClipboard',
    'kdeConnectGetClipboard',
    'getKdeConnectContacts',
    'kdeConnectSftpList',
    'kdeConnectShareFile',
    'kdeConnectShareUrl',
    'kdeConnectShareText',
    'getKdeConnectConversations',
    'replyKdeConnectConversation',
    'requestKdeConnectConversation',
    'kdeConnectListDevices',
    // Steam Deck / ROG Ally
    'steamdeckGetSystemStats',
    'steamdeckGetBattery',
    'steamdeckGetThermal',
    'steamdeckGetDisk',
    'steamdeckGetNetwork',
    'steamdeckGetGpu',
    'steamdeckLaunchRustdesk',
    'steamdeckGetDeskflowStatus',
    'allyProvision',
    'allyLaunchAgent',
    // MeshCentral transport
    'meshcentralShellExec',
    'meshcentralShellBatch',
    'meshcentralReadFile',
    'meshcentralWriteFile',
    'meshcentralListDir',
    'meshcentralDockerContainers',
    'meshcentralDockerStart',
    'meshcentralDockerStop',
    'meshcentralDockerRestart',
    // Metrics / Prometheus
    'metricRecord',
    'metricQuery',
    'metricQueryMulti',
    'metricCollectAll',
    'promQueryRange',
    'prometheusHealth',
    'pollPrometheusAlerts',
    'pollMeshcentralStatusChanges',
    'pollAllAlertSources',
    // Terminal
    'terminalOpen',
    'terminalWrite',
    'terminalResize',
    'terminalClose',
    // OpenCode
    'opencodeStart',
    'opencodeStop',
    'opencodeStatus',
    'opencodeNewSession',
    'opencodeSendMessage',
    'opencodeGetHistory',
    'opencodeAbort',
    // Ticketing
    'ticketingOverview',
    'ticketingCreateTicket',
    'ticketingAddWorklog',
    'ticketingChangeStatus',
    // Kept for re-export surface parity
    'getRestServiceHealth',
    'getPlexIdentity',
    'getPlexLibraries',
  ];

  it('exports every function the frontend imports (plus ticketing/terminal/opencode)', () => {
    for (const name of EXPECTED) {
      expect(typeof (bridge as any)[name]).toBe('function');
    }
  });

  it('bridgeRequest is exported and BridgeError is a class', () => {
    expect(typeof bridge.bridgeRequest).toBe('function');
    expect(new bridge.BridgeError(500, 'x')).toBeInstanceOf(bridge.BridgeError);
  });
});
