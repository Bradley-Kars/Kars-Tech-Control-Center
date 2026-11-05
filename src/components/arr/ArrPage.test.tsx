import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ArrPage } from './ArrPage';
import {
  mockServerConfig,
  mockArrStatus,
  mockArrHealth,
  mockArrQueue,
  mockArrWanted,
} from '../../test/mock-data';
import type { ServerConfig } from '../../lib/types';
import {
  getArrStatus,
  getArrHealth,
  getArrQueue,
  getArrWanted,
} from '../../lib/fleet-api';

vi.mock('../../lib/fleet-api', () => ({
  getArrStatus: vi.fn(),
  getArrHealth: vi.fn(),
  getArrQueue: vi.fn(),
  getArrWanted: vi.fn(),
}));

const mGetArrStatus = vi.mocked(getArrStatus);
const mGetArrHealth = vi.mocked(getArrHealth);
const mGetArrQueue = vi.mocked(getArrQueue);
const mGetArrWanted = vi.mocked(getArrWanted);

const APPS: Array<'lidarr' | 'sonarr' | 'radarr'> = ['lidarr', 'sonarr', 'radarr'];

const openTab = (app: (typeof APPS)[number]) => {
  fireEvent.click(screen.getByRole('button', { name: app.charAt(0).toUpperCase() + app.slice(1) }));
};

const configuredServer: ServerConfig = {
  ...mockServerConfig,
  service_keys: {
    ...mockServerConfig.service_keys,
    sonarr_api_key: 'test-sonarr-key',
    radarr_api_key: 'test-radarr-key',
  },
};

const unconfiguredServer: ServerConfig = {
  ...mockServerConfig,
  service_keys: {
    nextcloud_user: '<user>',
    nextcloud_pass: 'test-nc-pass',
    homeassistant_token: 'test-ha-token',
    adguard_user: '<user>',
    adguard_pass: 'test-adguard-pass',
    adguard_url: 'https://adguard.<tailnet>.ts.net:8443',
  },
};

const resolveAll = () => {
  mGetArrStatus.mockResolvedValue(mockArrStatus as any);
  mGetArrHealth.mockResolvedValue(mockArrHealth as any);
  mGetArrQueue.mockResolvedValue(mockArrQueue as any);
  mGetArrWanted.mockResolvedValue(mockArrWanted as any);
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveAll();
});

describe('ArrPage', () => {
  it('renders the Arr title and three tab buttons', () => {
    render(<ArrPage server={configuredServer} />);
    expect(screen.getByRole('heading', { name: 'Arr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lidarr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sonarr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Radarr' })).toBeInTheDocument();
  });

  it('populated: default Lidarr tab shows status, health, queue and wanted', async () => {
    render(<ArrPage server={configuredServer} />);
    await waitFor(() => {
      expect(screen.getByText(/3\.1\.0\.4875/)).toBeInTheDocument();
    });
    expect(screen.getByText('No issues')).toBeInTheDocument();
    expect(screen.queryByTestId('arr-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('arr-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('arr-not-configured')).not.toBeInTheDocument();
  });

  it.each(APPS)('%s loading: spinner shown while data is in flight', async (app) => {
    const resolvers: ((value: any) => void)[] = [];
    const values = [mockArrStatus, mockArrHealth, mockArrQueue, mockArrWanted];
    [mGetArrStatus, mGetArrHealth, mGetArrQueue, mGetArrWanted].forEach((m) => {
      let resolve!: (value: any) => void;
      const p = new Promise<any>((res) => {
        resolve = res;
      });
      resolvers.push(resolve);
      m.mockResolvedValue(p as any);
    });

    render(<ArrPage server={configuredServer} />);
    openTab(app);
    expect(screen.getByTestId('arr-loading')).toBeInTheDocument();

    resolvers.forEach((r, i) => r(values[i]));
    await waitFor(() => expect(screen.queryByTestId('arr-loading')).not.toBeInTheDocument());
  });

  it.each(APPS)('%s not configured: shows not-configured message and does not fetch', async (app) => {
    render(<ArrPage server={unconfiguredServer} />);
    openTab(app);
    await waitFor(() => {
      expect(screen.getByTestId('arr-not-configured')).toBeInTheDocument();
    });
    expect(mGetArrStatus).not.toHaveBeenCalled();
    expect(mGetArrHealth).not.toHaveBeenCalled();
    expect(mGetArrQueue).not.toHaveBeenCalled();
    expect(mGetArrWanted).not.toHaveBeenCalled();
  });

  it.each(APPS)('%s bad key: shows error when the status call returns 401', async (app) => {
    const err = new Error('invalid api key') as Error & { status: number };
    err.status = 401;
    mGetArrStatus.mockRejectedValue(err);

    render(<ArrPage server={configuredServer} />);
    openTab(app);
    await waitFor(() => {
      expect(screen.getByTestId('arr-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/Failed to load/)).toBeInTheDocument();
  });

  it.each(APPS)('%s error: shows error on transport failure', async (app) => {
    mGetArrStatus.mockRejectedValue(new Error('network down'));

    render(<ArrPage server={configuredServer} />);
    openTab(app);
    await waitFor(() => {
      expect(screen.getByTestId('arr-error')).toBeInTheDocument();
    });
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });

  it.each(APPS)('%s populated: shows status, health, queue and wanted', async (app) => {
    render(<ArrPage server={configuredServer} />);
    openTab(app);
    await waitFor(() => {
      expect(screen.getByText(/3\.1\.0\.4875/)).toBeInTheDocument();
    });
    expect(screen.getByText('No issues')).toBeInTheDocument();
    expect(screen.queryByTestId('arr-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('arr-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('arr-not-configured')).not.toBeInTheDocument();
  });

  it('queries the selected app: opening Sonarr fetches with app=sonarr', async () => {
    render(<ArrPage server={configuredServer} />);
    await waitFor(() => {
      expect(mGetArrStatus).toHaveBeenLastCalledWith('test-server-1', 'lidarr');
    });
    openTab('sonarr');
    await waitFor(() => {
      expect(mGetArrStatus).toHaveBeenLastCalledWith('test-server-1', 'sonarr');
    });
  });
});
