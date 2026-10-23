import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TicketingPage } from './TicketingPage';
import { computeOverview, invoiceForTicket, type MockTicketRow } from './mockData';

// Mock the Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';

const MOCK_OVERVIEW = {
  overview: { open: 0, critical: 0, overdue: 0, tickets_total: 4, invoices_total: 4, collected: 365, outstanding: 0 },
  tickets: [
    { id: 'TKT-2026-001', title: 'Email deliverability remediation', status: 'closed', client_id: 'ORG-000001', hours: 7, total: 175, invoice_number: 'INV-2026-001', no_charge: false },
    { id: 'TKT-2026-002', title: 'Microphone and speaker setup', status: 'closed', client_id: 'CUS-000001', hours: 2, total: 60, invoice_number: 'INV-2026-002', no_charge: false },
    { id: 'TKT-2026-003', title: 'Laptop repair', status: 'closed', client_id: 'CUS-000002', hours: 2, total: 130, invoice_number: 'INV-2026-003', no_charge: false },
    { id: 'TKT-2026-004', title: 'iPad printing', status: 'closed', client_id: 'ORG-000002', hours: 1, total: 0, invoice_number: 'INV-2026-004', no_charge: true },
  ],
  invoices: [
    { number: 'INV-2026-001', ticket_id: 'TKT-2026-001', total: 175, no_charge: false },
    { number: 'INV-2026-002', ticket_id: 'TKT-2026-002', total: 60, no_charge: false },
    { number: 'INV-2026-003', ticket_id: 'TKT-2026-003', total: 130, no_charge: false },
    { number: 'INV-2026-004', ticket_id: 'TKT-2026-004', total: 0, no_charge: true },
  ],
  from_mock: true,
  offline_reason: 'none',
};

const MOCK_OFFLINE_UNREACHABLE = { ...MOCK_OVERVIEW, offline_reason: 'unreachable' };
const MOCK_OFFLINE_UNAUTHORIZED = { ...MOCK_OVERVIEW, offline_reason: 'unauthorized' };
const MOCK_OFFLINE_BAD_RESPONSE = { ...MOCK_OVERVIEW, offline_reason: 'bad_response' };
const MOCK_LIVE = { ...MOCK_OVERVIEW, from_mock: false, offline_reason: 'none' };

describe('ticketing mock mapping (pure functions)', () => {
  it('computes cards from fixture rows', () => {
    const ov = computeOverview();
    expect(ov.open).toBe(0);
    expect(ov.critical).toBe(0);
    expect(ov.overdue).toBe(0);
    expect(ov.tickets_total).toBe(4);
    expect(ov.invoices_total).toBe(4);
    expect(ov.collected).toBe(365);
  });

  it('links invoices via stored ticket_id, not inference', () => {
    for (const t of MOCK_OVERVIEW.tickets) {
      const inv = invoiceForTicket(t.id, MOCK_OVERVIEW.invoices);
      expect(inv).not.toBeNull();
      expect(inv!.ticket_id).toBe(t.id);
      expect(inv!.total).toBe(t.total);
      expect(inv!.no_charge).toBe(t.no_charge);
    }
  });

  it('uses the 2026 renumbered invoice series', () => {
    const nums = MOCK_OVERVIEW.invoices.map((i) => i.number);
    expect(nums).toEqual(['INV-2026-001', 'INV-2026-002', 'INV-2026-003', 'INV-2026-004']);
  });

  it('flags the no-charge invoice', () => {
    const nc = invoiceForTicket('TKT-2026-004', MOCK_OVERVIEW.invoices)!;
    expect(nc.no_charge).toBe(true);
    expect(nc.total).toBe(0);
  });

  it('many_to_one_is_allowed', () => {
    const tickets = [
      { id: 'TKT-2026-001', title: 't', status: 'closed', client_id: 'ORG-000001', hours: 7, total: 175, invoice_number: 'INV-2026-001', no_charge: false },
      { id: 'TKT-2026-002', title: 't', status: 'closed', client_id: 'CUS-000001', hours: 2, total: 60, invoice_number: 'INV-2026-002', no_charge: false },
    ];
    const invoices = [
      { number: 'INV-2026-001', ticket_id: 'TKT-2026-001', total: 175, no_charge: false },
      { number: 'INV-2026-002', ticket_id: 'TKT-2026-001', total: 60, no_charge: false },
    ];
    for (const t of tickets) {
      const inv = invoices.find((i) => i.ticket_id === t.id);
      expect(inv).not.toBeNull();
    }
  });
});

