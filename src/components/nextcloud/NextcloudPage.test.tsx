import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { NextcloudPage } from './NextcloudPage';
import { mockServerConfig, mockNextcloudInfo, mockNextcloudStorage, mockNextcloudUsers, mockNextcloudActivity } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getNextcloudInfo: vi.fn(),
  getNextcloudStatus: vi.fn(),
  getNextcloudStorage: vi.fn(),
  getNextcloudUsers: vi.fn(),
  getNextcloudActivity: vi.fn(),
}));

import { getNextcloudInfo, getNextcloudStatus, getNextcloudStorage, getNextcloudUsers, getNextcloudActivity } from '../../lib/tauri-commands';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getNextcloudInfo).mockResolvedValue(mockNextcloudInfo as any);
  vi.mocked(getNextcloudStatus).mockResolvedValue(mockNextcloudInfo as any);
  vi.mocked(getNextcloudStorage).mockResolvedValue(mockNextcloudStorage as any);
  vi.mocked(getNextcloudUsers).mockResolvedValue(mockNextcloudUsers as any);
  vi.mocked(getNextcloudActivity).mockResolvedValue(mockNextcloudActivity as any);
});

describe('NextcloudPage', () => {
  it('renders Nextcloud title after loading', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
  });

  it('displays version info', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
    expect(screen.getByText('34.0.3')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('displays online status', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('shows storage stats in overview', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('60,509')).toBeInTheDocument();
  });

  it('navigates to storage tab', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
    const storageBtn = screen.getByRole('button', { name: 'storage' });
    fireEvent.click(storageBtn);
    await waitFor(() => {
      expect(screen.getByText('Local')).toBeInTheDocument();
      expect(screen.getByText('Home')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  it('navigates to users tab', async () => {
    render(<NextcloudPage server={mockServerConfig} />);
    await waitFor(() => {
      expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    });
    const usersBtn = screen.getByRole('button', { name: 'users' });
    fireEvent.click(usersBtn);
    await waitFor(() => {
      expect(screen.getByText('slayerbrk')).toBeInTheDocument();
    });
  });

});