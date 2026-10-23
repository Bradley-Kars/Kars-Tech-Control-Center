import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LidarrPage } from './LidarrPage';
import { mockServerConfig, mockLidarrStatus, mockLidarrArtists, mockLidarrAlbums, mockLidarrWanted, mockLidarrDiskspace } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getLidarrStatus: vi.fn(),
  getLidarrArtists: vi.fn(),
  getLidarrAlbums: vi.fn(),
  getLidarrWanted: vi.fn(),
  getLidarrDiskspace: vi.fn(),
  lidarrRefreshArtist: vi.fn(),
  lidarrSearchMissing: vi.fn(),
}));

import { getLidarrStatus, getLidarrArtists, getLidarrAlbums, getLidarrWanted, getLidarrDiskspace } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getLidarrStatus).mockResolvedValue(mockLidarrStatus as any);
  vi.mocked(getLidarrArtists).mockResolvedValue(mockLidarrArtists as any);
  vi.mocked(getLidarrAlbums).mockResolvedValue(mockLidarrAlbums as any);
  vi.mocked(getLidarrWanted).mockResolvedValue(mockLidarrWanted as any);
  vi.mocked(getLidarrDiskspace).mockResolvedValue(mockLidarrDiskspace as any);
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
});
