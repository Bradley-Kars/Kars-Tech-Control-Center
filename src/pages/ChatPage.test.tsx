import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { ChatPage } from './ChatPage';

// ---------------------------------------------------------------------------
// Fakes (mirrors EmbeddedTerminal.test.tsx so the page-level matrix stays
// independent of the terminal's own suite)
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
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as any).WebSocket = origWebSocket;
  (globalThis as any).ResizeObserver = origResizeObserver;
});

function closeWith(code: number): void {
  latest!.onclose!({ code, wasClean: false, reason: '' } as unknown as CloseEvent);
}

const localStorageStore: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v; },
    removeItem: (k: string) => { delete localStorageStore[k]; },
    clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
  },
  writable: true,
});

const wrap = () => (
  <AppProvider>
    <MemoryRouter initialEntries={['/chat']}>
      <ChatPage />
    </MemoryRouter>
  </AppProvider>
);

describe('ChatPage terminal state matrix (T5)', () => {
  it('connecting: renders the page shell and opens the opencode profile websocket', () => {
    render(wrap());
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    expect(created.length).toBe(1);
    expect(created[0]!.url).toBe(`${originWs()}/ws/pty/opencode?token=`);
    expect(created[0]!.readyState).toBe(FakeWebSocket.CONNECTING);
  });

  it('connected: once the socket opens the terminal is initialised', () => {
    render(wrap());
    const ws = created[0]!;
    ws.setOpen();
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
    const term = instances.at(-1)!;
    expect(term.open).toHaveBeenCalled();
  });

  it('disconnected: an abnormal close ends the current session', () => {
    render(wrap());
    const ws = created[0]!;
    ws.setOpen();
    closeWith(1006); // abnormal closure → scheduleReconnect with backoff
    vi.advanceTimersByTime(1_000);
    expect(created.length).toBe(2); // reconnect attempted after disconnect
  });

  it('denied: a 4403 close does not reconnect (authentication required)', () => {
    render(wrap());
    closeWith(4403);
    vi.advanceTimersByTime(60_000);
    expect(created.length).toBe(1); // no reconnect after auth denial
  });
});
