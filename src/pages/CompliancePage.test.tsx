import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { CompliancePage } from './CompliancePage';
import type { ServerConfig } from '../lib/types';

const mocks = vi.hoisted(() => ({
  useServers: vi.fn(),
  shellFleet: vi.fn(),
}));

vi.mock('../hooks', () => ({
  useServers: mocks.useServers,
}));
vi.mock('../lib/fleet-api', () => ({
  meshcentralShellFleet: mocks.shellFleet,
}));

import { useServers } from '../hooks';
import { meshcentralShellFleet } from '../lib/fleet-api';

const mockUseServers = vi.mocked(useServers);
const mockShellFleet = vi.mocked(meshcentralShellFleet);

const servers: ServerConfig[] = [
  {
    id: 's1',
    name: 'Unraid Server',
    hostname: '<device>.<tailnet>.ts.net',
    port: 22,
    username: 'root',
    auth: { type: 'password', password: 'test-password' },
    device_type: 'unraid',
    meshcentral_status: 'enrolled',
  },
  {
    id: 's2',
    name: 'Senpai Laptop',
    hostname: 'laptop.<tailnet>.ts.net',
    port: 22,
    username: 'user',
    auth: { type: 'password', password: 'test-password' },
    device_type: 'laptop',
  },
  {
    id: 's3',
    name: 'Phone',
    hostname: 'phone.<tailnet>.ts.net',
    port: 22,
    username: 'user',
    auth: { type: 'password', password: 'test-password' },
    device_type: 'phone',
    meshcentral_status: 'enrolled',
  },
];

const shellResult = (device_id: string, stdout: string, success = true) =>
  ({ device_id, success, stdout, stderr: '' } as any);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseServers.mockReturnValue({ servers, loading: false, error: null } as any);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CompliancePage (COMP-001, COMP-002)', () => {
  it('populated state: renders shell + phone rows and the Check all devices button', async () => {
    mockShellFleet.mockResolvedValue([
      shellResult('s1', '2\n'),
      shellResult('s2', '0\n'),
    ]);
    render(<CompliancePage />);

    await waitFor(() => expect(screen.getByText('Patch Compliance')).toBeInTheDocument());
    expect(screen.getByText('Unraid Server')).toBeInTheDocument();
    expect(screen.getByText('Senpai Laptop')).toBeInTheDocument();
    // Phone row is read-only (OS-managed), no Check/Update actions
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('OS-managed (Play Store)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Check all devices/i })).toBeInTheDocument();
  });

  it('empty state: compliance nudge when there are no devices', () => {
    mockUseServers.mockReturnValue({ servers: [], loading: false, error: null } as any);
    render(<CompliancePage />);

    expect(screen.getByText('Patch Compliance')).toBeInTheDocument();
    expect(screen.getByText(/No devices to scan/)).toBeInTheDocument();
    expect(screen.queryByText('Unraid Server')).not.toBeInTheDocument();
  });

  it('empty state: shows "no devices to scan" message and hides table headers when zero devices', () => {
    mockUseServers.mockReturnValue({ servers: [], loading: false, error: null } as any);
    render(<CompliancePage />);

    expect(screen.getByText(/no devices to scan/i)).toBeInTheDocument();
    // Table headers must not render when there is no data
    expect(screen.queryByText('Device')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Last checked')).not.toBeInTheDocument();
    expect(screen.queryByText('Agent')).not.toBeInTheDocument();
    expect(screen.queryByText('Action')).not.toBeInTheDocument();
  });

  it('interaction: Check all devices fans out meshcentralShellFleet to every shell server, disabled while in flight', async () => {
    let resolveCheck: (value: any[]) => void = () => {};
    const deferred = new Promise<any[]>((res) => { resolveCheck = res; });
    mockShellFleet.mockReturnValue(deferred);
    render(<CompliancePage />);

    fireEvent.click(screen.getByRole('button', { name: /Check all devices/i }));
    const checking = screen.getByRole('button', { name: /Checking fleet/i });
    expect(checking).toBeDisabled();

    resolveCheck([shellResult('s1', '2\n'), shellResult('s2', '0\n')]);
    await waitFor(() => expect(mockShellFleet).toHaveBeenCalledWith(['s1', 's2'],
      expect.stringContaining('pacman -Qu'), 90));
    await waitFor(() => expect(screen.getByText('Compliant')).toBeInTheDocument()); // s2: 0 pending
    expect(screen.getByText('2 pending')).toBeInTheDocument(); // s1
    expect(screen.getByText(/2\/2 devices checked/)).toBeInTheDocument();
  });

  it('interaction: Update requires a confirm click, then calls meshcentralShellFleet with the update command', async () => {
    mockShellFleet.mockResolvedValue([shellResult('s1', '2\n'), shellResult('s2', '0\n')]);
    render(<CompliancePage />);

    // Per-row Check button triggers the fanout over every shell server
    fireEvent.click(screen.getAllByRole('button', { name: /^Check$/i })[0]);
    await waitFor(() => expect(mockShellFleet).toHaveBeenLastCalledWith(['s1', 's2'],
      expect.stringContaining('pacman -Qu'), 90));
    await waitFor(() => expect(screen.getByText('Compliant')).toBeInTheDocument()); // s2: 0 pending

    // Update on the first row: first click confirms, second click runs the update
    const updateBtn = screen.getAllByRole('button', { name: /^Update$/i })[0];
    fireEvent.click(updateBtn);
    expect(screen.getAllByRole('button', { name: /^Confirm\?$/i })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /^Confirm\?$/i }));
    await waitFor(() => expect(mockShellFleet).toHaveBeenLastCalledWith(['s1'],
      expect.stringContaining('pacman -Syu'), 600));
    await waitFor(() => expect(screen.getByText('updated')).toBeInTheDocument());
  });

  it('error state: check-all failure shows an error toast and does not crash', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const err = new Error('MeshCentral unreachable');
    mockShellFleet.mockRejectedValue(err);
    render(<CompliancePage />);

    fireEvent.click(screen.getByRole('button', { name: /Check all devices/i }));
    await waitFor(() => expect(dispatchSpy).toHaveBeenCalled());
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.detail).toMatchObject({ type: 'error', title: 'Update check failed' });
    // Page stays usable: heading still renders, no crash
    expect(screen.getByText('Patch Compliance')).toBeInTheDocument();
  });
});
