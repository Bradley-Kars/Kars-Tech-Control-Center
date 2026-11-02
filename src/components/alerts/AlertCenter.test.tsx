import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../lib/tauri-commands', () => ({
  alertList: vi.fn(),
  alertAcknowledge: vi.fn().mockResolvedValue({ id: '1', acknowledged: true }),
  alertAcknowledgeAll: vi.fn().mockResolvedValue(0),
  alertDelete: vi.fn().mockResolvedValue(undefined),
  alertEvaluateAutoAck: vi.fn().mockResolvedValue(0),
}));

import { AlertCenter } from './AlertCenter';
import { alertList } from '../../lib/tauri-commands';
const mockAlertList = vi.mocked(alertList);

describe('AlertCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loading state: shows skeletons when loading', () => {
    mockAlertList.mockImplementation(() => new Promise(() => {}));
    render(<AlertCenter />);
    // During loading, the Alert Center header is not shown
    expect(screen.queryByText('Alert Center')).not.toBeInTheDocument();
  });

  it('empty state: shows stats when no alerts', async () => {
    mockAlertList.mockResolvedValue([]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('Alert Center')).toBeInTheDocument());
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(4); // total, critical, warning, info
    expect(screen.getByText(/Unacknowledged/)).toBeInTheDocument();
  });

  it('populated state: shows alert items when alerts exist', async () => {
    mockAlertList.mockResolvedValue([
      {
        id: '1',
        title: 'High CPU on Unraid',
        severity: 'critical',
        source: 'meshcentral',
        acknowledged: false,
        created_at: '2026-01-15T10:30:00Z',
      },
    ]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2); // total count and critical count
  });
});
