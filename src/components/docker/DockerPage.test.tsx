import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DockerPage } from './DockerPage';
import { mockServerConfig, mockDockerContainers } from '../../test/mock-data';

vi.mock('../../lib/tauri-commands', () => ({
  getDockerContainers: vi.fn(),
  dockerStart: vi.fn(),
  dockerStop: vi.fn(),
  dockerRestart: vi.fn(),
  dockerLogs: vi.fn().mockResolvedValue('mock logs'),
  dockerRemove: vi.fn(),
}));

import { getDockerContainers } from '../../lib/tauri-commands';
const mockGetDockerContainers = vi.mocked(getDockerContainers);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDockerContainers.mockResolvedValue(mockDockerContainers as any);
});

/**
 * Wait for the container fetch to land.
 *
 * "Docker Containers" is a static heading that renders synchronously, so
 * awaiting it does not guarantee the data arrived — asserting straight after
 * raced the fetch and failed intermittently under load. Wait on a
 * data-dependent node instead.
 */
async function waitForContainers() {
  await screen.findByText('nextcloud');
}

describe('DockerPage', () => {
  const defaultProps = {
    server: mockServerConfig,
    setPage: vi.fn(),
  };

  it('renders containers after loading', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    expect(screen.getByText('Docker Containers')).toBeInTheDocument();
    expect(screen.getByText('7 running · 1 stopped · 8 total')).toBeInTheDocument();
  });

  it('displays container counts as summary string', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    expect(screen.getByText('7 running · 1 stopped · 8 total')).toBeInTheDocument();
  });

  it('displays container names', async () => {
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

  it('shows service icons for known services', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    expect(screen.getByText('☁')).toBeInTheDocument();
    expect(screen.getByText('♪')).toBeInTheDocument();
    expect(screen.getByText('🏠')).toBeInTheDocument();
    expect(screen.getByText('🛡')).toBeInTheDocument();
  });

  it('shows stop buttons for running containers', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    const stopBtns = screen.getAllByText('Stop');
    expect(stopBtns.length).toBe(7);
  });

  it('shows start button for stopped containers', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    const startBtns = screen.getAllByText('Start');
    expect(startBtns.length).toBe(1);
  });

  it('calls setPage with nextcloud when cloud icon clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);
    await waitForContainers();
    const cloudIcon = screen.getByText('☁');
    fireEvent.click(cloudIcon.closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('nextcloud');
  });

  it('calls setPage with lidarr when music icon clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);
    await waitForContainers();
    const musicIcon = screen.getByText('♪');
    fireEvent.click(musicIcon.closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('lidarr');
  });

  it('calls setPage with homeassistant when home icon clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);
    await waitForContainers();
    const homeIcon = screen.getByText('🏠');
    fireEvent.click(homeIcon.closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('homeassistant');
  });

  it('calls setPage with adguard when shield icon clicked', async () => {
    const setPage = vi.fn();
    render(<DockerPage {...defaultProps} setPage={setPage} />);
    await waitForContainers();
    const shieldIcon = screen.getByText('🛡');
    fireEvent.click(shieldIcon.closest('[title]')!);
    expect(setPage).toHaveBeenCalledWith('adguard');
  });

  it('shows container image names', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    expect(screen.getByText('linuxserver/nextcloud:latest')).toBeInTheDocument();
    expect(screen.getByText('linuxserver/lidarr:latest')).toBeInTheDocument();
  });

  it('shows stopped section label', async () => {
    render(<DockerPage {...defaultProps} />);
    await waitForContainers();
    expect(screen.getByText('Stopped')).toBeInTheDocument();
  });
});