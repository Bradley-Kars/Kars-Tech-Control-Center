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
  myspeed: false,
  adguard: false,
  phone: false,
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
