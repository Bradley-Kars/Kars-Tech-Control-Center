import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  MeshDevice,
  DeviceStatus,
  BatchResult,
  EnrollmentInfo,
  SyncResult,
  ShellResult,
  RemoteFileInfo,
  RemoteProcess,
  Alert,
  AlertSeverity,
  MetricPoint,
  MetricSeries,
  PhoneDeviceInfo,
  PhoneBattery,
  PhoneStorage,
  PhoneMemory,
  KdeConnectBattery,
  KdeConnectConnectivity,
} from './types';
import {
  setAuthToken,
  clearAuthToken,
  getAuthToken,
  getServers,
  saveServer,
  removeServer,
  testConnection,
  getSystemStats,
  getGpuInfo,
  getSmartData,
  getLocalSystemStats,
  getDockerContainers,
  getArrayInfo,
  getDisks,
  getShares,
  dockerStart,
  dockerStop,
  dockerRestart,
  dockerLogs,
  probeRestService,
  getPlexIdentity,
  getPlexLibraries,
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
  meshcentralListDevices,
  meshcentralGetDeviceStatus,
  meshcentralExecuteBatch,
  meshcentralGetTerminalUrl,
  meshcentralGetFileManagerUrl,
  meshcentralGetEnrollmentInfo,
  meshcentralSyncFleet,
  meshcentralGetFleetStats,
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
  getPhoneDeviceInfo,
  getPhoneBattery,
  getPhoneStorage,
  getPhoneMemory,
  getKdeConnectBattery,
  getKdeConnectConnectivity,
  getKdeConnectListDevices,
} from './fleet-api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockClear();
  clearAuthToken();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html' } });
}

const EMPTY_SERVICES: TestConnectionResult['services'] = {
  graphql: false,
  nextcloud: false,
  lidarr: false,
  homeassistant: false,
  adguard: false,
  phone: false,
  kdeconnect: false,
  plex: false,
  scrutiny: false,
  uptimekuma: false,
  invoiceninja: false,
  aurral: false,
  your_spotify: false,
  dozzle: false,
};

const connectedResult: TestConnectionResult = {
  success: true,
  message: 'Connected to home-server',
  hostname: 'home-server',
  os: '6.1.15-unraid',
  services: EMPTY_SERVICES,
};

const serverFixture: ServerConfig = {
  id: 's1',
  name: 'Unraid',
  hostname: 'unraid.main',
  port: 22,
  username: 'root',
  auth: { type: 'password', password: 'secret' },
  device_type: 'unraid',
};

describe('auth token (fleet-api)', () => {
  it('starts empty', () => {
    expect(getAuthToken()).toBe('');
  });

  it('is set and cleared', () => {
    setAuthToken('tok-123');
    expect(getAuthToken()).toBe('tok-123');
    clearAuthToken();
    expect(getAuthToken()).toBe('');
  });
});

describe('getServers', () => {
  it('GETs /api/fleet/servers and returns the parsed list', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ servers: [serverFixture], count: 1 }),
    );
    const result = await getServers();
    expect(result).toEqual([serverFixture]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/servers');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({ servers: [], count: 0 }));
    await getServers();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('prefers a per-call token over the stored one', async () => {
    setAuthToken('stored');
    fetchMock.mockResolvedValue(jsonResponse({ servers: [], count: 0 }));
    await getServers('per-call');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'per-call' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getServers()).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad token' }, 401));
    let err: { status: number; detail: string } | null = null;
    await getServers().catch((e: { status: number; detail: string }) => { err = e; });
    expect(err).not.toBeNull();
    expect(err!.status).toBe(401);
    expect(err!.detail).toBe('bad token');
  });
});

describe('saveServer', () => {
  it('POSTs /api/fleet/servers with a JSON body and returns the redacted server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ...serverFixture, password: '[REDACTED]' }),
    );
    const result = await saveServer(serverFixture);
    expect(result).toEqual({ ...serverFixture, password: '[REDACTED]' });
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/servers');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify(serverFixture));
  });
});

describe('removeServer', () => {
  it('DELETEs /api/fleet/servers/{id}', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await removeServer('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/servers/s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('DELETE');
  });

  it('resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await removeServer('s1');
    expect(result).toBeUndefined();
  });

  it('turns a non-JSON error response into the web-page message', async () => {
    fetchMock.mockResolvedValue(textResponse('<html>error</html>', 500));
    let err: { status: number; detail: string; message: string } | null = null;
    await removeServer('s1').catch((e: { status: number; detail: string; message: string }) => { err = e; });
    expect(err).not.toBeNull();
    expect(err!.status).toBe(500);
    expect(err!.message).toBe('The server returned a web page instead of data. The API address may be wrong.');
  });
});

describe('testConnection', () => {
  const config: ServerConfig = {
    ...serverFixture,
    id: 'temp',
    name: 'test',
    hostname: '<device>.<tailnet>.ts.net',
  };

  it('POSTs /api/fleet/test_connection with the config as JSON body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(connectedResult));
    const result = await testConnection(config);
    expect(result).toEqual(connectedResult);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/test_connection');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify(config));
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({ ...connectedResult, success: false }));
    await testConnection(config).catch(() => {});
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('prefers a per-call token over the stored one', async () => {
    setAuthToken('stored');
    fetchMock.mockResolvedValue(jsonResponse(connectedResult));
    await testConnection(config, 'per-call');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'per-call' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(testConnection(config)).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad config' }, 422));
    let err: { status: number; detail: string } | null = null;
    await testConnection(config).catch((e: { status: number; detail: string }) => { err = e; });
    expect(err).not.toBeNull();
    expect(err!.status).toBe(422);
    expect(err!.detail).toBe('bad config');
  });
});

