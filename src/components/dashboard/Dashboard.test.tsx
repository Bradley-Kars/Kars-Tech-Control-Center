import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import { mockServerConfig, mockSystemStats } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getGpuInfo: vi.fn(),
  getDockerContainers: vi.fn(),
  meshcentralReboot: vi.fn(),
  meshcentralShutdown: vi.fn(),
  getArrayInfo: vi.fn(),
  getPhoneDeviceInfo: vi.fn(),
  getPhoneBattery: vi.fn(),
  getPhoneMemory: vi.fn(),
  getPhoneCpu: vi.fn(),
  getPhoneStorage: vi.fn(),
  getKdeConnectBattery: vi.fn(),
  getKdeConnectNotifications: vi.fn(),
  getKdeConnectMpris: vi.fn(),
  steamdeckGetBattery: vi.fn(),
  steamdeckGetThermal: vi.fn(),
  steamdeckGetDeskflowStatus: vi.fn(),
  steamdeckGetSystemStats: vi.fn(),
  steamdeckGetDisk: vi.fn(),
  steamdeckGetGpu: vi.fn(),
  getLocalSystemStats: vi.fn(),
}));

import { getGpuInfo, getDockerContainers, getArrayInfo, steamdeckGetBattery, steamdeckGetThermal, steamdeckGetDeskflowStatus, steamdeckGetSystemStats, steamdeckGetDisk, steamdeckGetGpu, getLocalSystemStats } from '../../lib/tauri-commands';
const mockGetGpuInfo = vi.mocked(getGpuInfo);
const mockGetDockerContainers = vi.mocked(getDockerContainers);
const mockGetArrayInfo = vi.mocked(getArrayInfo);
const mockSteamdeckBattery = vi.mocked(steamdeckGetBattery);
const mockSteamdeckThermal = vi.mocked(steamdeckGetThermal);
const mockSteamdeckDeskflow = vi.mocked(steamdeckGetDeskflowStatus);
const mockSteamdeckStats = vi.mocked(steamdeckGetSystemStats);
const mockSteamdeckDisk = vi.mocked(steamdeckGetDisk);
const mockSteamdeckGpu = vi.mocked(steamdeckGetGpu);
const mockGetLocalSystemStats = vi.mocked(getLocalSystemStats);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetGpuInfo.mockResolvedValue(null);
  mockGetDockerContainers.mockResolvedValue([]);
  mockGetArrayInfo.mockResolvedValue(null);
  mockGetLocalSystemStats.mockResolvedValue(null);
});

describe('Dashboard', () => {
  const defaultProps = {
    servers: [mockServerConfig],
    stats: mockSystemStats,
    onRefresh: vi.fn(),
    onNavigate: vi.fn(),
  };

  it('renders Dashboard heading', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('renders CPU and Memory gauges', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getAllByText('CPU').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Memory').length).toBeGreaterThan(0);
  });

  it('displays CPU percentage in gauge', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('29%')).toBeInTheDocument();
  });

  it('shows reboot button', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('🔄 Reboot')).toBeInTheDocument();
  });

  it('shows shutdown button', () => {
    render(<Dashboard {...defaultProps} />);
    expect(screen.getByText('⏻ Shutdown')).toBeInTheDocument();
  });

  it('calls onRefresh when refresh button clicked', () => {
    const onRefresh = vi.fn();
    render(<Dashboard {...defaultProps} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByText('↻ Refresh'));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles null stats gracefully', () => {
    render(<Dashboard {...defaultProps} stats={null} />);
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows no servers message when empty', () => {
    render(<Dashboard {...defaultProps} servers={[]} />);
    expect(screen.getByText('No Servers')).toBeInTheDocument();
  });

  it('renders the This System row from local stats', async () => {
    mockGetLocalSystemStats.mockResolvedValue({
      system: {
        hostname: 'workstation',
        kernel: '6.12.1',
        uptime: 'up 3 days',
        cpu_usage: 12.4,
        cpu_cores: 16,
        memory_usage_pct: 33.3,
        memory_used_mb: 16777,
        memory_total_mb: 32768,
      },
      thermal: { cpu_temp_c: 55.5, gpu_temp_c: 48.0, fan_speed_rpm: 1200 },
      gpu: { model: 'NVIDIA GeForce RTX 4070', memory_total_mb: 12288, memory_used_mb: 2048, temperature_c: 52.0, utilization_pct: 10 },
    });

    render(<Dashboard {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('This System')).toBeInTheDocument());
    expect(screen.getByText('workstation')).toBeInTheDocument();
    expect(screen.getByText('NVIDIA GeForce RTX 4070')).toBeInTheDocument();
    expect(screen.getByText('12.4%')).toBeInTheDocument();
  });

  it('renders the handheld stat row when a steamdeck server exists', async () => {
    const allyServer = {
      id: 'rog-ally',
      name: 'ROG Ally',
      hostname: 'lgbtally.tailf6d3b4.ts.net',
      username: 'ally',
      port: 22,
      device_type: 'steamdeck',
      auth: { type: 'password', password: 'x' },
    };
    mockSteamdeckBattery.mockResolvedValue({ percentage: 90, charging: true });
    mockSteamdeckThermal.mockResolvedValue({ cpu_temp_c: 60, gpu_temp_c: 55 });
    mockSteamdeckDeskflow.mockResolvedValue({ connected: true });
    mockSteamdeckStats.mockResolvedValue({
      cpu_usage: 45.2,
      memory_usage_pct: 30,
      memory_used_mb: 5120,
      memory_total_mb: 16384,
      uptime: 'up 1 hour',
    });
    mockSteamdeckDisk.mockResolvedValue({ total_gb: 476.9, used_gb: 210.0, free_gb: 266.0, usage_pct: 44 });
    mockSteamdeckGpu.mockResolvedValue({ model: 'AMD Radeon Graphics', memory_total_mb: 8192, memory_used_mb: 1024, temperature_c: 50, utilization_pct: 25 });

    render(<Dashboard {...defaultProps} servers={[allyServer as any]} />);
    await waitFor(() => expect(screen.getByText('Steam Deck')).toBeInTheDocument());
    expect(screen.getByText('45.2%')).toBeInTheDocument();
    expect(screen.getByText(/30.0% \(5.0 GB\)/)).toBeInTheDocument();
    expect(screen.getByText('210.0 / 476.9 GB (44%)')).toBeInTheDocument();
  });
});