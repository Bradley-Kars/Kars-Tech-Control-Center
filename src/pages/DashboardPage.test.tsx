import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useNavigate: vi.fn(() => mockNavigate),
  };
});

const mocks = vi.hoisted(() => ({
  useServers: vi.fn(),
  useLocalStats: vi.fn(),
  useFleetStats: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useServers: mocks.useServers,
  useLocalStats: mocks.useLocalStats,
  useFleetStats: mocks.useFleetStats,
}));

vi.mock('../lib/tauri-commands', () => ({
  alertList: vi.fn(),
  alertCreate: vi.fn(),
  meshcentralShellFleet: vi.fn(),
}));

import { alertList, alertCreate, meshcentralShellFleet } from '../lib/tauri-commands';
const mockAlertList = vi.mocked(alertList);
const mockAlertCreate = vi.mocked(alertCreate);
const mockMeshcentralShellFleet = vi.mocked(meshcentralShellFleet);

const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((k: string) => localStorageStore[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { localStorageStore[k] = v; }),
  removeItem: vi.fn((k: string) => { delete localStorageStore[k]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach((key) => delete localStorageStore[key]); }),
};
Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock,
});

const servers = [
  { id: 'local', name: 'This Machine', device_type: 'local', hostname: 'localhost' },
  { id: 'unraid', name: 'Unraid Server', device_type: 'unraid', hostname: 'unraid.main', meshcentral_device_id: 'mc-unraid' },
  { id: 'phone', name: 'Galaxy S24 Ultra', device_type: 'phone', hostname: 's24.main' },
];

const localStats = { hostname: 'localhost', cpu_usage: 22, memory_usage_pct: 44, temp_avg: 50, uptime: '3 days' };

const fleetStats = {
  unraid: { connected: true, source: 'meshcentral', cpu_usage: 29, memory_usage_pct: 74, temp_avg: 45, uptime: '2 days', hostname: 'unraid.main' },
  phone: { connected: true, source: 'adb', cpu_usage: 12, memory_usage_pct: 33, hostname: 's24.main' },
};

const renderPage = (overrides: Partial<{
  servers: typeof servers;
  loading: boolean;
  localStats: unknown;
  fleetStats: Record<string, unknown>;
}> = {}) => {
  mocks.useServers.mockReturnValue({
    servers: overrides.servers ?? servers,
    loading: overrides.loading ?? false,
    error: null,
  } as any);
  mocks.useLocalStats.mockReturnValue({ stats: overrides.localStats ?? localStats, loading: false, error: null } as any);
  mocks.useFleetStats.mockReturnValue({ fleetStats: overrides.fleetStats ?? fleetStats, loading: false } as any);
  return render(
    <MemoryRouter initialEntries={['/']}>
      <DashboardPage />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.clear();
  mockAlertList.mockResolvedValue([]);
  mockAlertCreate.mockResolvedValue({} as any);
  mockMeshcentralShellFleet.mockResolvedValue([]);
});

