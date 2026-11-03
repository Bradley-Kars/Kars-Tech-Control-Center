import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';
import { FleetCommandPage } from './FleetCommandPage';
import { useServers } from '../hooks';
import { meshcentralShellFleet } from '../lib/tauri-commands';
import type { ShellResult } from '../lib/types';

vi.mock('../hooks', () => ({
  useServers: vi.fn(),
}));
vi.mock('../lib/tauri-commands', () => ({
  meshcentralShellFleet: vi.fn(),
}));

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

const mockUseServers = vi.mocked(useServers);
const mockShellFleet = vi.mocked(meshcentralShellFleet);

const servers: any[] = [
  { id: 's1', name: 'Unraid Server', device_type: 'unraid', hostname: 'unraid.main', meshcentral_status: 'enrolled' },
  { id: 's2', name: 'Senpai Laptop', device_type: 'laptop', hostname: 'laptop.main' },
  { id: 's3', name: 'Galaxy S24 Ultra', device_type: 'phone', hostname: 's24.main' },
];

const shellResult = (device_id: string, success = true): ShellResult => ({
  device_id,
  command: 'uptime',
  exit_code: success ? 0 : 1,
  stdout: success ? 'up 2 days\n' : '',
  stderr: success ? '' : 'connection refused\n',
  success,
});

const wrap = () => (
  <AppProvider>
    <MemoryRouter initialEntries={['/fleet-command']}>
      <Routes>
        <Route path="fleet-command" element={<FleetCommandPage />} />
      </Routes>
    </MemoryRouter>
  </AppProvider>
);

const setServers = (list: any[], loading = false, error: string | null = null) => {
  mockUseServers.mockReturnValue({ servers: list, loading, error } as any);
};

beforeEach(() => {
  vi.clearAllMocks();
  setServers([]);
  mockShellFleet.mockResolvedValue([]);
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: { writeText: vi.fn() },
  });
});

