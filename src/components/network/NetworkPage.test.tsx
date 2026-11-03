import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NetworkPage } from './NetworkPage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getNetworkInterfaces: vi.fn(),
  getTailscalePeers: vi.fn(),
}));

import { getNetworkInterfaces, getTailscalePeers } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NetworkPage loading state (SKELETON-001)', () => {
  it('renders skeletons instead of plain "Loading..." text while data loads', async () => {
    vi.mocked(getNetworkInterfaces).mockResolvedValue(
      'eth0 UP 192.168.1.100/24' as any
    );
    vi.mocked(getTailscalePeers).mockResolvedValue(
      '100.103.29.63 home-server' as any
    );

    render(<NetworkPage server={mockServerConfig} />);

    // While commands are in flight (promise resolution is still a microtask):
    // skeletons are shown, never the plain "Loading..." text.
    expect(screen.getByTestId('network-interfaces-loading')).toBeInTheDocument();
    expect(screen.getByTestId('tailscale-peers-loading')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();

    await waitFor(() =>
      expect(screen.getByText('eth0 UP 192.168.1.100/24')).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(screen.getByText('100.103.29.63 home-server')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('network-interfaces-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tailscale-peers-loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('shows the error banner when the network commands fail', async () => {
    vi.mocked(getNetworkInterfaces).mockRejectedValue(new Error('daemon unreachable'));
    vi.mocked(getTailscalePeers).mockRejectedValue(new Error('daemon unreachable'));

    render(<NetworkPage server={mockServerConfig} />);

    await waitFor(() =>
      expect(screen.getByText('Error: daemon unreachable')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('network-interfaces-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tailscale-peers-loading')).not.toBeInTheDocument();
  });
});
