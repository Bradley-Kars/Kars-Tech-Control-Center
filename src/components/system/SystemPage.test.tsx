import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SystemPage } from './SystemPage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getProcesses: vi.fn(),
  getSyslog: vi.fn(),
  getUserScripts: vi.fn(),
  getPlugins: vi.fn(),
  runUserScript: vi.fn(),
}));

import { getProcesses, getSyslog, getUserScripts, getPlugins } from '../../lib/fleet-api';

const mockGetProcesses = vi.mocked(getProcesses);
const mockGetSyslog = vi.mocked(getSyslog);
const mockGetUserScripts = vi.mocked(getUserScripts);
const mockGetPlugins = vi.mocked(getPlugins);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProcesses.mockResolvedValue('PID USER COMMAND\n1 root init\n');
  mockGetSyslog.mockResolvedValue('Jan 1 00:00:00 kernel boot');
  mockGetUserScripts.mockResolvedValue(['backup.sh', 'monitor.sh']);
  mockGetPlugins.mockResolvedValue(['docker', 'nvidia']);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemPage state matrix', () => {
  it('L loading: shows skeleton while data loads', async () => {
    mockGetProcesses.mockResolvedValue(new Promise(() => {}));
    mockGetSyslog.mockResolvedValue(new Promise(() => {}));
    mockGetUserScripts.mockResolvedValue(new Promise(() => {}));
    mockGetPlugins.mockResolvedValue(new Promise(() => {}));

    render(<SystemPage server={mockServerConfig} />);

    expect(screen.getByTestId('system-processes-loading')).toBeInTheDocument();
  });

  it('D populated: renders system page', async () => {
    render(<SystemPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Processes')).toBeInTheDocument();
  });

  it('E empty: renders empty state', async () => {
    mockGetProcesses.mockResolvedValue('' as any);
    mockGetSyslog.mockResolvedValue('' as any);
    mockGetUserScripts.mockResolvedValue([] as any);
    mockGetPlugins.mockResolvedValue([] as any);

    render(<SystemPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText('Processes')).toBeInTheDocument();
    expect(screen.getByText('Syslog')).toBeInTheDocument();
    expect(screen.getByText('User Scripts')).toBeInTheDocument();
    expect(screen.getByText('Plugins')).toBeInTheDocument();
  });

  it('R error: shows error banner', async () => {
    mockGetProcesses.mockRejectedValue(new Error('daemon unreachable'));
    mockGetSyslog.mockResolvedValue('' as any);
    mockGetUserScripts.mockResolvedValue([] as any);
    mockGetPlugins.mockResolvedValue([] as any);

    render(<SystemPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  });

  it('M modal: no dialog', async () => {
    render(<SystemPage server={mockServerConfig} />);

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