describe('TicketingPage (with mocked Tauri invoke)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  const renderWithMock = (mockData: any) => {
    (invoke as any).mockResolvedValue(mockData);
    return render(<TicketingPage />);
  };

  it('renders loading state initially', () => {
    (invoke as any).mockImplementation(() => new Promise(() => {}));
    render(<TicketingPage />);
    expect(screen.getByText('Loading ticketing…')).toBeInTheDocument();
  });

  it('renders mock data with MC-1 badge when from_mock=true', async () => {
    (invoke as any).mockResolvedValue(MOCK_OVERVIEW);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1 · mock data')).toBeInTheDocument());
    // MC-1b badge should not be present (badge text is "MC-1b · live bridge")
    expect(screen.queryByText('MC-1b · live bridge')).not.toBeInTheDocument();
    expect(screen.queryByText('OFF-1 · offline')).not.toBeInTheDocument();
  });

  it('renders live bridge badge when from_mock=false, offline_reason=none', async () => {
    (invoke as any).mockResolvedValue({ ...MOCK_OVERVIEW, from_mock: false, offline_reason: 'none' });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());
    expect(screen.queryByText('MC-1 · mock data')).not.toBeInTheDocument();
    expect(screen.queryByText('OFF-1 · offline')).not.toBeInTheDocument();
  });

  it('renders OFF-1 banner with "Unreachable" when offline_reason=unreachable', async () => {
    (invoke as any).mockResolvedValue({ ...MOCK_OVERVIEW, offline_reason: 'unreachable' });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Unreachable (network/timeout)')).toBeInTheDocument());
    expect(screen.getByText(/Could not reach the ticketing bridge/)).toBeInTheDocument();
  });

  it('renders OFF-1 banner with "Unauthorized (401)" when offline_reason=unauthorized', async () => {
    (invoke as any).mockResolvedValue({ ...MOCK_OVERVIEW, offline_reason: 'unauthorized' });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Unauthorized (401)')).toBeInTheDocument());
  });

  it('renders OFF-1 banner with "Bad response" when offline_reason=bad_response', async () => {
    (invoke as any).mockResolvedValue({ ...MOCK_OVERVIEW, offline_reason: 'bad_response' });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Bad response (parse/format error)')).toBeInTheDocument());
  });

  it('renders cards, table rows, and settings', async () => {
    (invoke as any).mockResolvedValue(MOCK_OVERVIEW);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1 · mock data')).toBeInTheDocument());
    expect(screen.getByTestId('ticket-table')).toBeInTheDocument();
    for (const t of MOCK_OVERVIEW.tickets) {
      expect(screen.getByTestId(`ticket-row-${t.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('ticketing-settings')).toBeInTheDocument();
    expect(screen.getByText('Bridge connection')).toBeInTheDocument();
  });

  it('shows detail strip on row click with invoice link', async () => {
    (invoke as any).mockResolvedValue(MOCK_OVERVIEW);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1 · mock data')).toBeInTheDocument());
    const row = screen.getByTestId('ticket-row-TKT-2026-003');
    fireEvent.click(row);
    const detail = screen.getByTestId('ticket-detail');
    expect(detail.textContent).toContain('TKT-2026-003');
    expect(detail.textContent).toContain('INV-2026-003');
  });

  it('marks the no-charge invoice in the table', async () => {
    (invoke as any).mockResolvedValue(MOCK_OVERVIEW);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByTestId('ticket-row-TKT-2026-004')).toBeInTheDocument());
    const row = screen.getByTestId('ticket-row-TKT-2026-004');
    expect(row.textContent).toContain('INV-2026-004');
    expect(row.textContent).toContain('no-charge');
  });

  it('shows settings with bridge URL and mode info', async () => {
    (invoke as any).mockResolvedValue(MOCK_OVERVIEW);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByTestId('ticketing-settings')).toBeInTheDocument());
    const settings = screen.getByTestId('ticketing-settings');
    expect(settings.textContent).toContain('127.0.0.1:8799');
    expect(settings.textContent).toContain('config.private.json');
  });

  // Live bridge payloads carry no hours / total / invoice_number / due date. Those must
  // render as n/a — a fabricated 0 (or a stale fixture value) would be a lie about money.
  it('shows n/a for collected, overdue and per-ticket money fields on live data', async () => {
    (invoke as any).mockResolvedValue(MOCK_LIVE);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('MC-1b · live bridge')).toBeInTheDocument());

    expect(screen.getByTestId('stat-collected-value').textContent).toBe('n/a');
    expect(screen.getByTestId('stat-overdue-value').textContent).toBe('n/a');
    // Counts are still real and must NOT be n/a.
    expect(screen.getByTestId('stat-tickets-value').textContent).toBe('4');
    expect(screen.getByTestId('stat-invoices-value').textContent).toBe('4');

    // Every row: hours, total and invoice cell are n/a; no fixture money leaks through.
    for (const t of MOCK_OVERVIEW.tickets) {
      const row = screen.getByTestId(`ticket-row-${t.id}`);
      expect(row.textContent).toContain('n/a');
      expect(row.textContent).not.toContain(String(t.total.toFixed(2)));
    }
    const firstRow = screen.getByTestId('ticket-row-TKT-2026-001');
    const nCells = Array.from(firstRow.querySelectorAll('td')).filter(
      (td) => td.textContent?.trim() === 'n/a',
    );
    expect(nCells.length).toBeGreaterThanOrEqual(3); // hours, total, invoice
  });

  it('fails if 401 silently falls back to mock without offline_reason', async () => {
    // This test ensures a 401 cannot silently fall back to mock without offline_reason
    (invoke as any).mockResolvedValue({ 
      ...MOCK_OVERVIEW, 
      from_mock: true, 
      offline_reason: 'unauthorized' // must have offline_reason set
    });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('OFF-1 — Unauthorized (401)')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('OFF-1 — Unauthorized (401)')).toBeInTheDocument());
  });
});
