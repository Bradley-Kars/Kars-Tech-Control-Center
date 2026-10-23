import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SteamDeckPage } from './SteamDeckPage';

vi.mock('../../lib/tauri-commands', () => ({
  steamdeckGetSystemStats: vi.fn(),
  steamdeckGetBattery: vi.fn(),
  steamdeckGetThermal: vi.fn(),
  steamdeckGetDisk: vi.fn(),
  steamdeckGetNetwork: vi.fn(),
  steamdeckGetGpu: vi.fn(),
  steamdeckLaunchRustdesk: vi.fn(),
  steamdeckGetDeskflowStatus: vi.fn(),
  allyProvision: vi.fn(),
  allyLaunchAgent: vi.fn(),
}));

import {
  steamdeckGetSystemStats,
  steamdeckGetBattery,
  steamdeckGetThermal,
  steamdeckGetDisk,
  steamdeckGetNetwork,
  steamdeckGetGpu,
  steamdeckGetDeskflowStatus,
  allyLaunchAgent,
} from '../../lib/tauri-commands';
const mockStats = vi.mocked(steamdeckGetSystemStats);
const mockBattery = vi.mocked(steamdeckGetBattery);
const mockThermal = vi.mocked(steamdeckGetThermal);
const mockDisk = vi.mocked(steamdeckGetDisk);
const mockNetwork = vi.mocked(steamdeckGetNetwork);
const mockGpu = vi.mocked(steamdeckGetGpu);
const mockDeskflow = vi.mocked(steamdeckGetDeskflowStatus);
const mockLaunchAgent = vi.mocked(allyLaunchAgent);

const allyServer = {
  id: 'rog-ally',
  name: 'ROG Ally',
  hostname: 'lgbtally.tailf6d3b4.ts.net',
  username: 'ally',
  port: 22,
  device_type: 'steamdeck',
  auth: { type: 'password', password: 'x' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockStats.mockResolvedValue({
    hostname: 'ally',
    os_release: 'Bazzite',
    kernel: '6.8',
    arch: 'x86_64',
    uptime: 'up 1 hour',
    timezone: 'UTC',
    cpu_usage: 42.5,
    cpu_cores: 8,
    cpu_speed: 4.0,
    memory_total_mb: 16384,
    memory_used_mb: 5120,
    memory_free_mb: 11264,
    memory_usage_pct: 31.2,
    swap_total_mb: 2048,
    swap_used_mb: 200,
  });
  mockBattery.mockResolvedValue({ percentage: 87, charging: true, time_remaining: '2h', capacity_wh: 40 });
  mockThermal.mockResolvedValue({ cpu_temp_c: 62, gpu_temp_c: 55, fan_speed_rpm: 2400, fan_pwm: 45 });
  mockDisk.mockResolvedValue({ total_gb: 476.9, used_gb: 210.4, free_gb: 266.5, usage_pct: 44.1 });
  mockNetwork.mockResolvedValue({ interfaces: [{ name: 'tailscale0', ip: '100.123.108.123', mac: 'aa:bb' }] });
  mockGpu.mockResolvedValue({ vendor: 'AMD', model: 'RADV Radeon 780M', driver_version: 'amdgpu', memory_total_mb: 8192, memory_used_mb: 2048, temperature_c: 56, utilization_pct: 40 });
  mockDeskflow.mockResolvedValue({ connected: true });
  mockLaunchAgent.mockResolvedValue({ ok: true, terminal: 'foot' });
});

describe('SteamDeckPage', () => {
  it('renders the device name and no-server fallback', () => {
    render(<SteamDeckPage servers={[]} />);
    expect(screen.getByText(/No Steam Deck Connected/)).toBeInTheDocument();
  });

  it('renders gauges and reports rounded memory values', async () => {
    render(<SteamDeckPage servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('ROG Ally')).toBeInTheDocument());
    expect(screen.getAllByText('CPU').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RAM').length).toBeGreaterThan(0);
    // Memory & Swap card shows GB with one decimal.
    expect(screen.getByText('5.0 GB')).toBeInTheDocument();
    expect(screen.getByText('16.0 GB')).toBeInTheDocument();
  });

  it('renders thermal and GPU data from the handheld', async () => {
    render(<SteamDeckPage servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('ROG Ally')).toBeInTheDocument());
    expect(screen.getByText('62°C')).toBeInTheDocument();
    expect(screen.getByText('AMD')).toBeInTheDocument();
    expect(screen.getByText('RADV Radeon 780M')).toBeInTheDocument();
  });

  it('exposes the provision and summon-agent actions', async () => {
    render(<SteamDeckPage servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('ROG Ally')).toBeInTheDocument());
    expect(screen.getByText(/Provision/)).toBeInTheDocument();
    expect(screen.getByText(/Summon Agent/)).toBeInTheDocument();
  });

  it('opens the agent terminal and shows the status card', async () => {
    render(<SteamDeckPage servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('ROG Ally')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Summon Agent/));
    expect(mockLaunchAgent).toHaveBeenCalledWith('rog-ally');
    expect(await screen.findByText(/AI agent opened in a foot window/)).toBeInTheDocument();
  });

  it('shows an agent error in the status card', async () => {
    mockLaunchAgent.mockRejectedValueOnce(new Error('boom'));
    render(<SteamDeckPage servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('ROG Ally')).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Summon Agent/));
    expect(await screen.findByText(/Agent error: boom/)).toBeInTheDocument();
  });
});
