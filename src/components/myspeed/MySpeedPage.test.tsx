import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MySpeedPage } from './MySpeedPage';
import { mockServerConfig, mockMySpeedSummary } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getMySpeedSummary: vi.fn(),
}));

import { getMySpeedSummary } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMySpeedSummary).mockResolvedValue(mockMySpeedSummary as any);
});

describe('MySpeedPage', () => {
  it('renders MySpeed title after loading', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('MySpeed')).toBeInTheDocument();
    });
  });

  it('displays total tests count in header', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('MySpeed')).toBeInTheDocument();
    });
    expect(screen.getAllByText('935').length).toBeGreaterThanOrEqual(1);
  });

  it('displays avg download speed', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Avg Download')).toBeInTheDocument();
    });
    expect(screen.getByText('201.20 Mbps')).toBeInTheDocument();
  });

  it('displays avg upload speed', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Avg Upload')).toBeInTheDocument();
    });
    expect(screen.getByText('95.80 Mbps')).toBeInTheDocument();
  });

  it('displays avg ping', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Avg Ping')).toBeInTheDocument();
    });
    expect(screen.getByText('12.3 ms')).toBeInTheDocument();
  });

  it('shows latest test details', async () => {
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Latest Test')).toBeInTheDocument();
    });
    expect(screen.getByText('215.30 Mbps')).toBeInTheDocument();
    expect(screen.getByText('98.20 Mbps')).toBeInTheDocument();
  });

  it('shows no-data message when summary is null', async () => {
    vi.mocked(getMySpeedSummary).mockResolvedValue(null as any);
    render(<MySpeedPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText(/No speed test data found/)).toBeInTheDocument();
    });
  });
});
