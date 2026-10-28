import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TicketingPage } from './TicketingPage';

vi.mock('../../lib/api', () => ({
  listTickets: vi.fn(),
}));

import { listTickets } from '../../lib/api';

const baseTickets = [
  { id: 'TKT-2026-001', title: 'Email deliverability remediation', status: 'closed', client_name: 'ORG-000001', priority: 'medium' },
  { id: 'TKT-2026-002', title: 'Microphone and speaker setup', status: 'closed', client_name: 'CUS-000001', priority: 'medium' },
  { id: 'TKT-2026-003', title: 'Laptop repair', status: 'closed', client_name: 'CUS-000002', priority: 'medium' },
  { id: 'TKT-2026-004', title: 'iPad printing', status: 'closed', client_name: 'ORG-000002', priority: 'medium' },
];

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

  it('renders the ticket list', async () => {
    (listTickets as any).mockResolvedValue({ count: 4, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByTestId('ticketing-page')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());
    expect(screen.getByTestId('ticket-table')).toBeInTheDocument();
    for (const t of baseTickets) {
      expect(screen.getByTestId(`ticket-row-${t.id}`)).toBeInTheDocument();
    }
  });
});