describe('DashboardPage (D/E/L/R/I state matrix)', () => {
  it('L loading: renders the skeleton shell instead of fleet content while servers load', () => {
    const { container } = renderPage({ loading: true });

    expect(screen.queryByText('Fleet Overview')).not.toBeInTheDocument();
    expect(screen.queryByText('This Machine')).not.toBeInTheDocument();

    // 1 text skeleton (3 shimmer lines) + 6 SkeletonCard (2 shimmers each) = 15
    const shimmers = container.querySelectorAll('div[style*="skeleton-shimmer"]');
    expect(shimmers.length).toBe(15);
  });

  it('E empty servers: only the local machine card shows ("1 device"), quick actions fall back to Fleet Health + Refresh', () => {
    renderPage({ servers: [] });

    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    expect(screen.getByText('Real-time status across 1 device')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'This Machine' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Unraid Server' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Galaxy S24 Ultra' })).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: /Fleet Health/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh All/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reboot Unraid/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Docker Containers/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ring Phone/ })).not.toBeInTheDocument();

    // Service overview still renders
    expect(screen.getByText('Service Health')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('Lidarr')).toBeInTheDocument();
  });

  it('D populated: fleet header, three online device cards with gauges, full quick actions, service overview', () => {
    renderPage();

    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    expect(screen.getByText('Real-time status across 3 devices')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'This Machine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unraid Server' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Galaxy S24 Ultra' })).toBeInTheDocument();
    expect(screen.getAllByText('Online')).toHaveLength(3);

    expect(screen.getAllByText('CPU')).toHaveLength(3);
    expect(screen.getAllByText('Memory')).toHaveLength(3);
    expect(screen.getByText('22%')).toBeInTheDocument();
    expect(screen.getByText('44%')).toBeInTheDocument();
    expect(screen.getByText('50°C')).toBeInTheDocument();   // temp gauge uses a °C valueFormatter
    expect(screen.getByText('29%')).toBeInTheDocument();
    expect(screen.getByText('74%')).toBeInTheDocument();
    expect(screen.getByText('45°C')).toBeInTheDocument();
    expect(screen.getByText('12%')).toBeInTheDocument();
    expect(screen.getByText('33%')).toBeInTheDocument();

    // Unraid is MeshCentral-enrolled → "via MeshCentral" badge on its card
    expect(screen.getByText('via MeshCentral')).toBeInTheDocument();

    // 3 unraid + 2 phone + 2 shared quick actions
    for (const label of ['Reboot Unraid', 'Docker Containers', 'Storage Array', 'Ring Phone', 'Screenshot Phone', 'Fleet Health', 'Refresh All']) {
      expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }

    expect(screen.getByText('Service Health')).toBeInTheDocument();
    for (const label of ['Docker', 'Storage', 'System', 'Network', 'Nextcloud', 'Home Assistant', 'AdGuard', 'Lidarr']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('R error: alertList failure on load does not crash the page', () => {
    mockAlertList.mockRejectedValue(new Error('invoke undefined'));
    renderPage();

    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'This Machine' })).toBeInTheDocument();
  });

  it('R error: fleet health failure shows an error toast and the page stays usable', async () => {
    renderPage();
    mockMeshcentralShellFleet.mockRejectedValue(new Error('MeshCentral unreachable'));

    fireEvent.click(screen.getByRole('button', { name: /Fleet Health/ }));
    await waitFor(() => expect(screen.getByText('Health check failed')).toBeInTheDocument());
    expect(screen.getByText('Fleet Overview')).toBeInTheDocument();
  });

  it('I interaction: refresh re-lists alerts and dispatches kts:refresh', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderPage();
    const before = mockAlertList.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /Refresh All/ }));

    expect(mockAlertList).toHaveBeenCalledTimes(before + 1);
    expect(mockAlertList).toHaveBeenLastCalledWith({ acknowledged: false, limit: 50 });
    expect(dispatchSpy.mock.calls.some(([e]) => (e as CustomEvent).type === 'kts:refresh')).toBe(true);
  });

  it('I interaction: reset layout clears the persisted layout and dispatches kts:refresh', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    localStorageStore['kts:dashboard:layout'] = JSON.stringify([{ i: 'device-unraid', x: 0, y: 0, w: 4, h: 7 }]);

    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Reset/ }));

    expect(localStorageMock.removeItem).toHaveBeenCalledWith('kts:dashboard:layout');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'kts:refresh' }));
  });

  it('I interaction: clicking a device card navigates to that device route', () => {
    renderPage();

    fireEvent.click(screen.getByRole('heading', { name: 'Unraid Server' }));
    expect(mockNavigate).toHaveBeenCalledWith('/device/unraid');

    fireEvent.click(screen.getByRole('heading', { name: 'Galaxy S24 Ultra' }));
    expect(mockNavigate).toHaveBeenCalledWith('/device/phone');
  });

  it('I interaction: fleet health with no enrolled devices shows an info toast', () => {
    const noEnrolled = servers.filter((s) => !('meshcentral_device_id' in s));
    renderPage({ servers: noEnrolled });

    fireEvent.click(screen.getByRole('button', { name: /Fleet Health/ }));
    expect(screen.getByText('No enrolled devices')).toBeInTheDocument();
  });

  it('I interaction: fleet health success shows a success toast', async () => {
    renderPage();
    mockMeshcentralShellFleet.mockResolvedValue([
      { device_id: 'mc-unraid', success: true, stdout: 'up 2 days', stderr: '' } as any,
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Fleet Health/ }));
    await waitFor(() => expect(screen.getByText('Fleet healthy')).toBeInTheDocument());
  });

  it('I interaction: quick actions navigate for unraid/phone and dispatch phone events', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Docker Containers/ }));
    expect(mockNavigate).toHaveBeenCalledWith('/service/docker');

    fireEvent.click(screen.getByRole('button', { name: /Ring Phone/ }));
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'kts:ring-phone' }));
  });

  it('M modal: dashboard surfaces no dialogs (M not applicable on this route)', () => {
    renderPage();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
