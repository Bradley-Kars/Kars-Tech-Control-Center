import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ServerConfig, TestConnectionResult } from './types';
import {
  setAuthToken,
  clearAuthToken,
  getAuthToken,
  getServers,
  saveServer,
  removeServer,
  testConnection,
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
