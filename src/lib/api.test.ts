import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApiError } from './api';
import {
  setAuthToken,
  clearAuthToken,
  getAuthToken,
  ticketRequestError,
  listTickets,
  createTicket,
  addWorklog,
  changeTicketStatus,
  updateTicket,
  getTicket,
} from './api';

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

describe('ticketRequestError', () => {
  it('reports a network failure when status is null', () => {
    expect(ticketRequestError(null, false)).toBe("Can't reach the ticket server.");
  });

  it('reports a non-JSON response before the status code', () => {
    expect(ticketRequestError(500, false)).toBe(
      'The server returned a web page instead of data. The API address may be wrong.',
    );
    expect(ticketRequestError(404, false)).toBe(
      'The server returned a web page instead of data. The API address may be wrong.',
    );
  });

  it('maps 401 to a signed-in message', () => {
    expect(ticketRequestError(401, true)).toBe("You're not signed in to this server.");
  });

  it('maps 403 to a not-allowed message', () => {
    expect(ticketRequestError(403, true)).toBe("Your account isn't allowed to do that.");
  });

  it('maps 5xx to a server-problem message', () => {
    expect(ticketRequestError(500, true)).toBe("The ticket server had a problem. Try again.");
    expect(ticketRequestError(503, true)).toBe("The ticket server had a problem. Try again.");
  });

  it('falls back to the status for other codes', () => {
    expect(ticketRequestError(404, true)).toBe('Request failed with status 404');
    expect(ticketRequestError(400, true)).toBe('Request failed with status 400');
  });
});

describe('auth token', () => {
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

describe('listTickets', () => {
  it('GETs /tickets and returns the parsed body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 2, tickets: [] }));
    const result = await listTickets();
    expect(result).toEqual({ count: 2, tickets: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets');
    expect(init?.method).toBe('GET');
    expect(init?.body).toBeUndefined();
  });

  it('sends X-API-Token when one is set', async () => {
    setAuthToken('secret');
    fetchMock.mockResolvedValue(jsonResponse({ count: 0, tickets: [] }));
    await listTickets();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'secret' });
  });

  it('prefers a per-call token over the stored one', async () => {
    setAuthToken('stored');
    fetchMock.mockResolvedValue(jsonResponse({ count: 0, tickets: [] }));
    await listTickets('per-call');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ 'X-API-Token': 'per-call' });
  });

  it('rejects with status 0 on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(listTickets()).rejects.toMatchObject({ status: 0 });
  });

  it('requests ?all=true when asked to include closed tickets', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ count: 3, tickets: [] }));
    await listTickets(undefined, { all: true });
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets?all=true');
  });
});

describe('createTicket', () => {
  it('POSTs /tickets with a JSON body and returns the result', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ticket_id: 't1', title: 'Fix WiFi', status: 'open', version: 1 }),
    );
    const result = await createTicket({ title: 'Fix WiFi', priority: 'high' });
    expect(result).toEqual({ ticket_id: 't1', title: 'Fix WiFi', status: 'open', version: 1 });
    const [input, init] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(init?.body).toBe(JSON.stringify({ title: 'Fix WiFi', priority: 'high' }));
  });

  it('rejects with status 401; detail is the raw server detail, message is human-readable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'bad token' }, 401));
    let err: ApiError | null = null;
    await createTicket({ title: 'x' }).catch((e: ApiError) => { err = e; });
    expect(err).not.toBeNull();
    expect(err!.status).toBe(401);
    expect(err!.detail).toBe('bad token');
    expect(err!.message).toBe("You're not signed in to this server.");
  });
});

describe('addWorklog', () => {
  it('POSTs /tickets/{id}/worklog', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ticket_id: 't1', version: 2, worklog_count: 3 }),
    );
    const result = await addWorklog('t1', { entry: 'did stuff', hours: 2 });
    expect(result).toEqual({ ticket_id: 't1', version: 2, worklog_count: 3 });
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets/t1/worklog');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ entry: 'did stuff', hours: 2 }));
  });

  it('turns a non-JSON error response into the web-page message', async () => {
    fetchMock.mockResolvedValue(textResponse('<html>error</html>', 500));
    let err: ApiError | null = null;
    await addWorklog('t1', { entry: 'e', hours: 1 }).catch((e: ApiError) => { err = e; });
    expect(err).not.toBeNull();
    expect(err!.status).toBe(500);
    expect(err!.detail).toBe('');
    expect(err!.message).toBe('The server returned a web page instead of data. The API address may be wrong.');
  });
});

describe('changeTicketStatus', () => {
  it('POSTs /tickets/{id}/status with { status }', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ticket_id: 't1', status: 'done', version: 3 }));
    const result = await changeTicketStatus('t1', 'done');
    expect(result.status).toBe('done');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets/t1/status');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ status: 'done' }));
  });

  it('resolves undefined on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    const result = await changeTicketStatus('t1', 'done');
    expect(result).toBeUndefined();
  });
});

describe('updateTicket', () => {
  it('PATCHes /tickets/{id} with the fields', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 't1', title: 'New', status: 'open' }));
    const result = await updateTicket('t1', { title: 'New' });
    expect(result.title).toBe('New');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets/t1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('PATCH');
    expect(init?.body).toBe(JSON.stringify({ title: 'New' }));
  });
});

describe('getTicket', () => {
  it('GETs /tickets/{id}', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 't1', title: 'Fix WiFi', status: 'open' }));
    const result = await getTicket('t1');
    expect(result.title).toBe('Fix WiFi');
    const [input] = fetchMock.mock.calls[0];
    expect(String(input)).toBe('/api/tickets/t1');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('GET');
  });
});
