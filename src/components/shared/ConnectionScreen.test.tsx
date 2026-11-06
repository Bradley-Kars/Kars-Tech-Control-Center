import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ServerConfig } from '../../lib/types';

vi.mock('../../lib/fleet-api', () => ({
  testConnection: vi.fn(),
  getFleetReadonly: vi.fn().mockResolvedValue(false),
}));

import { testConnection, getFleetReadonly } from '../../lib/fleet-api';
import { ConnectionScreen } from './ConnectionScreen';

const mockTestConnection = vi.mocked(testConnection);
const mockGetFleetReadonly = vi.mocked(getFleetReadonly);
const onConnect = vi.fn();

beforeEach(() => {
  mockTestConnection.mockReset();
  onConnect.mockClear();
});

it('tests the connection over the fleet API and reports success', async () => {
  mockTestConnection.mockResolvedValue({
    success: true,
    message: 'Connected to home-server',
    hostname: 'home-server',
    os: '6.1.15-unraid',
    services: {
      graphql: false,
      nextcloud: false,
      lidarr: false,
      homeassistant: false,
      adguard: false,
      phone: false,
      kdeconnect: false,
      plex: false,
      scrutiny: false,
      uptimekuma: false,
      invoiceninja: false,
      aurral: false,
      your_spotify: false,
      dozzle: false,
    },
  });
  const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
  render(<ConnectionScreen onConnect={onConnect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
  await waitFor(() => expect(mockTestConnection).toHaveBeenCalledTimes(1));
  const sent: ServerConfig = mockTestConnection.mock.calls[0][0];
  expect(sent.hostname).toBe('<device>.<tailnet>.ts.net');
  expect((sent.auth as { type: string; password: string }).password).toBe('');
  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Connected: Connected to home-server'),
  );
  alertSpy.mockRestore();
  expect(onConnect).not.toHaveBeenCalled();
});

it('shows the error when the connection test fails', async () => {
  mockTestConnection.mockRejectedValue(
    new Error('SSH connection failed: connect ECONNREFUSED'),
  );
  render(<ConnectionScreen onConnect={onConnect} />);
  fireEvent.click(screen.getByRole('button', { name: 'Test Connection' }));
  await waitFor(() =>
    expect(screen.getByText(/SSH connection failed/)).toBeInTheDocument(),
  );
  expect(onConnect).not.toHaveBeenCalled();
});

it('readonly: shows the banner and disables the Connect button', async () => {
  mockGetFleetReadonly.mockResolvedValue(true);
  render(<ConnectionScreen onConnect={onConnect} />);
  await waitFor(() =>
    expect(screen.getByText(/Fleet is read-only on this instance/)).toBeInTheDocument(),
  );
  const connectBtn = screen.getByRole('button', { name: 'Connect' });
  expect(connectBtn).toBeDisabled();
  fireEvent.click(connectBtn);
  expect(onConnect).not.toHaveBeenCalled();
});

it('submits the built config to onConnect when Connect is clicked', async () => {
  render(<ConnectionScreen onConnect={onConnect} />);
  fireEvent.change(screen.getByLabelText(/SSH Password/), {
    target: { value: 'not-a-real-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
  await waitFor(() => expect(onConnect).toHaveBeenCalledTimes(1));
  const config: ServerConfig = onConnect.mock.calls[0][0];
  expect(config.id).toMatch(/^server-/);
  expect(config.hostname).toBe('<device>.<tailnet>.ts.net');
  expect((config.auth as { type: string; password: string }).password).toBe(
    'not-a-real-password',
  );
});
