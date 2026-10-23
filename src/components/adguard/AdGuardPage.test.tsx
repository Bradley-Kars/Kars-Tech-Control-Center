import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdGuardPage } from './AdGuardPage';
import { mockServerConfig, mockAdGuardStatus, mockAdGuardStats, mockAdGuardQueryLog, mockAdGuardClients, mockAdGuardFilters } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getAdGuardStatus: vi.fn(),
  getAdGuardStats: vi.fn(),
  getAdGuardQueryLog: vi.fn(),
  getAdGuardClients: vi.fn(),
  getAdGuardFilters: vi.fn(),
  getAdGuardDhcp: vi.fn(),
  adguardEnable: vi.fn(),
  adguardDisable: vi.fn(),
}));

import { getAdGuardStatus, getAdGuardStats, getAdGuardQueryLog, getAdGuardClients, getAdGuardFilters, getAdGuardDhcp } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAdGuardStatus).mockResolvedValue(mockAdGuardStatus as any);
  vi.mocked(getAdGuardStats).mockResolvedValue(mockAdGuardStats as any);
  vi.mocked(getAdGuardQueryLog).mockResolvedValue(mockAdGuardQueryLog as any);
  vi.mocked(getAdGuardClients).mockResolvedValue(mockAdGuardClients as any);
  vi.mocked(getAdGuardFilters).mockResolvedValue(mockAdGuardFilters as any);
  vi.mocked(getAdGuardDhcp).mockResolvedValue({ enabled: false, leases: [] } as any);
});

describe('AdGuardPage', () => {
  it('renders AdGuard Home title after loading', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
  });

  it('displays protection status', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Protection Enabled')).toBeInTheDocument();
    });
  });

  it('shows overview tab by default with DNS stats', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('DNS Queries')).toBeInTheDocument();
    });
    expect(screen.getByText('3,084,491')).toBeInTheDocument();
  });

  it('shows blocked stats', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Blocked')).toBeInTheDocument();
    });
    expect(screen.getByText('384,155')).toBeInTheDocument();
  });

  it('shows tab buttons with lowercase text', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'queries' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'clients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'filters' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dhcp' })).toBeInTheDocument();
  });

  it('navigates to queries tab', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'queries' }).click();
    await waitFor(() => {
      expect(screen.getByText('Domain')).toBeInTheDocument();
    });
  });

  it('queries tab shows filter dropdown', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'queries' }).click();
    await waitFor(() => {
      expect(screen.getByText('All Queries')).toBeInTheDocument();
    });
  });

  it('navigates to clients tab', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'clients' }).click();
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Ophelia')).toBeInTheDocument();
  });

  it('clients tab shows clients', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'clients' }).click();
    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
    });
    expect(screen.getByText('Ophelia')).toBeInTheDocument();
    expect(screen.getByText('IoT')).toBeInTheDocument();
    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('navigates to filters tab', async () => {
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('AdGuard Home')).toBeInTheDocument();
    });
    screen.getByRole('button', { name: 'filters' }).click();
    await waitFor(() => {
      expect(screen.getByText('AdGuard DNS filter')).toBeInTheDocument();
      expect(screen.getByText('AdGuard Base filter')).toBeInTheDocument();
    });
  });

  it('displays error banner when API fails', async () => {
    vi.mocked(getAdGuardStatus).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getAdGuardStats).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getAdGuardQueryLog).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getAdGuardClients).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getAdGuardFilters).mockRejectedValue(new Error('Connection refused'));
    vi.mocked(getAdGuardDhcp).mockRejectedValue(new Error('Connection refused'));
    render(<AdGuardPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
    });
  });
});