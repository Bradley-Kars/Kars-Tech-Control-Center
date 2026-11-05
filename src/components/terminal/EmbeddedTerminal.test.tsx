import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

import { EmbeddedTerminal } from './EmbeddedTerminal';
import { clearAuthToken } from '../../lib/fleet-api';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  readonly url: string;
  private _readyState = FakeWebSocket.CONNECTING;
  get readyState(): number {
    return this._readyState;
  }
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string) {
    created.push(this);
    latest = this;
    this.url = url;
  }
  /** Test helper: transition to OPEN and fire the open handler. */
  setOpen(): void {
    this._readyState = FakeWebSocket.OPEN;
    this.onopen?.({} as unknown as Event);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
}

const created: FakeWebSocket[] = [];
let latest: FakeWebSocket | null = null;
const instances: any[] = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => {
    const inst: any = {
      onData: vi.fn(),
      write: vi.fn(),
      open: vi.fn(),
      loadAddon: vi.fn(),
      dispose: vi.fn(),
      focus: vi.fn(),
      cols: 80,
      rows: 24,
    };
    instances.push(inst);
    return inst;
  }),
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(),
}));

const origWebSocket = (globalThis as any).WebSocket;
const origResizeObserver = (globalThis as any).ResizeObserver;

function originWs(): string {
  return (window.location.origin as string).replace(/^http/, 'ws');
}

// C3: the terminal connects with a one-time ticket from POST
// /api/terminal/ticket, so every render must flush that promise before
// asserting on the websocket URL.
async function flushTicket(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderWithTicket(ui: Parameters<typeof render>[0]) {
  const result = render(ui);
  await flushTicket();
  return result;
}

beforeEach(() => {
  created.length = 0;
  latest = null;
  vi.useFakeTimers();
  (globalThis as any).WebSocket = FakeWebSocket;
  (globalThis as any).ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: async () => ({ ticket: 'tkt-test', expires_in: 300 }),
    } as unknown as Response)
  );
});

afterEach(() => {
  vi.useRealTimers();
  clearAuthToken();
  (globalThis as any).WebSocket = origWebSocket;
  (globalThis as any).ResizeObserver = origResizeObserver;
});

function lastTerminal(): any {
  return instances.at(-1);
}

function closeWith(code: number): void {
  latest!.onclose!({ code, wasClean: false, reason: '' } as unknown as CloseEvent);
}

describe('EmbeddedTerminal websocket (T4/C3)', () => {
  it('opens the websocket for the server ssh profile on the same origin', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    expect(created.length).toBe(1);
    expect(created[0]!.url).toBe(`${originWs()}/ws/pty/ssh/server-1?ticket=tkt-test`);
  });

  it('opens the websocket for a named profile (e.g. opencode) on the same origin', async () => {
    await renderWithTicket(<EmbeddedTerminal profile="opencode" />);
    expect(created.length).toBe(1);
    expect(created[0]!.url).toBe(`${originWs()}/ws/pty/opencode?ticket=tkt-test`);
  });

  it('requests a ticket before connecting (no ?token= in the URL)', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/terminal/ticket'),
      expect.objectContaining({ method: 'POST' })
    );
    expect(created[0]!.url).not.toContain('?token=');
    expect(created[0]!.url).toBe(`${originWs()}/ws/pty/ssh/server-1?ticket=tkt-test`);
  });

  it('sends an initial resize once the socket opens', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const ws = created[0]!;
    ws.setOpen();
    expect(ws.sent).toEqual([JSON.stringify({ type: 'resize', cols: 80, rows: 24 })]);
  });

  it('forwards terminal input to the websocket as input messages', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const ws = created[0]!;
    ws.setOpen();
    const term = lastTerminal();
    const onData = term.onData.mock.calls[0][0] as (data: string) => void;
    onData('hello');
    onData('\x1b[A');
    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'resize', cols: 80, rows: 24 }),
      JSON.stringify({ type: 'input', data: 'hello' }),
      JSON.stringify({ type: 'input', data: '\x1b[A' }),
    ]);
  });

  it('drops input when the socket is not open', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const ws = created[0]!;
    const term = lastTerminal();
    const onData = term.onData.mock.calls[0][0] as (data: string) => void;
    onData('hello');
    expect(ws.sent).toEqual([]);
  });

  it('writes pty output to the terminal', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const ws = created[0]!;
    const term = lastTerminal();
    ws.setOpen();
    ws.onmessage!({
      data: JSON.stringify({ type: 'output', data: 'root@host:~# ' }),
    } as unknown as MessageEvent);
    expect(term.write).toHaveBeenLastCalledWith('root@host:~# ');
  });

  it('shows an exit banner and stops reconnecting when the session exits', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const term = lastTerminal();
    latest!.onmessage!({
      data: JSON.stringify({ type: 'exit', code: 1 }),
    } as unknown as MessageEvent);
    expect(term.write).toHaveBeenLastCalledWith(
      expect.stringContaining('session closed (exit 1)'),
    );
    vi.advanceTimersByTime(60_000);
    expect(created.length).toBe(1); // no reconnect after a clean exit
  });

  it('shows a server error banner', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const term = lastTerminal();
    latest!.onmessage!({
      data: JSON.stringify({ type: 'error', message: 'failed to start pty' }),
    } as unknown as MessageEvent);
    expect(term.write).toHaveBeenLastCalledWith(
      expect.stringContaining('failed to start pty'),
    );
  });

  it('reconnects with exponential backoff after an abnormal close', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    expect(created.length).toBe(1);
    closeWith(1006); // abnormal closure
    expect(created.length).toBe(1); // backoff has not fired yet
    vi.advanceTimersByTime(1000);
    expect(created.length).toBe(2);
    expect(created[1]!.url).toBe(`${originWs()}/ws/pty/ssh/server-1?ticket=tkt-test`);
    closeWith(1006);
    vi.advanceTimersByTime(2000);
    expect(created.length).toBe(3);
    expect(created[2]!.url).toBe(`${originWs()}/ws/pty/ssh/server-1?ticket=tkt-test`);
    vi.runAllTimers();
  });

  it('does not reconnect when the server requires authentication (4403)', async () => {
    await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    closeWith(4403);
    vi.advanceTimersByTime(60_000);
    expect(created.length).toBe(1);
  });

  it('closes the socket and disposes the terminal on unmount', async () => {
    const closeSpy = vi.spyOn(FakeWebSocket.prototype, 'close');
    const { unmount } = await renderWithTicket(<EmbeddedTerminal serverId="server-1" />);
    const term = lastTerminal();
    unmount();
    expect(closeSpy).toHaveBeenCalled();
    expect(term.dispose).toHaveBeenCalled();
    closeSpy.mockRestore();
  });
});
