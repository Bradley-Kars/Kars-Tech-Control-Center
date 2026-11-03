import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

const mocks = vi.hoisted(() => ({
  opencodeStatus: vi.fn(),
  opencodeStart: vi.fn(),
  opencodeStop: vi.fn(),
  opencodeNewSession: vi.fn(),
}));

vi.mock('../../lib/tauri-commands', () => ({
  opencodeStatus: mocks.opencodeStatus,
  opencodeStart: mocks.opencodeStart,
  opencodeStop: mocks.opencodeStop,
  opencodeNewSession: mocks.opencodeNewSession,
  opencodeSendMessage: vi.fn(),
  opencodeGetHistory: vi.fn(),
  opencodeAbort: vi.fn(),
}));

const offline = { running: false, port: null, pid: null };
const online = { running: true, port: 1234, pid: 5678 };

// jsdom does not implement HTMLElement#scrollIntoView; ChatPanel auto-scrolls on new messages
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
  writable: true,
});

beforeEach(() => {
  mocks.opencodeStatus.mockResolvedValue(offline);
  mocks.opencodeStart.mockResolvedValue(online);
  mocks.opencodeNewSession.mockResolvedValue('sess-1');
});

describe('ChatPanel offline state (CHAT-002)', () => {
  it('renders an integrated offline placeholder with a Start button inside the panel', async () => {
    render(<ChatPanel />);
    await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument());
    expect(screen.getByText('Hermes is not connected')).toBeInTheDocument();
    expect(screen.getByText('Start the sidecar to chat with your AI assistant')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Start Hermes/ })).toBeInTheDocument();
  });
});

describe('ChatPanel start state (CHAT-001)', () => {
  it('shows a spinner and disables the Start button while starting, then Connected when running', async () => {
    let resolveStart: (() => void) | null = null;
    mocks.opencodeStart.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStart = resolve as () => void;
        }).then(() => online)
    );
    render(<ChatPanel />);
    await waitFor(() => expect(screen.getByText('Offline')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Start Hermes/ }));
    // start-in-progress: disabled button(s), Starting… label, spinner present
    const startBtns = screen.getAllByRole('button', { name: /Starting/ });
    expect(startBtns.length).toBeGreaterThan(0);
    startBtns.forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByTestId('chat-start-spinner')).toBeInTheDocument();
    resolveStart!();
    await waitFor(() => expect(screen.getByText('Connected')).toBeInTheDocument());
  });
});
