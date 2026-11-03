import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MeshCentralPage } from './MeshCentralPage';
import type { MeshDevice, SyncResult, EnrollmentInfo, BatchResult } from '../lib/types';

const mocks = vi.hoisted(() => ({
  listDevices: vi.fn(),
  getEnrollmentInfo: vi.fn(),
  syncFleet: vi.fn(),
  executeBatch: vi.fn(),
}));

vi.mock('../lib/tauri-commands', () => ({
  meshcentralListDevices: mocks.listDevices,
  meshcentralGetEnrollmentInfo: mocks.getEnrollmentInfo,
  meshcentralSyncFleet: mocks.syncFleet,
  meshcentralExecuteBatch: mocks.executeBatch,
  meshcentralGetTerminalUrl: vi.fn(),
  meshcentralGetFileManagerUrl: vi.fn(),
}));

import {
  meshcentralListDevices,
  meshcentralGetEnrollmentInfo,
  meshcentralSyncFleet,
  meshcentralExecuteBatch,
} from '../lib/tauri-commands';

const mockListDevices = vi.mocked(meshcentralListDevices);
const mockGetEnrollmentInfo = vi.mocked(meshcentralGetEnrollmentInfo);
const mockSyncFleet = vi.mocked(meshcentralSyncFleet);
const mockExecuteBatch = vi.mocked(meshcentralExecuteBatch);

const devices: MeshDevice[] = [
  { id: 'mc-1', name: 'unraid-main', group: 'Home', conn: 2, pwr: 1, platform: 'Linux', ip: '10.0.0.50' },
  { id: 'mc-2', name: 'desktop-pc', group: 'Home', conn: 1, pwr: 1, platform: 'Windows', ip: '10.0.0.51' },
  { id: 'mc-3', name: 'offline-node', group: 'Home', conn: 0, pwr: 0, platform: 'Linux', ip: '10.0.0.99' },
];

const enrollmentInfo: EnrollmentInfo = {
  agent_url: 'https://mesh.<tailnet>.ts.net/agent',
  settings_url: 'https://mesh.<tailnet>.ts.net/settings',
  group_id: 'Home',
  install_command_linux: 'curl -fsSL https://mesh.<tailnet>.ts.net/agent-install.sh | sh',
  install_command_windows: 'iwr -useb https://mesh.<tailnet>.ts.net/agent-install.ps1 | iex',
};

const syncResult: SyncResult = {
  devices_found: 3,
  devices_matched: 2,
  devices_new: 1,
  devices_updated: 0,
  errors: [],
};

const batchResults: BatchResult[] = [
  { device_id: 'mc-1', success: true, output: 'up 2 days\n', error: undefined },
  { device_id: 'mc-2', success: false, output: '', error: 'connection refused' },
];

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    writable: true,
    value: { writeText: vi.fn() },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MeshCentralPage (MESH-001, MESH-002, MESH-003)', () => {
  it('loading state: shows skeletons while the device list is in flight', () => {
    mockListDevices.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<MeshCentralPage />);

    expect(screen.getByText('MeshCentral Fleet')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    expect(screen.queryByText('No devices found in MeshCentral')).not.toBeInTheDocument();
  });

  it('empty state: shows zero stats and the empty card when there are no devices', async () => {
    mockListDevices.mockResolvedValue([]);
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('No devices found in MeshCentral')).toBeInTheDocument());
    expect(screen.getByText('0 devices · 0 online · 0 offline')).toBeInTheDocument();
  });

  it('populated state: renders device cards with Connected/Online/Offline badges and fleet stats', async () => {
    mockListDevices.mockResolvedValue(devices);
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('unraid-main')).toBeInTheDocument());
    expect(screen.getByText('3 devices · 2 online · 1 offline')).toBeInTheDocument();
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Online').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Offline').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('🐧').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('🪟').length).toBeGreaterThanOrEqual(1);
  });

  it('error state: shows an error toast instead of crash-rendering (MESH-001 regression)', async () => {
    mockListDevices.mockRejectedValue(new Error('invoke undefined'));
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('Failed to load MeshCentral devices')).toBeInTheDocument());
    expect(screen.getByRole('alert')).toBeInTheDocument();
    // After the error the page still renders its empty shell rather than crashing
    expect(screen.getByText('No devices found in MeshCentral')).toBeInTheDocument();
  });

  it('sync: calls meshcentralSyncFleet and shows the sync result banner', async () => {
    mockListDevices.mockResolvedValue(devices);
    mockSyncFleet.mockResolvedValue(syncResult);
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('unraid-main')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /sync/i }));

    expect(mockSyncFleet).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText('Last Sync Result')).toBeInTheDocument());
    expect(screen.getByText('Matched: 2, New: 1, Updated: 0')).toBeInTheDocument();
  });

  it('enroll: opens the enrollment modal with install commands and copies the command to clipboard', async () => {
    mockListDevices.mockResolvedValue(devices);
    mockGetEnrollmentInfo.mockResolvedValue(enrollmentInfo);
    const writeText = vi.mocked(navigator.clipboard.writeText);
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('unraid-main')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^Linux \(Bazzite\/Fedora\)$/i }));

    await waitFor(() => expect(mockGetEnrollmentInfo).toHaveBeenCalledWith('', 'linux'));
    await waitFor(() => expect(screen.getByText('Enroll linux Device')).toBeInTheDocument());
    expect(screen.getByText(enrollmentInfo.install_command_linux)).toBeInTheDocument();
    expect(screen.getByText(enrollmentInfo.install_command_windows)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /copy/i })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(enrollmentInfo.install_command_linux));
  });

  it('batch: selects devices, runs a command, and shows OK/FAILED results', async () => {
    mockListDevices.mockResolvedValue(devices);
    mockExecuteBatch.mockResolvedValue(batchResults);
    render(<MeshCentralPage />);

    await waitFor(() => expect(screen.getByText('unraid-main')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /batch commands/i }));
    await waitFor(() => expect(screen.getByText('Batch Command Execution')).toBeInTheDocument());

    const executeBtn = screen.getByRole('button', { name: /execute on/i });
    expect(executeBtn).toBeDisabled();

    // The modal overlays the page (which also has per-device checkboxes),
    // so scope selection to the dialog itself.
    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2); // only online devices are selectable
    expect(checkboxes[1]).not.toBeDisabled();

    fireEvent.click(checkboxes[0]); // select unraid-main
    fireEvent.click(screen.getByRole('button', { name: /select all online/i }));

    const commandInput = screen.getByPlaceholderText(/Command 1/);
    fireEvent.input(commandInput, { target: { value: 'uptime' } });

    fireEvent.click(screen.getByRole('button', { name: /execute on/i }));
    await waitFor(() =>
      expect(mockExecuteBatch).toHaveBeenCalledWith('', ['mc-1', 'mc-2'], [{ command: 'uptime', args: [] }]),
    );

    await waitFor(() => expect(screen.getByText('OK')).toBeInTheDocument());
    expect(screen.getByText('FAILED')).toBeInTheDocument();
    expect(screen.getByText('Device: mc-1')).toBeInTheDocument();
    expect(screen.getByText('Device: mc-2')).toBeInTheDocument();
  });
});