describe('getSystemStats', () => {
  const stats: SystemStats = {
    hostname: 'home-server',
    kernel: '6.1.15-unraid',
    uptime: 'up 3 days',
    cpu_usage: 12.4,
    cpu_cores: 16,
    memory_total_mb: 32768,
    memory_used_mb: 16777,
    memory_usage_pct: 51.2,
    load_avg: [0.5, 0.4, 0.3],
    array_state: 'UNKNOWN',
  };

  it('GETs /fleet/system/stats?server_id=X and returns the parsed stats', async () => {
    fetchMock.mockResolvedValue(jsonResponse(stats));
    const result = await getSystemStats('s1');
    expect(result).toEqual(stats);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/system/stats?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(stats));
    await getSystemStats('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getGpuInfo', () => {
  const gpu: GpuInfo = {
    name: 'GeForce RTX 4090',
    driver_version: '535.86.01',
    cuda_version: '',
    temperature: '58',
    power_usage: '',
    power_cap: '',
    memory_used: '2048',
    memory_total: '24576',
    utilization: '99',
    fan_speed: '',
  };

  it('GETs /fleet/gpu-info?server_id=X and returns the GPU info', async () => {
    fetchMock.mockResolvedValue(jsonResponse(gpu));
    const result = await getGpuInfo('s1');
    expect(result).toEqual(gpu);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/unraid/get_gpu_info?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });
});

describe('getSmartData', () => {
  const smart: SmartInfo = {
    device: '/dev/sda',
    model: 'Samsung SSD 870 EVO',
    capacity: '500 GB',
    power_on_hours: '12345',
    temperature: '32',
    reallocated_sectors: '0',
    pending_sectors: '0',
    health: 'PASSED',
  };

  it('GETs /fleet/smart-data?server_id=X&device=Y and returns SMART info', async () => {
    fetchMock.mockResolvedValue(jsonResponse(smart));
    const result = await getSmartData('s1', '/dev/sda');
    expect(result).toEqual(smart);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/unraid/get_smart_data?server_id=s1&device=%2Fdev%2Fsda');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });
});

describe('getLocalSystemStats', () => {
  const stats: SystemStats = {
    hostname: 'localhost',
    kernel: '6.1.15',
    uptime: 'up 1 hour',
    cpu_usage: 5.0,
    cpu_cores: 8,
    memory_total_mb: 16384,
    memory_used_mb: 4096,
    memory_usage_pct: 25.0,
    load_avg: [0.1, 0.2, 0.3],
    array_state: 'UNKNOWN',
  };

  it('GETs /fleet/local/stats and returns host-local stats', async () => {
    fetchMock.mockResolvedValue(jsonResponse(stats));
    const result = await getLocalSystemStats();
    expect(result).toEqual(stats);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/local/stats');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });
});

describe('getDockerContainers', () => {
  const containers: ContainerInfo[] = [
    {
      id: '7f1a2b3c4d5e',
      name: 'nextcloud',
      image: 'linuxserver/nextcloud:latest',
      status: 'Up 2 hours',
      state: 'running',
      autoStart: false,
    },
    {
      id: '8e9d0c1b2a3f',
      name: 'plex',
      image: 'plexinc/pms-docker:latest',
      status: 'Exited (0) 3 days ago',
      state: 'exited',
      autoStart: false,
    },
  ];

  it('GETs /fleet/unraid/get_docker_containers?server_id=X and returns the parsed list', async () => {
    fetchMock.mockResolvedValue(jsonResponse(containers));
    const result = await getDockerContainers('s1');
    expect(result).toEqual(containers);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/unraid/get_docker_containers?server_id=s1'
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse([]));
    await getDockerContainers('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getArrayInfo', () => {
  it('GETs /fleet/unraid/get_array_info?server_id=X and returns the parsed array info', async () => {
    const info = { name: 'unraid', state: 'Started', protected: false };
    fetchMock.mockResolvedValue(jsonResponse(info));
    const result = await getArrayInfo('s1');
    expect(result).toEqual(info);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/unraid/get_array_info?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await getArrayInfo('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getDisks', () => {
  it('GETs /fleet/unraid/get_disks?server_id=X and returns the parsed disk list', async () => {
    const disks = [
      { device: '/dev/sda', name: 'disk1', size: '10 TB', type: 'rotational' },
      { device: '/dev/sdb', name: 'disk2', size: '10 TB', type: 'rotational' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(disks));
    const result = await getDisks('s1');
    expect(result).toEqual(disks);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/unraid/get_disks?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse([]));
    await getDisks('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getShares', () => {
  it('GETs /fleet/unraid/get_shares?server_id=X and returns the parsed share list', async () => {
    const shares = [
      { name: 'media', device: '/dev/md1', size: '50 TB', used: '40 TB' },
      { name: 'backups', device: '/dev/md1', size: '50 TB', used: '5 TB' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(shares));
    const result = await getShares('s1');
    expect(result).toEqual(shares);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/unraid/get_shares?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse([]));
    await getShares('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

function dockerActionTests(
  name: 'dockerStart' | 'dockerStop' | 'dockerRestart',
  fn: (serverId: string, container: string) => Promise<string>,
  method: string,
  verb: string,
) {
  describe(name, () => {
    it(`POSTs /api/fleet/${method} with {server_id, container} and returns the status message`, async () => {
      const message = `${verb}ed nextcloud`;
      fetchMock.mockResolvedValue(jsonResponse(message));
      const result = await fn('s1', 'nextcloud');
      expect(result).toBe(message);
      const [input, init] = fetchMock.mock.calls[0];
      expect(String(input)).toBe(`/api/fleet/${method}`);
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
      expect(init?.body).toBe(
        JSON.stringify({ server_id: 's1', container: 'nextcloud' })
      );
    });

    it('sends X-API-Token when one is set', async () => {
      setAuthToken('fleet-secret');
      fetchMock.mockResolvedValue(jsonResponse(`${verb}ed nextcloud`));
      await fn('s1', 'nextcloud').catch(() => {});
      const [, init] = fetchMock.mock.calls[0];
      expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
    });

    it('rejects with status 0 on a network failure', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      await expect(fn('s1', 'nextcloud')).rejects.toMatchObject({ status: 0 });
    });

    it('rejects with the server status and detail on a non-ok response', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ detail: 'container not found' }, 500));
      let err: { status: number; detail: string } | null = null;
      await fn('s1', 'nextcloud').catch((e: { status: number; detail: string }) => { err = e; });
      expect(err).not.toBeNull();
      expect(err!.status).toBe(500);
      expect(err!.detail).toBe('container not found');
    });
  });
}

dockerActionTests('dockerStart', dockerStart, 'docker/start', 'Start');
dockerActionTests('dockerStop', dockerStop, 'docker/stop', 'Stop');
dockerActionTests('dockerRestart', dockerRestart, 'docker/restart', 'Restart');

describe('dockerLogs', () => {
  it('POSTs /api/fleet/docker/logs with {server_id, container, lines} and returns the log output', async () => {
    const logs = "[2026-11-03] request started\n[2026-11-03] request finished\n";
    fetchMock.mockResolvedValue(jsonResponse(logs));
    const result = await dockerLogs('s1', 'nextcloud', 50);
    expect(result).toBe(logs);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/docker/logs');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(
      JSON.stringify({ server_id: 's1', container: 'nextcloud', lines: 50 })
    );
  });

  it('defaults lines to 100 when omitted', async () => {
    fetchMock.mockResolvedValue(jsonResponse('logs'));
    await dockerLogs('s1', 'nextcloud');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      server_id: 's1',
      container: 'nextcloud',
      lines: 100,
    });
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse('logs'));
    await dockerLogs('s1', 'nextcloud').catch(() => {});
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('probeRestService', () => {
  const health: RestServiceHealth = {
    service: 'plex',
    label: 'Plex',
    url: 'http://<device>.<tailnet>.ts.net:32400',
    reachable: true,
    detail: 'OK',
  };

  it('GETs /api/fleet/rest/health?service=X&server_id=X and returns the health', async () => {
    fetchMock.mockResolvedValue(jsonResponse(health));
    const result = await probeRestService('plex', 's1');
    expect(result).toEqual(health);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/rest/health?service=plex&server_id=s1'
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(health));
    await probeRestService('plex', 's1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(probeRestService('plex', 's1')).rejects.toMatchObject({
      status: 0,
    });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: 'unknown service' }, 422),
    );
    let err: { status: number; detail: string } | null = null;
    await probeRestService('plex', 's1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(422);
    expect(err!.detail).toBe('unknown service');
  });
});

describe('getPlexIdentity', () => {
  const identity: PlexIdentity = {
    machine_identifier: 'plex-test-001',
    version: '1.43.4.10903-e5521bd8c',
    claimed: true,
  };

  it('GETs /api/fleet/rest/plex/identity?server_id=X and returns the identity', async () => {
    fetchMock.mockResolvedValue(jsonResponse(identity));
    const result = await getPlexIdentity('s1');
    expect(result).toEqual(identity);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/rest/plex/identity?server_id=s1'
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('resolves null when the server returns null', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null));
    const result = await getPlexIdentity('s1');
    expect(result).toBeNull();
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(identity));
    await getPlexIdentity('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getPlexLibraries', () => {
  const libraries: PlexLibrary[] = [
    {
      key: '1',
      title: 'Movies',
      library_type: 'movie',
      uuid: 'u1',
      scanning: false,
      updated_at: 1_700_000_000,
    },
    {
      key: '2',
      title: 'TV Shows',
      library_type: 'show',
      uuid: 'u2',
      scanning: true,
      updated_at: 1_700_000_001,
    },
  ];

  it('GETs /api/fleet/rest/plex/libraries?server_id=X and returns the libraries', async () => {
    fetchMock.mockResolvedValue(jsonResponse(libraries));
    const result = await getPlexLibraries('s1');
    expect(result).toEqual(libraries);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/rest/plex/libraries?server_id=s1'
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(libraries));
    await getPlexLibraries('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getNextcloudInfo', () => {
  const info: NextcloudInfo = {
    version: '34.0.3',
    versionstring: '34.0.3',
    edition: 'Community',
  };

  it('GETs /api/fleet/nextcloud/info?server_id=X and returns the info', async () => {
    fetchMock.mockResolvedValue(jsonResponse(info));
    const result = await getNextcloudInfo('s1');
    expect(result).toEqual(info);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/nextcloud/info?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(info));
    await getNextcloudInfo('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getNextcloudInfo('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getNextcloudInfo('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getNextcloudStatus', () => {
  const status: NextcloudSystemStatus = {
    installed: true,
    maintenance: false,
    needs_db_upgrade: false,
    version: '34.0.3',
    versionstring: '34.0.3',
    edition: 'Community',
    productname: 'Nextcloud',
    extended_support: false,
  };

  it('GETs /api/fleet/nextcloud/status?server_id=X and returns the status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const result = await getNextcloudStatus('s1');
    expect(result).toEqual(status);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/nextcloud/status?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(status));
    await getNextcloudStatus('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getNextcloudStorage', () => {
  const storage: NextcloudStorage = {
    num_users: 3,
    num_files: 60509,
    num_storages: 5,
    num_storages_local: 2,
    num_storages_home: 2,
    num_storages_other: 1,
  };

  it('GETs /api/fleet/nextcloud/storage?server_id=X and returns the storage', async () => {
    fetchMock.mockResolvedValue(jsonResponse(storage));
    const result = await getNextcloudStorage('s1');
    expect(result).toEqual(storage);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/nextcloud/storage?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(storage));
    await getNextcloudStorage('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getNextcloudUsers', () => {
  const users: NextcloudUser[] = [
    {
      id: 'alice',
      display_name: 'Alice',
      enabled: true,
      quota: { free: 100, used: 10, total: 100, relative: 10 },
      email: 'alice@example.com',
      groups: ['admin'],
      backend: 'internal',
      subadmin: [],
      last_login: 1_700_000_000,
    },
  ];

  it('GETs /api/fleet/nextcloud/users?server_id=X and returns the users', async () => {
    fetchMock.mockResolvedValue(jsonResponse(users));
    const result = await getNextcloudUsers('s1');
    expect(result).toEqual(users);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/nextcloud/users?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(users));
    await getNextcloudUsers('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getNextcloudActivity', () => {
  const activity: NextcloudActivity = { activities: [] };

  it('GETs /api/fleet/nextcloud/activity?server_id=X&limit=X and returns the activity', async () => {
    fetchMock.mockResolvedValue(jsonResponse(activity));
    const result = await getNextcloudActivity('s1', 20);
    expect(result).toEqual(activity);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/nextcloud/activity?server_id=s1&limit=20'
    );
  });

  it('omits limit when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(activity));
    await getNextcloudActivity('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/nextcloud/activity?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(activity));
    await getNextcloudActivity('s1', 20);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

// ---------------------------------------------------------------------------
// AdGuard
// ---------------------------------------------------------------------------

describe('getAdGuardStatus', () => {
  const status: AdGuardStatus = {
    version: '0.107.0',
    dns_addresses: ['10.0.0.1', '10.0.0.2'],
    config_hash: 'abc123',
    protection_enabled: true,
  };

  it('GETs /api/fleet/adguard/status?server_id=X and returns the status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const result = await getAdGuardStatus('s1');
    expect(result).toEqual(status);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/status?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(status));
    await getAdGuardStatus('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getAdGuardStatus('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getAdGuardStatus('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getAdGuardStats', () => {
  const stats: AdGuardStats = {
    dns_queries: {
      total: 10000,
      blocked: 2500,
      replaced: 100,
      safe_browsing: 50,
      parental: 25,
      avg_processing_time: 12.5,
    },
    blocked: { domains: 2000, clients: 5 },
    replaced: { domains: 80, clients: 3 },
    clients: { total: 50, active: 45 },
    filters: { total: 10, enabled: 9 },
  };

  it('GETs /api/fleet/adguard/stats?server_id=X and returns the stats', async () => {
    fetchMock.mockResolvedValue(jsonResponse(stats));
    const result = await getAdGuardStats('s1');
    expect(result).toEqual(stats);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/stats?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(stats));
    await getAdGuardStats('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getAdGuardStats('s1')).rejects.toMatchObject({ status: 0 });
  });
});

describe('getAdGuardQueryLog', () => {
  const log: AdGuardQueryLog = { data: [], limit: 50, offset: 0, total: 0 };

  it('GETs /api/fleet/adguard/querylog?server_id=X&limit=X&offset=X', async () => {
    fetchMock.mockResolvedValue(jsonResponse(log));
    const result = await getAdGuardQueryLog('s1', 20, 0);
    expect(result).toEqual(log);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/adguard/querylog?server_id=s1&limit=20&offset=0'
    );
  });

  it('omits limit and offset when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(log));
    await getAdGuardQueryLog('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/querylog?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(log));
    await getAdGuardQueryLog('s1', 20, 0);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getAdGuardClients', () => {
  const clients = [{ name: 'laptop', ids: ['192.168.1.50'] }];

  it('GETs /api/fleet/adguard/clients?server_id=X and returns clients', async () => {
    fetchMock.mockResolvedValue(jsonResponse(clients));
    const result = await getAdGuardClients('s1');
    expect(result).toEqual(clients);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/clients?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(clients));
    await getAdGuardClients('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getAdGuardFilters', () => {
  const filters = [{ name: 'Default', rules_count: 100, enabled: true }];

  it('GETs /api/fleet/adguard/filters?server_id=X and returns filters', async () => {
    fetchMock.mockResolvedValue(jsonResponse(filters));
    const result = await getAdGuardFilters('s1');
    expect(result).toEqual(filters);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/filters?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(filters));
    await getAdGuardFilters('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getAdGuardDhcp', () => {
  const dhcp: AdGuardDHCP = { enabled: true, leases: [] };

  it('GETs /api/fleet/adguard/dhcp?server_id=X and returns dhcp', async () => {
    fetchMock.mockResolvedValue(jsonResponse(dhcp));
    const result = await getAdGuardDhcp('s1');
    expect(result).toEqual(dhcp);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/dhcp?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(dhcp));
    await getAdGuardDhcp('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('adguardEnable', () => {
  it('POSTs /api/fleet/adguard/enable?server_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'enabled' }));
    await adguardEnable('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/enable?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'enabled' }));
    await adguardEnable('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('adguardDisable', () => {
  it('POSTs /api/fleet/adguard/disable?server_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'disabled' }));
    await adguardDisable('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/adguard/disable?server_id=s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'disabled' }));
    await adguardDisable('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getHomeAssistantStates', () => {
  const states: HomeAssistantState[] = [
    {
      entity_id: 'light.kitchen',
      state: 'on',
      attributes: { brightness: 255 },
      last_changed: '2026-11-03T10:00:00Z',
      last_updated: '2026-11-03T10:00:00Z',
      context: { id: 'abc123' },
    },
  ];

  it('GETs /api/fleet/homeassistant/get_homeassistant_states?server_id=X and returns states', async () => {
    fetchMock.mockResolvedValue(jsonResponse(states));
    const result = await getHomeAssistantStates('s1');
    expect(result).toEqual(states);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/homeassistant/get_homeassistant_states?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(states));
    await getHomeAssistantStates('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getHomeAssistantConfig', () => {
  const config: HomeAssistantConfig = {
    components: ['frontend', 'http'],
    config_dir: '/config',
    elevation: 0.0,
    latitude: 51.5,
    location_name: 'Home',
    longitude: -0.1,
    time_zone: 'Europe/London',
    unit_system: { unit_system: 'metric' },
    version: '2026.11.0',
    allowlist_external_dirs: [],
    allowlist_external_urls: [],
    currency: 'GBP',
    external_url: 'https://<device>.<tailnet>.ts.net:8123',
    internal_url: 'http://<device>.<tailnet>.local:8123',
    theme: null,
    language: 'en',
  };

  it('GETs /api/fleet/homeassistant/get_homeassistant_config?server_id=X and returns config', async () => {
    fetchMock.mockResolvedValue(jsonResponse(config));
    const result = await getHomeAssistantConfig('s1');
    expect(result).toEqual(config);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/homeassistant/get_homeassistant_config?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(config));
    await getHomeAssistantConfig('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getHomeAssistantAreas', () => {
  const areas: HomeAssistantArea[] = [
    { area_id: 'area-1', name: 'Kitchen', picture: null, icon: 'mdi:food', floor_id: null },
  ];

  it('GETs /api/fleet/homeassistant/get_homeassistant_areas?server_id=X and returns areas', async () => {
    fetchMock.mockResolvedValue(jsonResponse(areas));
    const result = await getHomeAssistantAreas('s1');
    expect(result).toEqual(areas);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/homeassistant/get_homeassistant_areas?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(areas));
    await getHomeAssistantAreas('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getHomeAssistantDevices', () => {
  const devices: HomeAssistantDevice[] = [
    {
      id: 'device-1',
      name: 'Kitchen Light',
      name_by_user: null,
      model: 'LZB01',
      manufacturer: 'Philips',
      sw_version: '2.0',
      hw_version: '1.0',
      area_id: 'area-1',
      labels: ['lighting'],
      config_entries: ['entry-1'],
      entry_type: null,
      identifiers: [['hue', '001']],
      connections: [],
      via_device_id: null,
    },
  ];

  it('GETs /api/fleet/homeassistant/get_homeassistant_devices?server_id=X and returns devices', async () => {
    fetchMock.mockResolvedValue(jsonResponse(devices));
    const result = await getHomeAssistantDevices('s1');
    expect(result).toEqual(devices);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/homeassistant/get_homeassistant_devices?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(devices));
    await getHomeAssistantDevices('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getHomeAssistantEntities', () => {
  const entities: HomeAssistantEntity[] = [
    {
      entity_id: 'light.kitchen',
      unique_id: 'unique-1',
      platform: 'hue',
      device_id: 'device-1',
      area_id: 'area-1',
      name: 'Kitchen Light',
      original_name: null,
      disabled_by: null,
      hidden_by: null,
      entity_category: null,
      icon: null,
      unit_of_measurement: null,
      device_class: 'light',
      original_device_class: null,
      supported_features: 1,
      capabilities: { supported_color_modes: [1, 2] },
    },
  ];

  it('GETs /api/fleet/homeassistant/get_homeassistant_entities?server_id=X and returns entities', async () => {
    fetchMock.mockResolvedValue(jsonResponse(entities));
    const result = await getHomeAssistantEntities('s1');
    expect(result).toEqual(entities);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/homeassistant/get_homeassistant_entities?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(entities));
    await getHomeAssistantEntities('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('homeAssistantToggle', () => {
  it('POSTs /api/fleet/homeassistant/homeassistant_toggle?server_id=X&entity_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantToggle('s1', 'light.kitchen');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/homeassistant/homeassistant_toggle?server_id=s1&entity_id=light.kitchen',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantToggle('s1', 'light.kitchen');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('homeAssistantTurnOn', () => {
  it('POSTs /api/fleet/homeassistant/homeassistant_turn_on?server_id=X&entity_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantTurnOn('s1', 'light.kitchen');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/homeassistant/homeassistant_turn_on?server_id=s1&entity_id=light.kitchen',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantTurnOn('s1', 'light.kitchen');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('homeAssistantTurnOff', () => {
  it('POSTs /api/fleet/homeassistant/homeassistant_turn_off?server_id=X&entity_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantTurnOff('s1', 'light.kitchen');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/homeassistant/homeassistant_turn_off?server_id=s1&entity_id=light.kitchen',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await homeAssistantTurnOff('s1', 'light.kitchen');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrStatus', () => {
  const status: LidarrStatus = {
    app_name: 'Lidarr',
    instance_name: 'Music',
    version: '2.0.0.1234',
    build_time: '2026-01-01T00:00:00Z',
    is_debug: false,
    is_production: true,
    is_admin: true,
    startup_path: '/config',
    app_data: '/config',
    os_name: 'Linux',
    os_version: '6.8.0',
    is_linux: true,
    is_osx: false,
    is_windows: false,
    branch: 'master',
    authentication: 'None',
    url_base: '/lidarr',
  };

  it('GETs /api/fleet/lidarr/get_lidarr_status?server_id=X and returns status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const result = await getLidarrStatus('s1');
    expect(result).toEqual(status);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/lidarr/get_lidarr_status?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(status));
    await getLidarrStatus('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrHealth', () => {
  const health: LidarrHealthIssue[] = [
    { source: 'DiskSpace', issue_type: 'Warning', message: 'Disk space low', wiki_url: null },
  ];

  it('GETs /api/fleet/lidarr/get_lidarr_health?server_id=X and returns health', async () => {
    fetchMock.mockResolvedValue(jsonResponse(health));
    const result = await getLidarrHealth('s1');
    expect(result).toEqual(health);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/lidarr/get_lidarr_health?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(health));
    await getLidarrHealth('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrArtists', () => {
  const artists: LidarrArtist[] = [
    {
      id: 1,
      foreign_artist_id: 'foreign-1',
      artist_name: 'The Beatles',
      monitored: true,
      metadata_profile_id: 1,
      quality_profile_id: 2,
      root_folder_path: '/music',
      add_options: null,
      tags: [],
    },
  ];

  it('GETs /api/fleet/lidarr/get_lidarr_artists?server_id=X and returns artists', async () => {
    fetchMock.mockResolvedValue(jsonResponse(artists));
    const result = await getLidarrArtists('s1');
    expect(result).toEqual(artists);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/lidarr/get_lidarr_artists?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(artists));
    await getLidarrArtists('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrAlbums', () => {
  const albums: LidarrAlbum[] = [
    {
      id: 10,
      foreign_album_id: 'foreign-album-1',
      artist_id: 1,
      title: 'Abbey Road',
      album_type: 'Studio',
      status: 'released',
      monitored: true,
      release_date: '1969-09-26',
      genres: ['Rock'],
      statistics: null,
    },
  ];

  it('GETs /api/fleet/lidarr/get_lidarr_albums?server_id=X&artist_id=X&monitored=X and returns albums', async () => {
    fetchMock.mockResolvedValue(jsonResponse(albums));
    const result = await getLidarrAlbums('s1', 1, true);
    expect(result).toEqual(albums);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/lidarr/get_lidarr_albums?server_id=s1&artist_id=1&monitored=true',
    );
  });

  it('omits optional query params when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse(albums));
    await getLidarrAlbums('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/lidarr/get_lidarr_albums?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(albums));
    await getLidarrAlbums('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrWanted', () => {
  const wanted: LidarrWantedMissing = {
    page: 1,
    page_size: 25,
    sort_key: 'title',
    sort_direction: 'asc',
    total_records: 2,
    records: [],
  };

  it('GETs /api/fleet/lidarr/get_lidarr_wanted?server_id=X&page=X&pageSize=X', async () => {
    fetchMock.mockResolvedValue(jsonResponse(wanted));
    const result = await getLidarrWanted('s1', 1, 25);
    expect(result).toEqual(wanted);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/lidarr/get_lidarr_wanted?server_id=s1&page=1&pageSize=25',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(wanted));
    await getLidarrWanted('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrQueue', () => {
  const queue: LidarrQueue = {
    page: 1,
    page_size: 25,
    sort_key: 'title',
    sort_direction: 'asc',
    total_records: 1,
    records: [],
  };

  it('GETs /api/fleet/lidarr/get_lidarr_queue?server_id=X&page=X&pageSize=X', async () => {
    fetchMock.mockResolvedValue(jsonResponse(queue));
    const result = await getLidarrQueue('s1', 1, 25);
    expect(result).toEqual(queue);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/lidarr/get_lidarr_queue?server_id=s1&page=1&pageSize=25',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(queue));
    await getLidarrQueue('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('getLidarrDiskspace', () => {
  const diskspace: LidarrDiskSpace[] = [
    { path: '/music', label: 'Music', free_space: 500, total_space: 1000 },
  ];

  it('GETs /api/fleet/lidarr/get_lidarr_diskspace?server_id=X and returns disk space', async () => {
    fetchMock.mockResolvedValue(jsonResponse(diskspace));
    const result = await getLidarrDiskspace('s1');
    expect(result).toEqual(diskspace);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/lidarr/get_lidarr_diskspace?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(diskspace));
    await getLidarrDiskspace('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('lidarrRefreshArtist', () => {
  it('POSTs /api/fleet/lidarr/lidarr_refresh_artist?server_id=X&artist_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await lidarrRefreshArtist('s1', 1);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/lidarr/lidarr_refresh_artist?server_id=s1&artist_id=1',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await lidarrRefreshArtist('s1', 1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('lidarrSearchMissing', () => {
  it('POSTs /api/fleet/lidarr/lidarr_search_missing?server_id=X&artist_id=X and returns void', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await lidarrSearchMissing('s1', 1);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/lidarr/lidarr_search_missing?server_id=s1&artist_id=1',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({}));
    await lidarrSearchMissing('s1', 1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });
});

describe('meshcentralListDevices', () => {
  const devices: MeshDevice[] = [
    { id: 'QZUw1234', name: 'HTPC', group: 'Home', conn: 1, pwr: 1, platform: 'linux', ip: '100.87.0.10' },
    { id: 'ABCD5678', name: 'Laptop', group: 'Home', conn: 0, pwr: 0, platform: 'windows', ip: '100.87.0.20' },
  ];

  it('GETs /api/fleet/meshcentral/list_devices?server_id=X and returns devices', async () => {
    fetchMock.mockResolvedValue(jsonResponse(devices));
    const result = await meshcentralListDevices('s1');
    expect(result).toEqual(devices);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/meshcentral/list_devices?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(devices));
    await meshcentralListDevices('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralListDevices('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralListDevices('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralGetDeviceStatus', () => {
  const status: DeviceStatus = {
    connected: true,
    cpu_usage: 12.5,
    memory_usage_pct: 44.0,
    uptime: '5 days',
    source: 'meshcentral',
  };

  it('GETs /api/fleet/meshcentral/get_device_status?server_id=X&device_id=X and returns status', async () => {
    fetchMock.mockResolvedValue(jsonResponse(status));
    const result = await meshcentralGetDeviceStatus('s1', 'QZUw1234');
    expect(result).toEqual(status);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_device_status?server_id=s1&device_id=QZUw1234',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(status));
    await meshcentralGetDeviceStatus('s1', 'QZUw1234');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      meshcentralGetDeviceStatus('s1', 'QZUw1234'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetDeviceStatus('s1', 'QZUw1234').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralExecuteBatch', () => {
  const results: BatchResult[] = [
    { device_id: 'QZUw1234', success: true, output: 'uptime: 5 days' },
    { device_id: 'ABCD5678', success: false, output: '', error: 'offline' },
  ];

  it('POSTs /api/fleet/meshcentral/execute_batch with {server_id, device_ids, commands} and returns results', async () => {
    fetchMock.mockResolvedValue(jsonResponse(results));
    const result = await meshcentralExecuteBatch(
      's1',
      ['QZUw1234', 'ABCD5678'],
      [{ command: 'uptime' }, { command: 'whoami', args: ['--version'] }],
    );
    expect(result).toEqual(results);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/meshcentral/execute_batch');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('"server_id":"s1"');
    expect(init?.body).toContain('"device_ids":["QZUw1234","ABCD5678"]');
    expect(init?.body).toContain('"command":"uptime"');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(results));
    await meshcentralExecuteBatch('s1', ['QZUw1234'], [{ command: 'uptime' }]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      meshcentralExecuteBatch('s1', ['QZUw1234'], [{ command: 'uptime' }]),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad request' }, 422));
    let err: { status: number; detail: string } | null = null;
    await meshcentralExecuteBatch('s1', ['QZUw1234'], [{ command: 'uptime' }]).catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(422);
    expect(err!.detail).toBe('bad request');
  });
});

describe('meshcentralGetTerminalUrl', () => {
  it('GETs /api/fleet/meshcentral/get_terminal_url?server_id=X&device_id=X and returns the URL string', async () => {
    const url = 'http://<device>.<tailnet>.ts.net:8444/terminal?device=QZUw1234';
    fetchMock.mockResolvedValue(jsonResponse(url));
    const result = await meshcentralGetTerminalUrl('s1', 'QZUw1234');
    expect(result).toBe(url);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_terminal_url?server_id=s1&device_id=QZUw1234',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(
      jsonResponse('http://<device>.<tailnet>.ts.net:8444/terminal?device=QZUw1234'),
    );
    await meshcentralGetTerminalUrl('s1', 'QZUw1234');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      meshcentralGetTerminalUrl('s1', 'QZUw1234'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetTerminalUrl('s1', 'QZUw1234').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralGetFileManagerUrl', () => {
  it('GETs /api/fleet/meshcentral/get_file_manager_url?server_id=X&device_id=X and returns the URL string', async () => {
    const url = 'http://<device>.<tailnet>.ts.net:8444/filemanager?device=QZUw1234';
    fetchMock.mockResolvedValue(jsonResponse(url));
    const result = await meshcentralGetFileManagerUrl('s1', 'QZUw1234');
    expect(result).toBe(url);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_file_manager_url?server_id=s1&device_id=QZUw1234',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(
      jsonResponse('http://<device>.<tailnet>.ts.net:8444/filemanager?device=QZUw1234'),
    );
    await meshcentralGetFileManagerUrl('s1', 'QZUw1234');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      meshcentralGetFileManagerUrl('s1', 'QZUw1234'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetFileManagerUrl('s1', 'QZUw1234').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralGetEnrollmentInfo', () => {
  const info: EnrollmentInfo = {
    agent_url: 'http://<device>.<tailnet>.ts.net:8444/meshagents?id=6&meshid=group123',
    settings_url: 'http://<device>.<tailnet>.ts.net:8444/meshsettings?id=group123',
    group_id: 'group123',
    install_command_linux: 'curl -k ...',
    install_command_windows: "$u = '...'",
  };

  it('GETs /api/fleet/meshcentral/get_enrollment_info?server_id=X&device_type=X and returns enrollment info', async () => {
    fetchMock.mockResolvedValue(jsonResponse(info));
    const result = await meshcentralGetEnrollmentInfo('s1', 'linux');
    expect(result).toEqual(info);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_enrollment_info?server_id=s1&device_type=linux',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(info));
    await meshcentralGetEnrollmentInfo('s1', 'linux');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      meshcentralGetEnrollmentInfo('s1', 'linux'),
    ).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetEnrollmentInfo('s1', 'linux').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralSyncFleet', () => {
  const result: SyncResult = {
    devices_found: 2,
    devices_matched: 1,
    devices_new: 1,
    devices_updated: 1,
    errors: [],
  };

  it('POSTs /api/fleet/meshcentral/sync_fleet with {server_id} and returns sync result', async () => {
    fetchMock.mockResolvedValue(jsonResponse(result));
    const r = await meshcentralSyncFleet('s1');
    expect(r).toEqual(result);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/meshcentral/sync_fleet');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('"server_id":"s1"');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(result));
    await meshcentralSyncFleet('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralSyncFleet('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralSyncFleet('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralGetFleetStats', () => {
  const stats = {
    devices_found: 2,
    online: 1,
    offline: 1,
    connected: 0,
    source: 'meshcentral',
  };

  it('GETs /api/fleet/meshcentral/get_fleet_stats?server_id=X and returns stats', async () => {
    fetchMock.mockResolvedValue(jsonResponse(stats));
    const result = await meshcentralGetFleetStats('s1');
    expect(result).toEqual(stats);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/meshcentral/get_fleet_stats?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(stats));
    await meshcentralGetFleetStats('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralGetFleetStats('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetFleetStats('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralShellExec', () => {
  const result: ShellResult = {
    device_id: 'QZUw1234',
    command: 'uptime',
    exit_code: 0,
    stdout: 'up 5 days',
    stderr: '',
    success: true,
  };

  it('POSTs /api/fleet/meshcentral/shell_exec with {server_id, command, timeout_secs} and returns the result', async () => {
    fetchMock.mockResolvedValue(jsonResponse(result));
    const returned = await meshcentralShellExec('s1', 'uptime', 30);
    expect(returned).toEqual(result);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/meshcentral/shell_exec');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toContain('"server_id":"s1"');
    expect(init?.body).toContain('"command":"uptime"');
    expect(init?.body).toContain('"timeout_secs":30');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(result));
    await meshcentralShellExec('s1', 'uptime');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralShellExec('s1', 'uptime')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'ssh failed' }, 502));
    let err: { status: number; detail: string } | null = null;
    await meshcentralShellExec('s1', 'uptime').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(502);
    expect(err!.detail).toBe('ssh failed');
  });
});

describe('meshcentralListDir', () => {
  const files: RemoteFileInfo[] = [
    { path: '/etc/hosts', is_dir: false, size: 123, modified: '2026-11-03 10:00', permissions: '644' },
    { path: '/etc', is_dir: true, size: 4096, modified: '2026-11-03 09:00', permissions: '755' },
  ];

  it('GETs /api/fleet/meshcentral/list_dir?server_id=X&path=X and returns files', async () => {
    fetchMock.mockResolvedValue(jsonResponse(files));
    const returned = await meshcentralListDir('s1', '/etc');
    expect(returned).toEqual(files);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/list_dir?server_id=s1&path=%2Fetc',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(files));
    await meshcentralListDir('s1', '/etc');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralListDir('s1', '/etc')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await meshcentralListDir('s1', '/etc').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('meshcentralGetProcesses', () => {
  const processes: RemoteProcess[] = [
    { pid: 1, name: 'systemd', cpu_percent: 0.1, memory_percent: 0.5, user: 'root', command: 'systemd' },
    { pid: 42, name: 'sshd', cpu_percent: 0.0, memory_percent: 1.2, user: 'root', command: 'sshd' },
  ];

  it('GETs /api/fleet/meshcentral/get_processes?server_id=X&limit=X and returns processes', async () => {
    fetchMock.mockResolvedValue(jsonResponse(processes));
    const returned = await meshcentralGetProcesses('s1', 10);
    expect(returned).toEqual(processes);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_processes?server_id=s1&limit=10',
    );
  });

  it('defaults limit to 50', async () => {
    fetchMock.mockResolvedValue(jsonResponse(processes));
    await meshcentralGetProcesses('s1');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/meshcentral/get_processes?server_id=s1&limit=50',
    );
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(processes));
    await meshcentralGetProcesses('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(meshcentralGetProcesses('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'ps failed' }, 502));
    let err: { status: number; detail: string } | null = null;
    await meshcentralGetProcesses('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(502);
    expect(err!.detail).toBe('ps failed');
  });
});

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

describe('alertCreate', () => {
  it('POSTs /api/fleet/alerts/create with the alert body and returns the created alert', async () => {
    const created: Alert = {
      id: 1,
      severity: 'critical',
      title: 'Disk full',
      message: 'root at 98%',
      device_id: 'unraid-main',
      source: 'smart',
      acknowledged: false,
      acknowledged_by: undefined,
      acknowledged_at: undefined,
      created_at: '2026-11-03T10:00:00Z',
      updated_at: '2026-11-03T10:00:00Z',
      auto_ack_rule: 'disk>90',
    };
    fetchMock.mockResolvedValue(jsonResponse(created));
    const returned = await alertCreate(
      'critical',
      'Disk full',
      'root at 98%',
      'unraid-main',
      'smart',
      'disk>90',
    );
    expect(returned).toEqual(created);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/create');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      severity: 'critical',
      title: 'Disk full',
      message: 'root at 98%',
      device_id: 'unraid-main',
      source: 'smart',
      auto_ack_rule: 'disk>90',
    });
  });

  it('omits optional fields when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 2, severity: 'info', title: 't', message: 'm' }));
    await alertCreate('info', 't', 'm');
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      severity: 'info',
      title: 't',
      message: 'm',
      device_id: undefined,
      source: undefined,
      auto_ack_rule: undefined,
    });
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    await alertCreate('warning', 't', 'm');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(alertCreate('info', 't', 'm')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad severity' }, 422));
    let err: { status: number; detail: string } | null = null;
    await alertCreate('bogus' as AlertSeverity, 't', 'm').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(422);
    expect(err!.detail).toBe('bad severity');
  });
});

describe('alertList', () => {
  it('GETs /api/fleet/alerts/list with the filter serialized and returns alerts', async () => {
    const alerts: Alert[] = [
      { id: 1, severity: 'critical', title: 'c', message: 'm', source: 'manual', acknowledged: false, created_at: 'a', updated_at: 'a' },
      { id: 2, severity: 'warning', title: 'w', message: 'm', source: 'manual', acknowledged: true, created_at: 'b', updated_at: 'b' },
    ];
    fetchMock.mockResolvedValue(jsonResponse(alerts));
    const returned = await alertList({ severity: 'critical', acknowledged: false, limit: 10, offset: 0 });
    expect(returned).toEqual(alerts);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/alerts/list?severity=critical&acknowledged=false&limit=10&offset=0',
    );
  });

  it('defaults to an empty filter', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await alertList();
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/list?');
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(alertList()).rejects.toMatchObject({ status: 0 });
  });
});

describe('alertGet', () => {
  it('GETs /api/fleet/alerts/get?id=X and returns the alert', async () => {
    const alert: Alert = { id: 7, severity: 'info', title: 't', message: 'm', source: 'manual', acknowledged: false, created_at: 'a', updated_at: 'a' };
    fetchMock.mockResolvedValue(jsonResponse(alert));
    const returned = await alertGet(7);
    expect(returned).toEqual(alert);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/get?id=7');
  });
});

describe('alertAcknowledge', () => {
  it('POSTs /api/fleet/alerts/acknowledge and returns the updated alert', async () => {
    const updated: Alert = { id: 3, severity: 'warning', title: 't', message: 'm', source: 'manual', acknowledged: true, acknowledged_by: 'ops', acknowledged_at: 'x', created_at: 'a', updated_at: 'x' };
    fetchMock.mockResolvedValue(jsonResponse(updated));
    const returned = await alertAcknowledge(3, 'ops');
    expect(returned).toEqual(updated);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/acknowledge');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ id: 3, acknowledged_by: 'ops' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(alertAcknowledge(3, 'ops')).rejects.toMatchObject({ status: 0 });
  });
});

describe('alertAcknowledgeAll', () => {
  it('POSTs /api/fleet/alerts/acknowledge_all and returns the count', async () => {
    fetchMock.mockResolvedValue(jsonResponse(4));
    const returned = await alertAcknowledgeAll('unraid-main', 'auto');
    expect(returned).toBe(4);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ device_id: 'unraid-main', acknowledged_by: 'auto' });
  });

  it('defaults acknowledged_by to "user" and omits device_id when unset', async () => {
    fetchMock.mockResolvedValue(jsonResponse(0));
    await alertAcknowledgeAll();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toEqual({ device_id: undefined, acknowledged_by: 'user' });
  });
});

describe('alertDelete', () => {
  it('POSTs /api/fleet/alerts/delete with the alert id', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ deleted: true }, 200));
    await alertDelete(9);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/delete');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ id: 9 });
  });
});

describe('alertEvaluateAutoAck', () => {
  it('POSTs /api/fleet/alerts/auto_ack_run with an empty body and returns the count', async () => {
    fetchMock.mockResolvedValue(jsonResponse(3));
    const returned = await alertEvaluateAutoAck();
    expect(returned).toBe(3);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/alerts/auto_ack_run');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Historical metrics
// ---------------------------------------------------------------------------

describe('metricRecord', () => {
  it('POSTs /api/fleet/metrics/record with the sample', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await metricRecord('unraid-main', 'cpu_usage', 42.5);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/metrics/record');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ device_id: 'unraid-main', metric: 'cpu_usage', value: 42.5 });
  });
});

describe('metricQuery', () => {
  it('GETs /api/fleet/metrics/query and returns points', async () => {
    const points: MetricPoint[] = [
      { timestamp: '2026-11-03T10:00:00Z', value: 1.0 },
      { timestamp: '2026-11-03T10:01:00Z', value: 2.0 },
    ];
    fetchMock.mockResolvedValue(jsonResponse(points));
    const returned = await metricQuery('d1', 'cpu', '2026-11-03T10:00:00Z', undefined, 5);
    expect(returned).toEqual(points);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/metrics/query?device_id=d1&metric=cpu&from=2026-11-03T10%3A00%3A00Z&limit=5',
    );
  });

  it('omits optional to and limit when not provided', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    await metricQuery('d1', 'cpu', '2020-01-01T00:00:00Z');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/metrics/query?device_id=d1&metric=cpu&from=2020-01-01T00%3A00%3A00Z');
  });
});

describe('metricQueryMulti', () => {
  it('GETs /api/fleet/metrics/query_multi with repeated device_ids and metrics', async () => {
    const series: MetricSeries[] = [
      { metric: 'cpu', device_id: 'd1', points: [{ timestamp: 'a', value: 1 }] },
    ];
    fetchMock.mockResolvedValue(jsonResponse(series));
    const returned = await metricQueryMulti(['d1', 'd2'], ['cpu', 'mem'], '2020-01-01T00:00:00Z');
    expect(returned).toEqual(series);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe(
      '/api/fleet/metrics/query_multi?from=2020-01-01T00%3A00%3A00Z&device_ids=d1&device_ids=d2&metrics=cpu&metrics=mem',
    );
  });
});

describe('metricCollectAll', () => {
  it('POSTs /api/fleet/metrics/collect_all with an empty body and returns 0', async () => {
    fetchMock.mockResolvedValue(jsonResponse(0));
    const returned = await metricCollectAll();
    expect(returned).toBe(0);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/metrics/collect_all');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Phone / KDE Connect (P14) — host-local, feature-flagged
// ---------------------------------------------------------------------------

describe('getPhoneDeviceInfo', () => {
  const info: PhoneDeviceInfo = {
    model: 'Galaxy S24 Ultra',
    android_version: '14',
    api_level: '34',
    serial: 'RF8A700000',
    oneui_version: '6.1',
    manufacturer: 'Samsung',
    brand: 'samsung',
    build_fingerprint: 'samsung/beowulf/...',
  };

  it('GETs /api/fleet/phone/device_info?server_id=X and returns device info', async () => {
    fetchMock.mockResolvedValue(jsonResponse(info));
    const result = await getPhoneDeviceInfo('s1');
    expect(result).toEqual(info);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/phone/device_info?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(info));
    await getPhoneDeviceInfo('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPhoneDeviceInfo('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getPhoneDeviceInfo('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getPhoneBattery', () => {
  const battery: PhoneBattery = {
    level: 85,
    status: '2',
    health: '1',
    temperature: 28.5,
    voltage: 4320,
    technology: 'Li-ion',
    charging: true,
    plugged: 'AC',
    current_ua: -500,
  };

  it('GETs /api/fleet/phone/battery?server_id=X and returns battery', async () => {
    fetchMock.mockResolvedValue(jsonResponse(battery));
    const result = await getPhoneBattery('s1');
    expect(result).toEqual(battery);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/phone/battery?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(battery));
    await getPhoneBattery('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPhoneBattery('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getPhoneBattery('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getPhoneStorage', () => {
  const storage: PhoneStorage = {
    total_gb: 50,
    free_gb: 30,
    used_gb: 20,
    used_pct: 40,
  };

  it('GETs /api/fleet/phone/storage?server_id=X and returns storage', async () => {
    fetchMock.mockResolvedValue(jsonResponse(storage));
    const result = await getPhoneStorage('s1');
    expect(result).toEqual(storage);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/phone/storage?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(storage));
    await getPhoneStorage('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPhoneStorage('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getPhoneStorage('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getPhoneMemory', () => {
  const memory: PhoneMemory = {
    total_mb: 12056,
    available_mb: 6629,
    free_mb: 120,
    cached_mb: 976,
    buffers_mb: 195,
    used_pct: 55,
  };

  it('GETs /api/fleet/phone/memory?server_id=X and returns memory', async () => {
    fetchMock.mockResolvedValue(jsonResponse(memory));
    const result = await getPhoneMemory('s1');
    expect(result).toEqual(memory);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/phone/memory?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(memory));
    await getPhoneMemory('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getPhoneMemory('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getPhoneMemory('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getKdeConnectBattery', () => {
  const battery: KdeConnectBattery = {
    charge: 85,
    is_charging: true,
    has_battery: true,
    icon_name: 'battery-full',
  };

  it('GETs /api/fleet/kdeconnect/battery?server_id=X and returns battery', async () => {
    fetchMock.mockResolvedValue(jsonResponse(battery));
    const result = await getKdeConnectBattery('s1');
    expect(result).toEqual(battery);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/kdeconnect/battery?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(battery));
    await getKdeConnectBattery('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getKdeConnectBattery('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getKdeConnectBattery('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getKdeConnectConnectivity', () => {
  const connectivity: KdeConnectConnectivity = {
    cellular_network_strength: 4,
    cellular_network_type: 'LTE',
    icon_name: 'network-cellular',
  };

  it('GETs /api/fleet/kdeconnect/connectivity?server_id=X and returns connectivity', async () => {
    fetchMock.mockResolvedValue(jsonResponse(connectivity));
    const result = await getKdeConnectConnectivity('s1');
    expect(result).toEqual(connectivity);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/kdeconnect/connectivity?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(connectivity));
    await getKdeConnectConnectivity('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getKdeConnectConnectivity('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getKdeConnectConnectivity('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});

describe('getKdeConnectListDevices', () => {
  const devices: string[] = ['phone-abc', 'tablet-def'];

  it('GETs /api/fleet/kdeconnect/list_devices?server_id=X and returns device ids', async () => {
    fetchMock.mockResolvedValue(jsonResponse(devices));
    const result = await getKdeConnectListDevices('s1');
    expect(result).toEqual(devices);
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/fleet/kdeconnect/list_devices?server_id=s1');
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('fleet-secret');
    fetchMock.mockResolvedValue(jsonResponse(devices));
    await getKdeConnectListDevices('s1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'fleet-secret' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getKdeConnectListDevices('s1')).rejects.toMatchObject({ status: 0 });
  });

  it('rejects with the server status and detail on a non-ok response', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'not found' }, 404));
    let err: { status: number; detail: string } | null = null;
    await getKdeConnectListDevices('s1').catch(
      (e: { status: number; detail: string }) => { err = e; },
    );
    expect(err).not.toBeNull();
    expect(err!.status).toBe(404);
    expect(err!.detail).toBe('not found');
  });
});
