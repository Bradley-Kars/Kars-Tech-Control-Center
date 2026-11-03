import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../lib/tauri-commands', () => ({
  alertList: vi.fn(),
  alertAcknowledge: vi.fn().mockResolvedValue({ id: '1', acknowledged: true }),
  alertAcknowledgeAll: vi.fn().mockResolvedValue(0),
  alertDelete: vi.fn().mockResolvedValue(undefined),
  alertEvaluateAutoAck: vi.fn().mockResolvedValue(0),
}));

import { AlertCenter } from './AlertCenter';
import {
  alertList,
  alertAcknowledge,
  alertAcknowledgeAll,
  alertDelete,
  alertEvaluateAutoAck,
} from '../../lib/tauri-commands';
const mockAlertList = vi.mocked(alertList);
const mockAlertAcknowledge = vi.mocked(alertAcknowledge);
const mockAlertAcknowledgeAll = vi.mocked(alertAcknowledgeAll);
const mockAlertDelete = vi.mocked(alertDelete);
const mockAlertEvaluateAutoAck = vi.mocked(alertEvaluateAutoAck);

const baseAlert = {
  id: 1,
  severity: 'critical',
  title: 'High CPU on Unraid',
  message: 'CPU usage above 90%',
  source: 'meshcentral',
  acknowledged: false,
  created_at: '2026-01-15T10:30:00Z',
  updated_at: '2026-01-15T10:30:00Z',
} as const;

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
        id: '1' as any,
        title: 'High CPU on Unraid',
        message: 'CPU usage above 90%',
        severity: 'critical',
        source: 'meshcentral',
        acknowledged: false,
        created_at: '2026-01-15T10:30:00Z',
        updated_at: '2026-01-15T10:30:00Z',
      },
    ]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    const ones = screen.getAllByText('1');
    expect(ones.length).toBeGreaterThanOrEqual(2); // total count and critical count
  });
});

describe('AlertCenter state matrix — R/I/M', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAlertList.mockResolvedValue([]);
    mockAlertAcknowledge.mockResolvedValue({ ...baseAlert, acknowledged: true });
    mockAlertAcknowledgeAll.mockResolvedValue(0);
    mockAlertDelete.mockResolvedValue(undefined);
    mockAlertEvaluateAutoAck.mockResolvedValue(0);
  });

  // Helper: toasts render into a portal on document.body
  const expectToast = (re: RegExp) => {
    const el = document.body.querySelector('[role="alert"]');
    expect(el).not.toBeNull();
    expect(el!.textContent).toMatch(re);
  };

  // R — error: a load failure stops loading, renders the shell, and surfaces an error toast
  it('error state: load failure shows an error toast and no alert list', async () => {
    mockAlertList.mockRejectedValue(new Error('boom'));
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('Alert Center')).toBeInTheDocument());
    await waitFor(() => expectToast(/Failed to load alerts/));
    expect(screen.queryByText('High CPU on Unraid')).not.toBeInTheDocument();
  });

  // I — acknowledge a single alert
  it('acknowledge marks an alert acknowledged and toasts success', async () => {
    mockAlertList.mockResolvedValue([baseAlert]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    await waitFor(() => expect(mockAlertAcknowledge).toHaveBeenCalledWith(1, 'user'));
    await waitFor(() => expectToast(/marked as acknowledged/));
  });

  // I — acknowledge all
  it('acknowledge all calls alertAcknowledgeAll and toasts the count', async () => {
    mockAlertList.mockResolvedValue([baseAlert, { ...baseAlert, id: 2, title: 'Disk full' }]);
    mockAlertAcknowledgeAll.mockResolvedValue(2);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('Disk full')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Acknowledge All/i }));
    await waitFor(() => expect(mockAlertAcknowledgeAll).toHaveBeenCalledWith(undefined));
    await waitFor(() => expectToast(/2 alert\(s\) acknowledged/));
  });

  // M — delete confirmation: confirm deletes the alert
  it('delete confirm: confirming the dialog deletes the alert', async () => {
    mockAlertList.mockResolvedValue([baseAlert]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete alert/i }));
    expect(screen.getByText('Delete Alert?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    await waitFor(() => expect(mockAlertDelete).toHaveBeenCalledWith(1));
    await waitFor(() => expect(screen.queryByText('High CPU on Unraid')).not.toBeInTheDocument());
    await waitFor(() => expectToast(/Alert removed/));
  });

  // M — delete confirmation: cancel keeps the alert and closes the dialog
  it('delete confirm: canceling dismisses the dialog and keeps the alert', async () => {
    mockAlertList.mockResolvedValue([baseAlert]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Delete alert/i }));
    expect(screen.getByText('Delete Alert?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    await waitFor(() => expect(screen.queryByText('Delete Alert?')).not.toBeInTheDocument());
    expect(mockAlertDelete).not.toHaveBeenCalled();
    expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument();
  });

  // I — auto-acknowledgment runs rules, reloads, toasts count
  it('auto-ack runs rules, reloads alerts, and toasts the count', async () => {
    mockAlertList.mockResolvedValue([baseAlert]);
    mockAlertEvaluateAutoAck.mockResolvedValue(3);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('High CPU on Unraid')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Auto-Ack/i }));
    await waitFor(() => expect(mockAlertEvaluateAutoAck).toHaveBeenCalled());
    await waitFor(() => expect(mockAlertList).toHaveBeenCalled()); // reload after auto-ack
    await waitFor(() => expectToast(/3 alert\(s\) auto-acknowledged/));
  });

  // I — severity filter is sent to alertList on refresh
  it('filtering by severity calls alertList with the filter on refresh', async () => {
    mockAlertList.mockResolvedValue([
      baseAlert,
      { ...baseAlert, id: 2, severity: 'warning', title: 'Warn' },
    ]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('Warn')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Filters/i }));
    const severity = screen.getAllByRole('combobox')[0];
    fireEvent.change(severity, { target: { value: 'critical' } });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));
    await waitFor(() => expect(mockAlertList).toHaveBeenLastCalledWith({ severity: 'critical' }));
    expect(screen.getAllByRole('combobox')[0]).toHaveValue('critical');
  });

  // I — auto-refresh toggle
  it('auto-refresh toggle switches between Live and Paused', async () => {
    mockAlertList.mockResolvedValue([]);
    render(<AlertCenter />);
    await waitFor(() => expect(screen.getByText('Alert Center')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Live/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Live/i }));
    expect(screen.getByRole('button', { name: /Paused/i })).toBeInTheDocument();
  });
});
