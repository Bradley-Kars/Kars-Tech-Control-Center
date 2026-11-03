import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DevicePage } from './DevicePage';

const mocks = vi.hoisted(() => ({
  useLocalStats: vi.fn(),
}));

vi.mock('../components/phone/PhonePage', () => ({
  PhonePage: () => <div data-testid="phone-page">Phone Page Placeholder</div>,
}));
vi.mock('../components/steamdeck/SteamDeckPage', () => ({
  SteamDeckPage: () => <div data-testid="steamdeck-page">Steam Deck Placeholder</div>,
}));

vi.mock('../lib/tauri-commands', () => ({
  meshcentralReboot: vi.fn(),
  meshcentralShutdown: vi.fn(),
  meshcentralGetTerminalUrl: vi.fn(),
  meshcentralGetFileManagerUrl: vi.fn(),
  meshcentralGetProcesses: vi.fn(),
  meshcentralGetSystemStats: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useServers: vi.fn(() => ({ servers: [], loading: false, error: null })),
  useLocalStats: mocks.useLocalStats,
  useFleetStats: vi.fn(() => ({ fleetStats: {}, loading: false })),
}));

const onlineStats = {
  system: {
    hostname: 'localhost',
    kernel: '6.12.arch',
    uptime: '2 days, 03:14',
    cpu_brand: 'Intel(R) Core(TM)',
    cpu_cores: 8,
    memory_total_mb: 16384,
    memory_used_mb: 4096,
  },
  thermal: { cpu_temp_c: 55 },
  gpu: {
    name: 'NVIDIA GPU',
    utilization_pct: 30,
    memory_used_mb: 2048,
    memory_total_mb: 8192,
    temperature_c: 65,
  },
};

const renderLocal = (stats: unknown) => {
  mocks.useLocalStats.mockReturnValue({
    stats,
    loading: false,
    error: null,
    refresh: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={['/device/local']}>
      <Routes>
        <Route path="device/:deviceId" element={<DevicePage />} />
      </Routes>
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DevicePage offline state (DEV-002, DEV-003)', () => {
  it('renders a prominent Offline badge: danger variant, pulsing dot, larger size', () => {
    renderLocal(null);

    const badge = screen.getByText('Offline');
    expect(badge).toBeInTheDocument();
    expect(badge.querySelector('.animate-pulse')).not.toBeNull();
    expect(badge.className).toContain('bg-[var(--kts-status-error-bg)]');
  });

  it('renders Online without the offline danger styling', () => {
    renderLocal(onlineStats);

    const badge = screen.getByText('Online');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('bg-[var(--kts-status-running-bg)]');
    expect(badge.className).not.toContain('bg-[var(--kts-status-error-bg)]');
  });

  it('replaces bare "—" with per-field unavailable state and adds a panel-level explanation', () => {
    renderLocal(null);

    for (const field of ['hostname', 'kernel', 'uptime', 'cpu', 'cores', 'memory']) {
      const value = screen.getByTestId(`system-row-${field}-value`);
      expect(value.textContent).toBe('Offline — no data');
      expect(value.className).toContain('text-[var(--kts-text-tertiary)]');
    }
    expect(
      screen.getByText('System details unavailable while the device is offline.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('No sensor data available — device is offline.')
    ).toBeInTheDocument();
    expect(screen.getByText('Offline — no GPU data')).toBeInTheDocument();
    expect(screen.getByText('Offline — no sensor data')).toBeInTheDocument();
  });
});

describe('DevicePage online state (DEV-002)', () => {
  it('renders real system values instead of dashes or offline placeholders', () => {
    renderLocal(onlineStats);

    expect(screen.getByTestId('system-row-hostname-value').textContent).toBe('localhost');
    expect(screen.getByTestId('system-row-memory-value').textContent).toBe('4096 / 16384 MB');
    expect(screen.queryByText('Offline — no data')).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });
});

describe('DevicePage mobile layout (DEV-001)', () => {
  it('stacks gauge cards in a single column on mobile, 2 on tablet, 4 on desktop', () => {
    renderLocal(onlineStats);

    const vitals = screen.getByTestId('device-vitals');
    expect(vitals.classList.contains('grid-cols-1')).toBe(true);
    expect(vitals.classList.contains('md:grid-cols-2')).toBe(true);
    expect(vitals.classList.contains('lg:grid-cols-4')).toBe(true);
    expect(vitals.classList.contains('grid-cols-2')).toBe(false);
  });
});
