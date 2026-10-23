import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StoragePage } from './StoragePage';
import { mockServerConfig, mockDisks, mockShares } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getDisks: vi.fn(),
  getShares: vi.fn(),
  getSmartData: vi.fn(),
}));

import { getDisks, getShares, getSmartData } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDisks).mockResolvedValue(mockDisks as any);
  vi.mocked(getShares).mockResolvedValue(mockShares as any);
  vi.mocked(getSmartData).mockResolvedValue({ device: '/dev/sda', model: 'Samsung SSD', serial: 'ABC123', capacity: '500GB', health: 'PASSED', temperature: '32C', power_on_hours: '1000', reallocated_sectors: '0', pending_sectors: '0' } as any);
});

describe('StoragePage', () => {
  it('renders loading state initially', () => {
    render(<StoragePage server={mockServerConfig} />);
    expect(screen.getByText('Loading disks...')).toBeInTheDocument();
  });

  it('renders storage page after loading', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('displays disk names', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('sda')).toBeInTheDocument();
    expect(screen.getByText('sdb')).toBeInTheDocument();
    expect(screen.getByText('sdc')).toBeInTheDocument();
    expect(screen.getByText('nvme0n1')).toBeInTheDocument();
  });

  it('displays disk types', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('SSD')).toBeInTheDocument();
    expect(screen.getAllByText('HDD').length).toBe(2);
    expect(screen.getByText('NVMe')).toBeInTheDocument();
  });

  it('displays disk temperatures', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('32°C')).toBeInTheDocument();
    expect(screen.getByText('35°C')).toBeInTheDocument();
    expect(screen.getByText('38°C')).toBeInTheDocument();
    expect(screen.getByText('28°C')).toBeInTheDocument();
  });

  it('displays disk vendors', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getAllByText('Samsung').length).toBe(2);
    expect(screen.getByText('Western Digital')).toBeInTheDocument();
    expect(screen.getByText('Seagate')).toBeInTheDocument();
  });

  it('displays disk sizes', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('465.8 GB')).toBeInTheDocument();
    expect(screen.getByText('953.9 GB')).toBeInTheDocument();
  });

  it('shows shares tab', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    screen.getByText('Shares').click();
    await waitFor(() => {
      expect(screen.getByText('appdata')).toBeInTheDocument();
      expect(screen.getByText('media')).toBeInTheDocument();
    });
  });

  it('displays share names', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    screen.getByText('Shares').click();
    await waitFor(() => {
      expect(screen.getByText('appdata')).toBeInTheDocument();
      expect(screen.getByText('media')).toBeInTheDocument();
      expect(screen.getByText('domains')).toBeInTheDocument();
      expect(screen.getByText('isos')).toBeInTheDocument();
    });
  });

  it('shows disk count in tab', async () => {
    render(<StoragePage server={mockServerConfig} />);
    await screen.findByText('sda');
    expect(screen.getByText('Disks')).toBeInTheDocument();
  });
});