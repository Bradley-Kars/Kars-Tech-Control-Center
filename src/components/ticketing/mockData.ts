// MC-1 mock fixture — shaped like GET /tickets?all=true from the ticketing
// bridge (127.0.0.1:8799). IDs and amounts only; no client names. This file
// is MOCK DATA ONLY: MC-1 performs zero network calls and zero writes.
// Swap point for MC-1b: replace `fetchMockOverview` with a bridge GET.

export interface MockTicketRow {
  id: string;
  title: string;
  status: string;
  client_id: string;
  hours: number;
  total: number;
  invoice_number: string | null;
  no_charge: boolean;
}

export interface MockInvoiceRow {
  number: string;
  ticket_id: string;
  total: number;
  no_charge: boolean;
}

export interface MockOverview {
  open: number;
  critical: number;
  overdue: number;
  tickets_total: number;
  invoices_total: number;
  collected: number;
  outstanding: number;
}

export const MOCK_TICKETS: MockTicketRow[] = [
  { id: 'TKT-2026-001', title: 'Email deliverability remediation', status: 'closed', client_id: 'ORG-000001', hours: 7, total: 175, invoice_number: 'INV-2026-001', no_charge: false },
  { id: 'TKT-2026-002', title: 'Microphone and speaker setup', status: 'closed', client_id: 'CUS-000001', hours: 2, total: 60, invoice_number: 'INV-2026-002', no_charge: false },
  { id: 'TKT-2026-003', title: 'Laptop repair', status: 'closed', client_id: 'CUS-000002', hours: 2, total: 130, invoice_number: 'INV-2026-003', no_charge: false },
  { id: 'TKT-2026-004', title: 'iPad printing', status: 'closed', client_id: 'ORG-000002', hours: 1, total: 0, invoice_number: 'INV-2026-004', no_charge: true },
];

export const MOCK_INVOICES: MockInvoiceRow[] = [
  { number: 'INV-2026-001', ticket_id: 'TKT-2026-001', total: 175, no_charge: false },
  { number: 'INV-2026-002', ticket_id: 'TKT-2026-002', total: 60, no_charge: false },
  { number: 'INV-2026-003', ticket_id: 'TKT-2026-003', total: 130, no_charge: false },
  { number: 'INV-2026-004', ticket_id: 'TKT-2026-004', total: 0, no_charge: true },
];

/** Derive dashboard cards from the mock rows. Pure — unit-tested. */
export function computeOverview(tickets: MockTicketRow[] = MOCK_TICKETS, invoices: MockInvoiceRow[] = MOCK_INVOICES): MockOverview {
  const open = tickets.filter((t) => t.status === 'open').length;
  const critical = tickets.filter((t) => t.status === 'critical').length;
  const overdue = tickets.filter(
    (t) => t.status !== 'closed' && t.total > 0 && t.invoice_number === null
  ).length;
  const billed = invoices.filter((i) => !i.no_charge);
  const collected = MOCK_INVOICES.length === 0 ? 0 : billed.reduce((s, i) => s + i.total, 0);
  return {
    open,
    critical,
    overdue,
    tickets_total: tickets.length,
    invoices_total: invoices.length,
    collected,
    outstanding: 0, // MC-1 mock: nothing outstanding in the fixture
  };
}

/** Map tickets to their invoices by ticket_id — the stored link, not inference. */
export function invoiceForTicket(ticketId: string, invoices: MockInvoiceRow[] = MOCK_INVOICES): MockInvoiceRow | null {
  return invoices.find((i) => i.ticket_id === ticketId) ?? null;
}

/** MC-1 stand-in for the bridge call. Returns mock data synchronously. */
export function fetchMockOverview(): { overview: MockOverview; tickets: MockTicketRow[]; invoices: MockInvoiceRow[] } {
  return { overview: computeOverview(), tickets: MOCK_TICKETS, invoices: MOCK_INVOICES };
}
