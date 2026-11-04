import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SystemPage } from './SystemPage';
import { mockServerConfig } from '../../test/mock-data';

vi.mock('../../lib/fleet-api', () => ({
  getProcesses: vi.fn(),
  getSyslog: vi.fn(),
  getUserScripts: vi.fn(),
  getPlugins: vi.fn(),
  runUserScript: vi.fn(),
}));

import { getProcesses, getSyslog } from '../../lib/fleet-api';

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: (value: T) => resolve(value) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SystemPage loading state (SKELETON-001)', () => {
  it('renders a skeleton instead of plain "Loading..." text while processes load', async () => {
    const proc = pending<string>();
    vi.mocked(getProcesses).mockResolvedValue(proc.promise as any);

    render(<SystemPage server={mockServerConfig} />);

    // Default tab is 'processes': skeleton shown while the command is in flight,
    // never the plain "Loading..." text.
    expect(screen.getByTestId('system-processes-loading')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();

    proc.resolve('root 1234 0.5 1.2 /usr/bin/foo');

    await waitFor(() =>
      expect(screen.getByText('root 1234 0.5 1.2 /usr/bin/foo')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('system-processes-loading')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading...')).toBeNull();
  });

  it('renders a skeleton for the syslog tab while it loads', async () => {
    vi.mocked(getProcesses).mockResolvedValue('cached processes' as any);
    const syslog = pending<string>();
    vi.mocked(getSyslog).mockResolvedValue(syslog.promise as any);

    render(<SystemPage server={mockServerConfig} />);

    await waitFor(() =>
      expect(screen.getByText('cached processes')).toBeInTheDocument()
    );

    screen.getByRole('button', { name: 'Syslog' }).click();

    // New tab switch starts a fresh load: skeleton shown while in flight.
    await waitFor(() =>
      expect(screen.getByTestId('system-syslog-loading')).toBeInTheDocument()
    );
    expect(screen.queryByText('Loading...')).toBeNull();

    syslog.resolve('Aug 26 00:00:00 server kernel: test message');

    await waitFor(() =>
      expect(
        screen.getByText('Aug 26 00:00:00 server kernel: test message')
      ).toBeInTheDocument()
    );
    expect(screen.queryByTestId('system-syslog-loading')).not.toBeInTheDocument();
  });
});
