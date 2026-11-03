import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { ChatPage } from './ChatPage';

const mocks = vi.hoisted(() => ({
  opencodeStatus: vi.fn(),
  opencodeStart: vi.fn(),
  opencodeStop: vi.fn(),
  opencodeNewSession: vi.fn(),
  opencodeSendMessage: vi.fn(),
  opencodeGetHistory: vi.fn(),
  opencodeAbort: vi.fn(),
}));

vi.mock('../lib/tauri-commands', () => ({
  opencodeStatus: mocks.opencodeStatus,
  opencodeStart: mocks.opencodeStart,
  opencodeStop: mocks.opencodeStop,
  opencodeNewSession: mocks.opencodeNewSession,
  opencodeSendMessage: mocks.opencodeSendMessage,
  opencodeGetHistory: mocks.opencodeGetHistory,
  opencodeAbort: mocks.opencodeAbort,
}));

// jsdom does not implement HTMLElement#scrollIntoView; ChatPanel auto-scrolls on new messages
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
});

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

const offline = { running: false, port: null, pid: null };
const online = { running: true, port: 1234, pid: 5678 };

describe('ChatPage (D/I state matrix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.opencodeStatus.mockResolvedValue(offline);
    mocks.opencodeStart.mockResolvedValue(online);
    mocks.opencodeNewSession.mockResolvedValue('sess-1');
  });

  it('D default: renders the page shell with the offline chat panel — "Hermes Chat", Offline badge, Connect button', () => {
    render(wrap());
    expect(screen.getByTestId('chat-page')).toBeInTheDocument();
    expect(screen.getByText('Hermes Chat')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Connect/ })).toBeInTheDocument();
  });

  it('I interaction: clicking Connect starts Hermes — spinner and disabled buttons while in flight, then Connected', async () => {
    let resolveStart: (() => void) | null = null;
    mocks.opencodeStart.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve as () => void;
        }).then(() => online),
    );
    render(wrap());
    fireEvent.click(screen.getByRole('button', { name: /Connect/ }));
    const startBtns = screen.getAllByRole('button', { name: /Starting/ });
    expect(startBtns.length).toBeGreaterThan(0);
    startBtns.forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByTestId('chat-start-spinner')).toBeInTheDocument();
    expect(mocks.opencodeStart).toHaveBeenCalledTimes(1);
    resolveStart!();
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  });

  it('M n/a: ChatPage renders no dialogs (modal state not applicable on this route)', () => {
    render(wrap());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
