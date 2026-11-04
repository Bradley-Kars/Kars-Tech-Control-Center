import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NextcloudPage } from './NextcloudPage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getNextcloudInfo: vi.fn(),
  getNextcloudStatus: vi.fn(),
  getNextcloudStorage: vi.fn(),
  getNextcloudUsers: vi.fn(),
  getNextcloudActivity: vi.fn(),
}));

import { getNextcloudInfo, getNextcloudStatus, getNextcloudStorage, getNextcloudUsers, getNextcloudActivity } from '../../lib/fleet-api';

const mockGetNextcloudInfo = vi.mocked(getNextcloudInfo);
const mockGetNextcloudStatus = vi.mocked(getNextcloudStatus);
const mockGetNextcloudStorage = vi.mocked(getNextcloudStorage);
const mockGetNextcloudUsers = vi.mocked(getNextcloudUsers);
const mockGetNextcloudActivity = vi.mocked(getNextcloudActivity);

const renderPage = () => {
  mockGetNextcloudInfo.mockResolvedValue({ version: '27.0.0', versionstring: '27.0.0.1', edition: 'standard' });
  mockGetNextcloudStatus.mockResolvedValue({ installed: true, maintenance: false, needs_db_upgrade: false, version: '27.0.0', versionstring: '27.0.0.1', edition: 'standard', productname: 'Nextcloud', extended_support: false });
  mockGetNextcloudStorage.mockResolvedValue({ num_users: 5, num_files: 1000, num_storages: 3, num_storages_local: 2, num_storages_home: 1, num_storages_other: 0 });
  mockGetNextcloudUsers.mockResolvedValue([{ id: 'user1', display_name: 'Alice', enabled: true, groups: ['admin'] }]);
  mockGetNextcloudActivity.mockResolvedValue({ activities: [] });
  return render(
    <MemoryRouter>
      <NextcloudPage server={mockServerConfig} />
    </MemoryRouter>
  );
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NextcloudPage state matrix', () => {
  it('L loading: shows spinner while data loads', async () => {
    mockGetNextcloudInfo.mockResolvedValue(new Promise(() => {}));
    mockGetNextcloudStatus.mockResolvedValue(new Promise(() => {}));
    mockGetNextcloudStorage.mockResolvedValue(new Promise(() => {}));
    mockGetNextcloudUsers.mockResolvedValue(new Promise(() => {}));
    mockGetNextcloudActivity.mockResolvedValue(new Promise(() => {}));

    render(<NextcloudPage server={mockServerConfig} />);

    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
  });

  it('D populated: shows Nextcloud info and status', async () => {
    render(<NextcloudPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('27.0.0')).toBeInTheDocument();
    expect(screen.getByText('standard')).toBeInTheDocument();
  });

  it('E empty: shows empty state when no data', async () => {
    mockGetNextcloudInfo.mockResolvedValue(null as any);
    mockGetNextcloudStatus.mockResolvedValue(null as any);
    mockGetNextcloudStorage.mockResolvedValue(null as any);
    mockGetNextcloudUsers.mockResolvedValue([] as any);
    mockGetNextcloudActivity.mockResolvedValue({ activities: [] } as any);

    render(<NextcloudPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
  });

  it('R error: shows error banner when fetch fails', async () => {
    mockGetNextcloudInfo.mockRejectedValue(new Error('daemon unreachable'));
    mockGetNextcloudStatus.mockResolvedValue(null as any);
    mockGetNextcloudStorage.mockResolvedValue(null as any);
    mockGetNextcloudUsers.mockResolvedValue([] as any);
    mockGetNextcloudActivity.mockResolvedValue({ activities: [] } as any);

    render(<NextcloudPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  });

  it('I interaction: tab switching works', async () => {
    render(<NextcloudPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(screen.getByText('Overview')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /users/i }));

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText('Users')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('M modal: no dialog', async () => {
    render(<NextcloudPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText('Nextcloud')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