describe('FleetCommandPage (D/E/L/R/I state matrix)', () => {
  it('D populated: renders shell-capable devices as selectable targets, phone as ADB-only, all presets, and a disabled run button', () => {
    setServers(servers);
    render(wrap());

    expect(screen.getByText('Fleet Command')).toBeInTheDocument();
    expect(screen.getByText(/MC-first transport/)).toBeInTheDocument();

    expect(screen.getByText('Unraid Server')).toBeInTheDocument();
    expect(screen.getByText('Senpai Laptop')).toBeInTheDocument();
    expect(screen.getByText('Galaxy S24 Ultra')).toBeInTheDocument();
    // Phone is ADB-only: excluded from shell targets, shown with its badge
    expect(screen.getByTitle('ADB-only device — no shell transport')).toBeInTheDocument();
    expect(screen.getByText('ADB-only')).toBeInTheDocument();

    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();

    for (const label of [
      'Heartbeat',
      'Distro',
      'Pending updates',
      'Disk usage',
      'Memory',
      'Top CPU',
      'Docker',
      'Listeners',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }

    const run = screen.getByRole('button', { name: /run on 0 device/i });
    expect(run).toBeDisabled();
  });

  it('E empty: no targets and disabled run button when there are no servers', () => {
    setServers([]);
    render(wrap());

    expect(screen.getByText('Fleet Command')).toBeInTheDocument();
    expect(screen.getByText('0 of 0 selected')).toBeInTheDocument();
    expect(screen.queryByText('Unraid Server')).not.toBeInTheDocument();
    expect(screen.queryByTitle('ADB-only device — no shell transport')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run on 0 device/i })).toBeDisabled();
  });

  it('L loading: shows a loading state and no targets while the server list is in flight', () => {
    setServers([], true);
    render(wrap());

    expect(screen.getByText(/loading devices/i)).toBeInTheDocument();
    expect(screen.queryByText('Unraid Server')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run on/i })).not.toBeInTheDocument();
  });

  it('R error: shows an error banner and stays usable when the server list fails to load', () => {
    setServers([], false, 'Failed to load servers');
    render(wrap());

    expect(screen.getByText(/failed to load devices/i)).toBeInTheDocument();
    expect(screen.getByText('Failed to load servers')).toBeInTheDocument();
    expect(screen.queryByText('Unraid Server')).not.toBeInTheDocument();
  });

  it('I interaction: selecting targets enables the run button; clear-all empties the selection', () => {
    setServers(servers);
    render(wrap());

    fireEvent.click(screen.getByRole('button', { name: /Unraid Server/ }));
    expect(screen.getByText('1 of 2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run on 1 device/i })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Senpai Laptop/ }));
    expect(screen.getByText('All 2 shell-capable devices selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /clear all/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(screen.getByText('0 of 2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run on 0 device/i })).toBeDisabled();
  });

  it('I interaction: picking a preset sets the command, running fans out via MeshCentral, and per-device results render', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const results = [shellResult('s1', true), shellResult('s2', false)];
    mockShellFleet.mockResolvedValue(results);
    setServers(servers);
    render(wrap());

    fireEvent.click(screen.getByRole('button', { name: /Unraid Server/ }));
    fireEvent.click(screen.getByRole('button', { name: /Senpai Laptop/ }));
    fireEvent.click(screen.getByRole('button', { name: /heartbeat/i }));
    expect(screen.getByRole('textbox')).toHaveValue('uptime');

    fireEvent.click(screen.getByRole('button', { name: /run on 2 device/i }));

    await waitFor(() =>
      expect(mockShellFleet).toHaveBeenCalledWith(['s1', 's2'], 'uptime', 60),
    );

    const toastCall = dispatchSpy.mock.calls.find(([e]) => (e as CustomEvent).type === 'kts:toast');
    expect(toastCall).toBeDefined();
    const detail = (toastCall![0] as CustomEvent).detail;
    expect(detail.type).toBe('warning'); // 1 of 2 ok
    expect(detail.title).toBe('Ran on 2 device(s)');

    await waitFor(() => expect(screen.getByText('#1')).toBeInTheDocument());
    expect(screen.getByText('uptime', { selector: 'code' })).toBeInTheDocument();
    expect(screen.getByText('1/2 ok')).toBeInTheDocument();
    expect(screen.getAllByText('Unraid Server')).toHaveLength(2); // target chip + result row
    expect(screen.getAllByText('Senpai Laptop')).toHaveLength(2);
    expect(screen.getByText('exit 0')).toBeInTheDocument();
    expect(screen.getByText('exit 1')).toBeInTheDocument();
    // Failed row expands by default; succeeded row stays collapsed
    expect(screen.getByText('connection refused')).toBeInTheDocument();
    expect(screen.queryByText('up 2 days')).not.toBeInTheDocument();
  });

  it('I interaction: a transport failure dispatches an error toast and leaves the page usable', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockShellFleet.mockRejectedValue(new Error('MeshCentral unreachable'));
    setServers(servers);
    render(wrap());

    fireEvent.click(screen.getByRole('button', { name: /Unraid Server/ }));
    fireEvent.click(screen.getByRole('button', { name: /run on 1 device/i }));

    await waitFor(() =>
      expect(dispatchSpy.mock.calls.some(([e]) => (e as CustomEvent).type === 'kts:toast')).toBe(true),
    );
    const toastCall = dispatchSpy.mock.calls.find(([e]) => (e as CustomEvent).type === 'kts:toast')!;
    const detail = (toastCall[0] as CustomEvent).detail;
    expect(detail.type).toBe('error');
    expect(detail.title).toBe('Fleet command failed');

    expect(screen.getByText('Fleet Command')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run on 1 device/i })).not.toBeDisabled();
  });

  it('M modal: Fleet Command renders no dialogs (M not applicable on this route)', () => {
    setServers(servers);
    render(wrap());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
