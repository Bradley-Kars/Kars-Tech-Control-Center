import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TicketingPage } from './TicketingPage';

vi.mock('../../lib/api', () => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
  addWorklog: vi.fn(),
  changeTicketStatus: vi.fn(),
}));

import { listTickets, createTicket, addWorklog, changeTicketStatus } from '../../lib/api';

const baseTickets = [
  { id: 'TKT-2026-001', title: 'Email deliverability remediation', status: 'closed', client_name: 'ORG-000001', priority: 'medium' },
  { id: 'TKT-2026-002', title: 'Microphone and speaker setup', status: 'closed', client_name: 'CUS-000001', priority: 'medium' },
  { id: 'TKT-2026-003', title: 'Laptop repair', status: 'closed', client_name: 'CUS-000002', priority: 'medium' },
  { id: 'TKT-2026-004', title: 'iPad printing', status: 'closed', client_name: 'ORG-000002', priority: 'medium' },
];

const err401 = Object.assign(new Error('unauthorized'), { status: 401, detail: 'token has no actor_id' });

describe('TicketingPage (with mocked bridge API)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    (listTickets as any).mockImplementation(() => new Promise(() => {}));
    render(<TicketingPage />);
    expect(screen.getByText('Loading ticketing…')).toBeInTheDocument();
  });

  it('renders the live bridge badge and ticket list', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    expect(screen.queryByText('MC-1 · mock data')).not.toBeInTheDocument();
    expect(screen.queryByText('OFF-1 · offline')).not.toBeInTheDocument();
    expect(screen.getByTestId('ticket-table')).toBeInTheDocument();
    for (const t of baseTickets) {
      expect(screen.getByTestId(`ticket-row-${t.id}`)).toBeInTheDocument();
    }
  });

  it('renders OFF-1 banner with "Unreachable" when the list call fails', async () => {
    (listTickets as any).mockRejectedValue(new Error('connect ECONNREFUSED'));
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Unreachable (network/timeout)')).toBeInTheDocument());
    expect(screen.getByText(/Could not reach the ticketing bridge/)).toBeInTheDocument();
  });

  it('renders OFF-1 banner with "Unauthorized (401)" on a 401', async () => {
    (listTickets as any).mockRejectedValue(err401);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Unauthorized (401)')).toBeInTheDocument());
  });

  it('renders cards, table rows, and settings', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    expect(screen.getByTestId('ticket-table')).toBeInTheDocument();
    expect(screen.getByTestId('ticketing-settings')).toBeInTheDocument();
    expect(screen.getByText('Bridge connection')).toBeInTheDocument();
  });

  it('shows detail strip on row click', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    const row = screen.getByTestId('ticket-row-TKT-2026-003');
    fireEvent.click(row);
    const detail = screen.getByTestId('ticket-detail');
    expect(detail.textContent).toContain('TKT-2026-003');
  });

  // Live bridge payloads carry no hours / total / invoice_number. Those must
  // render as n/a — a fabricated 0 would be a lie about money.
  it('shows n/a for collected, overdue and per-ticket money fields on live data', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());

    expect(screen.getByTestId('stat-collected-value').textContent).toBe('n/a');
    expect(screen.getByTestId('stat-overdue-value').textContent).toBe('n/a');
    expect(screen.getByTestId('stat-tickets-value').textContent).toBe('4');
    // Live data carries no invoice figures, so invoices_total is 0 (not
    // fabricated from a fixture).
    expect(screen.getByTestId('stat-invoices-value').textContent).toBe('0');

    for (const t of baseTickets) {
      const row = screen.getByTestId(`ticket-row-${t.id}`);
      expect(row.textContent).toContain('n/a');
    }
    const firstRow = screen.getByTestId('ticket-row-TKT-2026-001');
    const nCells = Array.from(firstRow.querySelectorAll('td')).filter(
      (td) => td.textContent?.trim() === 'n/a',
    );
    expect(nCells.length).toBeGreaterThanOrEqual(3); // hours, total, invoice
  });

  it('calls createTicket on create and refetches', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    (createTicket as any).mockResolvedValue({ ticket_id: 'TKT-2026-005', title: 'New ticket', status: 'new', version: 1 });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    fireEvent.click(screen.getByText('New Ticket'));
    fireEvent.change(screen.getByPlaceholderText('Ticket title'), { target: { value: 'New ticket' } });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    const call = (createTicket as any).mock.calls[0][0];
    expect(call.title).toBe('New ticket');
    expect(listTickets).toHaveBeenCalled();
  });

  it('calls addWorklog on worklog add and refetches', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    (addWorklog as any).mockResolvedValue({ ticket_id: 'TKT-2026-001', version: 2, worklog_count: 1 });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    const row = screen.getByTestId('ticket-row-TKT-2026-001');
    fireEvent.click(row);
    fireEvent.change(screen.getByPlaceholderText('Describe the work done'), { target: { value: 'fixed it' } });
    fireEvent.click(screen.getByText('Add Worklog'));
    await waitFor(() => expect(addWorklog).toHaveBeenCalledWith('TKT-2026-001', expect.objectContaining({ entry: 'fixed it' })));
    expect(listTickets).toHaveBeenCalled();
  });

  it('calls changeTicketStatus on status change and refetches', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    (changeTicketStatus as any).mockResolvedValue({ ticket_id: 'TKT-2026-001', status: 'resolved', version: 2 });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    const row = screen.getByTestId('ticket-row-TKT-2026-001');
    fireEvent.click(row);
    fireEvent.change(screen.getByTestId('ticket-detail').querySelector('select')!, { target: { value: 'resolved' } });
    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalledWith('TKT-2026-001', 'resolved'));
    expect(listTickets).toHaveBeenCalled();
  });
});
