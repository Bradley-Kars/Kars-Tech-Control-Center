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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24');
  mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NetworkPage state matrix', () => {
  it('L loading: shows skeleton skeletons while data loads', async () => {
    mockGetNetworkInterfaces.mockResolvedValue(new Promise(() => {}));
    mockGetTailscalePeers.mockResolvedValue(new Promise(() => {}));

    render(<NetworkPage server={mockServerConfig} />);

    expect(screen.getByTestId('network-interfaces-loading')).toBeInTheDocument();
    expect(screen.getByTestId('tailscale-peers-loading')).toBeInTheDocument();
  });

  it('D populated: shows network interfaces and tailscale peers data', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24\nwlan0 UP 192.168.1.101/24');
    mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server\n100.103.29.64 laptop');

    render(<NetworkPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText((content) => content.includes('eth0 UP'))).toBeInTheDocument());
    expect(screen.getByText('Network')).toBeInTheDocument();
    expect(screen.getByText('Network Interfaces')).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes('wlan0 UP'))).toBeInTheDocument();
    expect(screen.getByText('Tailscale Peers')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText((content) => content.includes('100.103.29.63'))).toBeInTheDocument());
    expect(screen.getByText((content) => content.includes('100.103.29.64'))).toBeInTheDocument();
    expect(screen.queryByTestId('network-interfaces-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tailscale-peers-loading')).not.toBeInTheDocument();
  });

  it('E empty: shows empty interface and tailscale lists when no data', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('');
    mockGetTailscalePeers.mockResolvedValue('');

    render(<NetworkPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText('Network Interfaces')).toBeInTheDocument();
    expect(screen.getByText('Tailscale Peers')).toBeInTheDocument();
    expect(screen.queryByText('eth0')).not.toBeInTheDocument();
    expect(screen.queryByText('100.103.29.63')).not.toBeInTheDocument();
  });

  it('R error: shows error banner when network fetch fails', async () => {
    mockGetNetworkInterfaces.mockRejectedValue(new Error('daemon unreachable'));
    mockGetTailscalePeers.mockResolvedValue('100.103.29.63 home-server');

    render(<NetworkPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
    expect(screen.getByText('100.103.29.63 home-server')).toBeInTheDocument();
  });

  it('R error: shows error banner when tailslate fetch fails', async () => {
    mockGetNetworkInterfaces.mockResolvedValue('eth0 UP 192.168.1.100/24');
    mockGetTailscalePeers.mockRejectedValue(new Error('mesh unreachable'));

    render(<NetworkPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText((content) => content.includes('eth0 UP'))).toBeInTheDocument();
    expect(screen.getByText(/mesh unreachable/)).toBeInTheDocument();
  });

  it('I interaction: refresh button re-fetches data', () => {
    render(<NetworkPage server={mockServerConfig} />);

    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));

    expect(mockGetNetworkInterfaces).toHaveBeenCalledTimes(2);
    expect(mockGetTailscalePeers).toHaveBeenCalledTimes(2);
  });

  it('M modal: no modal component on NetworkPage', async () => {
    render(<NetworkPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText((content) => content.includes('eth0 UP'))).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });
});
