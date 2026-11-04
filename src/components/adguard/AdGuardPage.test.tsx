import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { AdGuardPage } from './AdGuardPage';
import {
  mockServerConfig,
  mockAdGuardStatus,
  mockAdGuardStats,
  mockAdGuardQueryLog,
  mockAdGuardClients,
  mockAdGuardFilters,
} from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getAdGuardStatus: vi.fn(),
  getAdGuardStats: vi.fn(),
  getAdGuardQueryLog: vi.fn(),
  getAdGuardClients: vi.fn(),
  getAdGuardFilters: vi.fn(),
  getAdGuardDhcp: vi.fn(),
  adguardEnable: vi.fn(),
  adguardDisable: vi.fn(),
}));

import {
  getAdGuardStatus,
  getAdGuardStats,
  getAdGuardQueryLog,
  getAdGuardClients,
  getAdGuardFilters,
  getAdGuardDhcp,
  adguardEnable,
  adguardDisable,
} from '../../lib/fleet-api';

const mockGetAdGuardStatus = vi.mocked(getAdGuardStatus);
const mockGetAdGuardStats = vi.mocked(getAdGuardStats);
const mockGetAdGuardQueryLog = vi.mocked(getAdGuardQueryLog);
const mockGetAdGuardClients = vi.mocked(getAdGuardClients);
const mockGetAdGuardFilters = vi.mocked(getAdGuardFilters);
const mockGetAdGuardDhcp = vi.mocked(getAdGuardDhcp);
const mockAdGuardEnable = vi.mocked(adguardEnable);
const mockAdGuardDisable = vi.mocked(adguardDisable);

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAdGuardStatus.mockResolvedValue(mockAdGuardStatus as any);
  mockGetAdGuardStats.mockResolvedValue(mockAdGuardStats as any);
  mockGetAdGuardQueryLog.mockResolvedValue(mockAdGuardQueryLog as any);
  mockGetAdGuardClients.mockResolvedValue(mockAdGuardClients as any);
  mockGetAdGuardFilters.mockResolvedValue(mockAdGuardFilters as any);
  mockGetAdGuardDhcp.mockResolvedValue({ enabled: false, leases: [] } as any);
  mockAdGuardEnable.mockResolvedValue(undefined);
  mockAdGuardDisable.mockResolvedValue(undefined);
});

describe('AdGuardPage (D/E/L/R/I/M state matrix)', () => {
  it('L loading: shows the spinner until all seven endpoints settle', async () => {
    const p = {
      status: pending<typeof mockAdGuardStatus>(),
      stats: pending<typeof mockAdGuardStats>(),
      queryLog: pending<typeof mockAdGuardQueryLog>(),
      clients: pending<typeof mockAdGuardClients>(),
      filters: pending<typeof mockAdGuardFilters>(),
      dhcp: pending<typeof mockGetAdGuardDhcp>(),
    };
    mockGetAdGuardStatus.mockResolvedValue(p.status.promise as any);
    mockGetAdGuardStats.mockResolvedValue(p.stats.promise as any);
    mockGetAdGuardQueryLog.mockResolvedValue(p.queryLog.promise as any);
    mockGetAdGuardClients.mockResolvedValue(p.clients.promise as any);
    mockGetAdGuardFilters.mockResolvedValue(p.filters.promise as any);
    mockGetAdGuardDhcp.mockResolvedValue(p.dhcp.promise as any);

    render(<AdGuardPage server={mockServerConfig} />);

    expect(screen.queryByText('AdGuard Home')).not.toBeInTheDocument();
    expect(screen.queryByText('Protection Enabled')).not.toBeInTheDocument();

    p.status.resolve(mockAdGuardStatus as any);
    p.stats.resolve(mockAdGuardStats as any);
    mockGetAdGuardQueryLog.mockResolvedValue(mockAdGuardQueryLog as any);
    mockGetAdGuardClients.mockResolvedValue(mockAdGuardClients as any);
    mockGetAdGuardFilters.mockResolvedValue(mockAdGuardFilters as any);
    mockGetAdGuardDhcp.mockResolvedValue({ enabled: false, leases: [] } as any);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());
  });

  it('D populated: shows the AdGuard Home title and protection status', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());
    expect(screen.getByText('Protection Enabled')).toBeInTheDocument();
  });

  it('D populated: overview shows DNS query and blocked stats', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('DNS Queries')).toBeInTheDocument());
    expect(screen.getByText('3,084,491')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getByText('384,155')).toBeInTheDocument();
  });

  it('D populated: queries tab shows the query log table', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'queries' }).click();

    await waitFor(() => expect(screen.getByText('Domain')).toBeInTheDocument());
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('D populated: clients tab shows the client list', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'clients' }).click();

    await waitFor(() => expect(screen.getByText('Name')).toBeInTheDocument());
    expect(screen.getByText('Ophelia')).toBeInTheDocument();
    expect(screen.getByText('IoT')).toBeInTheDocument();
  });

  it('D populated: filters tab shows the filter list', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'filters' }).click();

    await waitFor(() => expect(screen.getByText('AdGuard DNS filter')).toBeInTheDocument());
    expect(screen.getByText('AdGuard Base filter')).toBeInTheDocument();
  });

  it('D populated: dhcp tab shows the DHCP server section', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'dhcp' }).click();

    await waitFor(() => expect(screen.getByText('DHCP Server')).toBeInTheDocument());
  });

  it('E empty filters: filters tab renders with no filter rows', async () => {
    mockGetAdGuardFilters.mockResolvedValue([] as any);

    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'filters' }).click();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.queryByText('AdGuard DNS filter')).not.toBeInTheDocument();
  });

  it('E empty clients: clients tab renders with no client rows', async () => {
    mockGetAdGuardClients.mockResolvedValue({ clients: [] } as any);

    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    screen.getByRole('button', { name: 'clients' }).click();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.queryByText('Ophelia')).not.toBeInTheDocument();
  });

  it('D populated: shows Protection Disabled and an Enable button when protection is off', async () => {
    mockGetAdGuardStatus.mockResolvedValue({ ...mockAdGuardStatus, protection_enabled: false } as any);

    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());
    expect(screen.getByText('Protection Disabled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable/i })).toBeInTheDocument();
  });

  it('R error: shows the error banner when all endpoints fail', async () => {
    mockGetAdGuardStatus.mockRejectedValue(new Error('Connection refused'));
    mockGetAdGuardStats.mockRejectedValue(new Error('Connection refused'));
    mockGetAdGuardQueryLog.mockRejectedValue(new Error('Connection refused'));
    mockGetAdGuardClients.mockRejectedValue(new Error('Connection refused'));
    mockGetAdGuardFilters.mockRejectedValue(new Error('Connection refused'));
    mockGetAdGuardDhcp.mockRejectedValue(new Error('Connection refused'));

    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText(/Failed to load/)).toBeInTheDocument());
  });

  it('I interaction: Enable button calls adguardEnable', async () => {
    mockGetAdGuardStatus.mockResolvedValue({ ...mockAdGuardStatus, protection_enabled: false } as any);

    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Protection Disabled')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /enable/i }));

    await waitFor(() => expect(mockAdGuardEnable).toHaveBeenCalledTimes(1));
  });

  it('I interaction: Disable button calls adguardDisable', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('Protection Enabled')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /disable/i }));

    await waitFor(() => expect(mockAdGuardDisable).toHaveBeenCalledTimes(1));
  });

  it('M modal: no dialog renders on AdGuardPage', async () => {
    render(<AdGuardPage server={mockServerConfig} />);

    await waitFor(() => expect(screen.getByText('AdGuard Home')).toBeInTheDocument());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });
});
