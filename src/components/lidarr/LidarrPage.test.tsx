import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LidarrPage } from './LidarrPage';
import {
  mockServerConfig,
  mockArrStatus,
  mockArrArtists,
  mockArrAlbums,
  mockArrWanted,
  mockArrDiskspace,
} from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getArrStatus: vi.fn(),
  getArrArtists: vi.fn(),
  getArrAlbums: vi.fn(),
  getArrWanted: vi.fn(),
  getArrDiskspace: vi.fn(),
  arrRefreshSeries: vi.fn(),
  arrSearchMissing: vi.fn(),
}));

import {
  getArrStatus,
  getArrArtists,
  getArrAlbums,
  getArrWanted,
  getArrDiskspace,
  arrRefreshSeries,
  arrSearchMissing,
} from '../../lib/fleet-api';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getArrStatus).mockResolvedValue(mockArrStatus as any);
  vi.mocked(getArrArtists).mockResolvedValue(mockArrArtists as any);
  vi.mocked(getArrAlbums).mockResolvedValue(mockArrAlbums as any);
  vi.mocked(getArrWanted).mockResolvedValue(mockArrWanted as any);
  vi.mocked(getArrDiskspace).mockResolvedValue(mockArrDiskspace as any);
  vi.mocked(arrRefreshSeries).mockResolvedValue(undefined);
  vi.mocked(arrSearchMissing).mockResolvedValue(undefined);
});

describe('LidarrPage', () => {
  it('renders Lidarr title after loading', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('displays version info', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('3.1.0.4875')).toBeInTheDocument();
    });
    expect(screen.getByText('Branch: develop')).toBeInTheDocument();
  });

  it('displays instance name', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('linux 6.18.38-Unraid')).toBeInTheDocument();
    });
  });

  it('shows artist and album counts', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Artists')).toBeInTheDocument();
    });
    expect(screen.getByText('Albums')).toBeInTheDocument();
  });

  it('shows tab buttons', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByRole('button', { name: 'overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'artists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'albums' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'wanted' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'diskspace' })).toBeInTheDocument();
  });

  it('navigates to artists tab', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'artists' }));
    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });
    expect(screen.getByText('Led Zeppelin')).toBeInTheDocument();
    expect(screen.getByText('The Beatles')).toBeInTheDocument();
  });

  it('navigates to albums tab', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'albums' }));
    await waitFor(() => {
      expect(screen.getByText('The Dark Side of the Moon')).toBeInTheDocument();
    });
    expect(screen.getByText('Led Zeppelin IV')).toBeInTheDocument();
    expect(screen.getByText('Abbey Road')).toBeInTheDocument();
  });

  it('navigates to wanted tab', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'wanted' }));
    await waitFor(() => {
      expect(screen.getByText('New Album 2026')).toBeInTheDocument();
    });
    expect(screen.getByText('Showing 2 of 2 missing albums')).toBeInTheDocument();
  });

  it('navigates to diskspace tab', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getAllByText('Lidarr').length).toBeGreaterThanOrEqual(1);
    });
    fireEvent.click(screen.getByRole('button', { name: 'diskspace' }));
    await waitFor(() => {
      expect(screen.getByText('/mnt/user/media/music')).toBeInTheDocument();
    });
  });

  it('refreshes an artist via arrRefreshSeries', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'artists' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'artists' }));
    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Refresh')[0]);
    await waitFor(() => {
      expect(arrRefreshSeries).toHaveBeenCalledWith('test-server-1', 'lidarr', 1);
    });
  });

  it('searches missing albums via arrSearchMissing', async () => {
    render(<LidarrPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'artists' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'artists' }));
    await waitFor(() => {
      expect(screen.getByText('Pink Floyd')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByText('Search')[0]);
    await waitFor(() => {
      expect(arrSearchMissing).toHaveBeenCalledWith('test-server-1', 'lidarr', 1);
    });
  });
});
