import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { DockerPage } from './DockerPage';
import { mockServerConfig, mockDockerContainers } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getDockerContainers: vi.fn(),
  dockerStart: vi.fn(),
  dockerStop: vi.fn(),
  dockerRestart: vi.fn(),
  dockerLogs: vi.fn().mockResolvedValue('mock logs'),
  dockerRemove: vi.fn(),
}));

import { getDockerContainers, dockerStart, dockerStop, dockerRestart, dockerLogs } from '../../lib/fleet-api';

const mockGetDockerContainers = vi.mocked(getDockerContainers);
const mockDockerStart = vi.mocked(dockerStart);
const mockDockerStop = vi.mocked(dockerStop);
const mockDockerRestart = vi.mocked(dockerRestart);
const mockDockerLogs = vi.mocked(dockerLogs);

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDockerContainers.mockResolvedValue(mockDockerContainers as any);
});

const defaultProps = {
  server: mockServerConfig,
  setPage: vi.fn(),
};

async function waitForContainers() {
  await screen.findByText('nextcloud');
}

describe('DockerPage (D/E/L/R/I/M state matrix)', () => {
  it('L loading: disables action buttons while a container action is in flight', async () => {
    const start = pending<string>();
    mockDockerStart.mockResolvedValue(start.promise as any);

    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    const startBtn = screen.getAllByText('Start')[0]; // radarr is stopped
    fireEvent.click(startBtn);

    expect(startBtn).toBeDisabled();
    expect(mockDockerStart).toHaveBeenCalledTimes(1);

    start.resolve('Started');
    await waitFor(() => expect(startBtn).not.toBeDisabled());
  });

  it('D populated: shows the container counts summary', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getByText('Docker Containers')).toBeInTheDocument();
    expect(screen.getByText('6 running · 1 stopped · 7 total')).toBeInTheDocument();
  });

  it('D populated: lists all container names', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getByText('nextcloud')).toBeInTheDocument();
    expect(screen.getByText('lidarr')).toBeInTheDocument();
    expect(screen.getByText('homeassistant')).toBeInTheDocument();
    expect(screen.getByText('adguard')).toBeInTheDocument();
    expect(screen.getByText('plex')).toBeInTheDocument();
    expect(screen.getByText('radarr')).toBeInTheDocument();
    expect(screen.getByText('sonarr')).toBeInTheDocument();
  });

  it('D populated: shows service icons for known services', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getByText('☁')).toBeInTheDocument();
    expect(screen.getAllByText('♪')).toHaveLength(3);
    expect(screen.getByText('🏠')).toBeInTheDocument();
    expect(screen.getByText('🛡')).toBeInTheDocument();
  });

  it('D populated: shows stop buttons for running containers and a start button for stopped ones', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getAllByText('Stop').length).toBe(6);
    expect(screen.getAllByText('Start').length).toBe(1);
  });

  it('D populated: shows container images', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getByText('linuxserver/nextcloud:latest')).toBeInTheDocument();
    expect(screen.getByText('linuxserver/lidarr:latest')).toBeInTheDocument();
  });

  it('D populated: shows the Stopped section label', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });

  it('D populated: filters containers by search text', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    fireEvent.change(screen.getByPlaceholderText('Search containers...'), {
      target: { value: 'nextcloud' },
    });
    expect(screen.getByText('nextcloud')).toBeInTheDocument();
    expect(screen.queryByText('lidarr')).not.toBeInTheDocument();
  });

  it('D populated: navigates to the nextcloud page when the cloud icon is clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);

    await waitForContainers();
    fireEvent.click(screen.getByText('☁').closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('nextcloud');
  });

  it('D populated: navigates to the lidarr page when the music icon is clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);

    await waitForContainers();
    fireEvent.click(screen.getAllByText('♪')[0].closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('arr');
  });

  it('E empty: shows zero counts and no container rows when there are no containers', async () => {
    mockGetDockerContainers.mockResolvedValue([] as any);

    render(<DockerPage {...defaultProps} />);

    await waitFor(() =>
      expect(screen.getByText('0 running · 0 stopped · 0 total')).toBeInTheDocument()
    );
    expect(screen.queryByText('nextcloud')).not.toBeInTheDocument();
    expect(screen.queryByText('Stopped')).not.toBeInTheDocument();
  });

  it('R error: shows the error banner when listing containers fails', async () => {
    mockGetDockerContainers.mockRejectedValue(new Error('daemon unreachable'));

    render(<DockerPage {...defaultProps} />);

    await waitFor(() => expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument());
  });

  it('I interaction: Start button calls dockerStart for a stopped container', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    fireEvent.click(screen.getAllByText('Start')[0]);

    await waitFor(() => expect(mockDockerStart).toHaveBeenCalledTimes(1));
    expect(mockDockerStart).toHaveBeenCalledWith(mockServerConfig.id, 'stu789vwx012');
  });

  it('I interaction: Stop button calls dockerStop for a running container', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    fireEvent.click(screen.getAllByText('Stop')[0]);

    await waitFor(() => expect(mockDockerStop).toHaveBeenCalledTimes(1));
    expect(mockDockerStop).toHaveBeenCalledWith(mockServerConfig.id, expect.any(String));
  });

  it('I interaction: Restart button calls dockerRestart for a running container', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    fireEvent.click(screen.getAllByText('Restart')[0]);

    await waitFor(() => expect(mockDockerRestart).toHaveBeenCalledTimes(1));
    expect(mockDockerRestart).toHaveBeenCalledWith(mockServerConfig.id, expect.any(String));
  });

  it('I interaction: clicking a container fetches its logs and shows the logs panel', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();
    fireEvent.click(screen.getByText('nextcloud'));

    await waitFor(() => expect(mockDockerLogs).toHaveBeenCalledTimes(1));
    expect(mockDockerLogs).toHaveBeenCalledWith(mockServerConfig.id, 'abc123def456', 100);
    await waitFor(() => expect(screen.getByText('mock logs')).toBeInTheDocument());
  });

  it('M modal: no dialog renders on DockerPage', async () => {
    render(<DockerPage {...defaultProps} />);

    await waitForContainers();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Close/ })).not.toBeInTheDocument();
  });
});
