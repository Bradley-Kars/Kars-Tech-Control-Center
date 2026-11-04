import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NetworkPage } from './NetworkPage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getNetworkInterfaces: vi.fn(),
  getTailscalePeers: vi.fn(),
}));

import { getNetworkInterfaces, getTailscalePeers } from '../../lib/fleet-api';

const mockGetNetworkInterfaces = vi.mocked(getNetworkInterfaces);
const mockGetTailscalePeers = vi.mocked(getTailscalePeers);

const renderPage = (overrides: {
  interfaces?: string;
  tailscale?: string;
} = {}) => {
  mockGetNetworkInterfaces.mockResolvedValue(overrides.interfaces ?? '');
  mockGetTailscalePeers.mockResolvedValue(overrides.tailscale ?? '');
  return render(
    <MemoryRouter>
      <NetworkPage server={mockServerConfig} />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NetworkPage (D/E/L/R/I/M state matrix)', () => {
  it('L loading: shows skeleton skeletons while data loads', async () => {
    mockGetNetworkInterfaces.mockResolvedValue(new Promise(() => {}));
    mockGetTailscalePeers.mockResolvedValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByTestId('network-interfaces-loading')).toBeInTheDocument();
    expect(screen.getByTestId('tailscale-peers-loading')).toBeInTheDocument();
  });

  it('D populated: shows network interfaces and tailscale peers data', async () => {
    mockGetNetworkInterfaces.mockResolvedValue(
      'eth0 UP 192.168.1.100/24\nwlan0 UP 192.168.1.101/24' as any
    );
    mockGetTailscalePeers.mockResolvedValue(
      '100.103.29.63 home-server\n100.103.29.64 laptop' as any
    );

    renderPage();

    // Flush microtasks
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(screen.getByText('Network')).toBeInTheDocument();
    expect(screen.getByText('Network Interfaces')).toBeInTheDocument();
    expect(screen.getByText('eth0 UP 192.168.1.100/24')).toBeInTheDocument();
    expect(screen.getByText('wlan0 UP 192.168.1.101/24')).toBeInTheDocument();
    expect(screen.getByText('Tailscale Peers')).toBeInTheDocument();
    expect(screen.getByText('100.103.29.63 home-server')).toBeInTheDocument();
    expect(screen.getByText('100.103.29.64 laptop')).toBeInTheDocument();
    expect(screen.queryByTestId('network-interfaces-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tailscale-peers-loading')).not.toBeInTheDocument();
  });

  it('E empty: shows empty interface and tailscale lists when no data', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('' as any);
    mockGetTailscalePeers.mockResolvedValue('' as any);

    renderPage();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(screen.getByText('Network Interfaces')).toBeInTheDocument();
    expect(screen.getByText('Tailscale Peers')).toBeInTheDocument();
    expect(screen.queryByText('eth0')).not.toBeInTheDocument();
    expect(screen.queryByText('100.103.29.63')).not.toBeInTheDocument();
  });

  it('R error: shows error banner when network fetch fails', async () => {
    mockGetNetworkInterfaces.mockRejectedValue(new Error('daemon unreachable'));
    mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server' as any);

    renderPage();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
    expect(screen.getByText('100.103.29.63 home-server')).toBeInTheDocument();
  });

  it('R error: shows error banner when tailslate fetch fails', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24' as any);
    mockGetTailscalePeers.mockRejectedValue(new Error('mesh unreachable'));

    renderPage();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(screen.getByText('eth0 UP 192.168.1.100/24')).toBeInTheDocument();
    expect(screen.getByText(/mesh unreachable/)).toBeInTheDocument();
  });

  it('I interaction: refresh button re-fetches data', () => {
    mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24' as any);
    mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server' as any);

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    expect(mockGetNetworkInterfaces).toHaveBeenCalledTimes(2);
    expect(mockGetTailscalePeers).toHaveBeenCalledTimes(2);
  });

  it('M modal: no modal component on NetworkPage', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24' as any);
    mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server' as any);

    renderPage();

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(screen.getByText('eth0 UP 192.168.1.100/24')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });
});
