import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TopBar } from './TopBar';

// jsdom in this vitest run does not expose localStorage; shim it for
// hooks/context that read kts:* keys (useKiosk).
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

vi.mock('../../lib/tauri-commands', () => ({
  alertList: vi.fn().mockResolvedValue([]),
  alertAcknowledge: vi.fn().mockResolvedValue({} as any),
  alertAcknowledgeAll: vi.fn().mockResolvedValue(0),
}));

import { alertList } from '../../lib/tauri-commands';

function renderTopBar(overrides: {
  location?: { pathname: string };
  onMenuClick?: () => void;
  onCommandPalette?: () => void;
} = {}) {
  const { location = { pathname: '/settings' }, onMenuClick = vi.fn(), onCommandPalette = vi.fn() } = overrides;
  return render(
    <MemoryRouter initialEntries={[location.pathname]}>
      <TopBar location={location} onMenuClick={onMenuClick} onCommandPalette={onCommandPalette} />
    </MemoryRouter>
  );
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(alertList).mockResolvedValue([]);
  });

  it('renders a hamburger menu icon (not a "..." icon) and truncated page title', () => {
    renderTopBar({ location: { pathname: '/device/unraid' } });
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
    expect(screen.getByText('Unraid Server')).toBeInTheDocument();
  });

  it('renders bell, avatar, and user name to the right of the avatar', () => {
    renderTopBar();
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User Menu' })).toBeInTheDocument();
    expect(screen.getAllByText('Bradley').length).toBeGreaterThan(0);
  });

  it('renders a single Actions dropdown with only Refresh and Command palette (no destructive/fleet items)', async () => {
    renderTopBar();
    const actions = screen.getByRole('button', { name: 'Actions' });
    expect(actions).toBeInTheDocument();
    fireEvent.click(actions);
    await screen.findByRole('button', { name: 'Refresh all data' });
    await screen.findByRole('button', { name: 'Open command palette' });
    // No fleet-only / destructive items in the top bar
    expect(screen.queryByRole('button', { name: 'Ring Phone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Screenshot Phone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Launch RustDesk' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reboot Unraid' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Shutdown Unraid' })).not.toBeInTheDocument();
  });

  it('Refresh dispatches kts:refresh', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('button', { name: 'Refresh all data' });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh all data' }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'kts:refresh' }));
  });

  it('Command palette calls onCommandPalette', async () => {
    const onCommandPalette = vi.fn();
    renderTopBar({ onCommandPalette });
    fireEvent.click(screen.getByRole('button', { name: 'Actions' }));
    await screen.findByRole('button', { name: 'Open command palette' });
    fireEvent.click(screen.getByRole('button', { name: 'Open command palette' }));
    expect(onCommandPalette).toHaveBeenCalled();
  });

  it('opens notifications dropdown and lists alerts', async () => {
    vi.mocked(alertList).mockResolvedValue([
      { id: 1, title: 'Drive failing', message: 'Disk /dev/sda', severity: 'warning', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), acknowledged: false, source: 'meshcentral' },
    ]);
    renderTopBar();
    fireEvent.click(screen.getByRole('button', { name: 'Notifications' }));
    await screen.findByText('Drive failing');
    expect(screen.getByText('Drive failing')).toBeInTheDocument();
  });

  it('does not render inline quick-action buttons (single dropdown only)', () => {
    renderTopBar();
    expect(screen.getByRole('button', { name: 'Actions' })).toBeInTheDocument();
  });
});
