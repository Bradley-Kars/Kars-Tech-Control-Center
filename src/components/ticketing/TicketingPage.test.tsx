import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TicketingPage } from './TicketingPage';

const baseTickets = [
  { id: 'TKT-2026-001', title: 'Email deliverability remediation', status: 'closed', client_name: 'ORG-000001', priority: 'medium' },
  { id: 'TKT-2026-002', title: 'Microphone and speaker setup', status: 'open', client_name: 'CUS-000001', priority: 'medium' },
  { id: 'TKT-2026-003', title: 'Laptop repair', status: 'in-progress', client_name: 'CUS-000002', priority: 'high' },
];

const mocks = vi.hoisted(() => ({
  listTickets: vi.fn(),
  createTicket: vi.fn(),
  addWorklog: vi.fn(),
  changeTicketStatus: vi.fn(),
  updateTicket: vi.fn(),
  getTicketDetail: vi.fn(),
  generateInvoice: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  listTickets: mocks.listTickets,
  createTicket: mocks.createTicket,
  addWorklog: mocks.addWorklog,
  changeTicketStatus: mocks.changeTicketStatus,
  updateTicket: mocks.updateTicket,
  getTicketDetail: mocks.getTicketDetail,
  generateInvoice: mocks.generateInvoice,
}));

import {
  listTickets,
  createTicket,
  addWorklog,
  changeTicketStatus,
  updateTicket,
  getTicketDetail,
  generateInvoice,
} from '../../lib/api';

const mockListTickets = listTickets as unknown as ReturnType<typeof vi.fn>;
const mockCreateTicket = createTicket as unknown as ReturnType<typeof vi.fn>;
const mockAddWorklog = addWorklog as unknown as ReturnType<typeof vi.fn>;
const mockChangeTicketStatus = changeTicketStatus as unknown as ReturnType<typeof vi.fn>;
const mockUpdateTicket = updateTicket as unknown as ReturnType<typeof vi.fn>;
const mockGetTicketDetail = getTicketDetail as unknown as ReturnType<typeof vi.fn>;
const mockGenerateInvoice = generateInvoice as unknown as ReturnType<typeof vi.fn>;

describe('TicketingPage (with mocked bridge API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mockListTickets.mockResolvedValue({ count: 3, tickets: baseTickets });
    mockCreateTicket.mockResolvedValue({ ticket_id: 'NEW-1', title: '', status: 'new', version: 1 });
    mockAddWorklog.mockResolvedValue({ ticket_id: 'TKT-2026-001', version: 1, worklog_count: 1 });
    mockChangeTicketStatus.mockResolvedValue({ ticket_id: 'TKT-2026-001', status: 'new', version: 1 });
    mockUpdateTicket.mockResolvedValue({ ticket_id: 'TKT-2026-001', title: '', status: 'new', version: 1 });
    mockGetTicketDetail.mockResolvedValue({
      id: 'TKT-2026-001',
      title: 'Email deliverability remediation',
      status: 'closed',
      client_name: 'ORG-000001',
      priority: 'medium',
      description: '',
      worklog: [],
      hours: 0,
      total: 0,
      invoice_number: null,
      no_charge: false,
    });
    mockGenerateInvoice.mockResolvedValue({ invoice_id: 'INV-2026-001', ticket_id: 'TKT-2026-001', amount: 273, status: 'issued' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading state initially', () => {
    mockListTickets.mockImplementation(() => new Promise(() => {}));
    render(<TicketingPage />);
    expect(screen.getByText('Loading ticketing…')).toBeInTheDocument();
  });

  it('renders the ticket list with titles', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByTestId('ticketing-page')).toBeInTheDocument());
    for (const t of baseTickets) {
      expect(screen.getByText(t.title)).toBeInTheDocument();
      expect(screen.getByTestId(`ticket-row-${t.id}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId('ticket-table')).toBeInTheDocument();
  });

  it('create ticket submits via the API', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Ticket/i }));
    const titleInput = screen.getByPlaceholderText('Ticket title');
    fireEvent.input(titleInput, { target: { value: 'New ticket from test' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New ticket from test' }),
    );
    // Refetch happened after create
    expect(listTickets).toHaveBeenCalled();
  });

  it('quick-add Create button is type="submit" so Enter submits the form', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Ticket/i }));
    expect(screen.getByRole('button', { name: /Create/i })).toHaveAttribute('type', 'submit');
  });

  it('quick-add submits on Enter and calls createTicket', async () => {
    const { container } = render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Ticket/i }));
    const titleInput = screen.getByPlaceholderText('Ticket title');
    fireEvent.input(titleInput, { target: { value: 'Enter-submitted ticket' } });

    // Submitting the form (as Enter does in a real browser) creates the ticket
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    expect(createTicket).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Enter-submitted ticket' }),
    );
    // Refetch happened after create
    expect(listTickets).toHaveBeenCalled();
  });

  it('add worklog for a selected ticket', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-003'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    const entryInput = screen.getByTestId('worklog-entry');
    fireEvent.input(entryInput, { target: { value: 'Replaced the keyboard' } });
    fireEvent.click(screen.getByTestId('add-worklog'));

    await waitFor(() => expect(addWorklog).toHaveBeenCalled());
    expect(addWorklog).toHaveBeenCalledWith('TKT-2026-003', expect.objectContaining({ entry: 'Replaced the keyboard' }));
  });

  it('change status for a selected ticket', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-002'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('change-status'));

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    expect(changeTicketStatus).toHaveBeenCalledWith('TKT-2026-002', 'open');
  });

  it('inline update of ticket title', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    const titleInput = screen.getByTestId('edit-title');
    fireEvent.input(titleInput, { target: { value: 'Updated title' } });
    fireEvent.click(screen.getByTestId('save-ticket'));

    await waitFor(() => expect(updateTicket).toHaveBeenCalled());
    expect(updateTicket).toHaveBeenCalledWith('TKT-2026-001', expect.objectContaining({ title: 'Updated title' }));
  });

  it('error state shows ONLY error card with Retry on list failure', async () => {
    const err: any = new Error("Can't reach the ticket server.");
    err.status = 0;
    mockListTickets.mockRejectedValue(err);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText("Can't reach the ticket server.")).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
    // No tickets list rendered on error
    expect(screen.queryByTestId('ticket-table')).not.toBeInTheDocument();
    expect(screen.queryByText('No tickets found.')).not.toBeInTheDocument();
  });

  it('Retry reloads the ticket list after error', async () => {
    const err: any = new Error("Can't reach the ticket server.");
    err.status = 0;
    mockListTickets.mockRejectedValueOnce(err).mockResolvedValue({ count: 3, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText("Can't reach the ticket server.")).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());
    expect(listTickets).toHaveBeenCalledTimes(2);
  });

  it('unauthorized (401) shows AuthRequired card, not raw "unauthorized" word', async () => {
    const err: any = new Error("missing or invalid token");
    err.status = 401;
    mockListTickets.mockRejectedValue(err);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Not signed in')).toBeInTheDocument());
    expect(screen.queryByText("unauthorized")).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Settings' })).toBeInTheDocument();
  });

  it('shows No tickets found only on success with zero tickets', async () => {
    mockListTickets.mockResolvedValue({ count: 0, tickets: [] });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('No tickets found.')).toBeInTheDocument());
    // No error banner on empty success
    expect(screen.queryByText(/Failed to load/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('ticket-table')).not.toBeInTheDocument();
  });

  it('renders EmptyState component (not table) when zero tickets (TICKET-002)', async () => {
    mockListTickets.mockResolvedValue({ count: 0, tickets: [] });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeInTheDocument());
    // Table must not render when empty
    expect(screen.queryByTestId('ticket-table')).not.toBeInTheDocument();
    // Mobile cards must not render when empty
    expect(screen.queryAllByTestId(/^ticket-row-/)).toHaveLength(0);
  });

  it('search filters results by title', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search id, title, client…');
    fireEvent.input(searchInput, { target: { value: 'Laptop repair' } });
    await waitFor(() => {
      expect(screen.getByText('Laptop repair')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
    });
  });

  it('search filters results by id substring (case-insensitive)', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search id, title, client…');
    fireEvent.input(searchInput, { target: { value: '2026-003' } });
    await waitFor(() => {
      expect(screen.getByText('Laptop repair')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
      expect(screen.queryByText('Microphone and speaker setup')).not.toBeInTheDocument();
    });
  });

  it('empty search shows all tickets again', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    const searchInput = screen.getByPlaceholderText('Search id, title, client…');
    fireEvent.input(searchInput, { target: { value: 'Laptop repair' } });
    await waitFor(() => {
      expect(screen.getByText('Laptop repair')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
    });

    fireEvent.input(searchInput, { target: { value: '' } });
    await waitFor(() => {
      for (const t of baseTickets) {
        expect(screen.getByText(t.title)).toBeInTheDocument();
      }
    });
  });

  it('renders status filter chips: All, Open, Mine, Waiting, Closed', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());
    for (const value of ['all', 'open', 'mine', 'waiting', 'closed']) {
      expect(screen.getByTestId(`filter-chip-${value}`)).toBeInTheDocument();
    }
  });

  it('active chip is All with aria-pressed=true, the others are not', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());
    expect(screen.getByTestId('filter-chip-all')).toHaveAttribute('aria-pressed', 'true');
    for (const value of ['open', 'mine', 'waiting', 'closed']) {
      expect(screen.getByTestId(`filter-chip-${value}`)).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('filters by open status shows only open tickets', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-open'));
    await waitFor(() => {
      expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument();
      expect(screen.getByText('Laptop repair')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
    });
  });

  it('filters by closed status shows only closed tickets', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-closed'));
    await waitFor(() => {
      expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument();
      expect(screen.queryByText('Microphone and speaker setup')).not.toBeInTheDocument();
      expect(screen.queryByText('Laptop repair')).not.toBeInTheDocument();
    });
  });

  it('filters by mine status shows only open tickets', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-mine'));
    await waitFor(() => {
      expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
      expect(screen.getByText('Laptop repair')).toBeInTheDocument();
    });
  });

  it('clearing the status filter (All) shows all tickets again', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-open'));
    await waitFor(() => expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-all'));
    await waitFor(() => {
      for (const t of baseTickets) {
        expect(screen.getByText(t.title)).toBeInTheDocument();
      }
    });
  });

  it('filters by waiting status shows only waiting tickets', async () => {
    const waiting = [{ id: 'W-1', title: 'Waiting on parts', status: 'waiting', client_name: 'CUS-000001', priority: 'low' }];
    mockListTickets.mockResolvedValue({ count: 1, tickets: waiting });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Waiting on parts')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-waiting'));
    await waitFor(() => {
      expect(screen.getByText('Waiting on parts')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
      expect(screen.queryByText('Microphone and speaker setup')).not.toBeInTheDocument();
      expect(screen.queryByText('Laptop repair')).not.toBeInTheDocument();
    });
  });

  it('sorts by priority with high first (default)', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());
    const table = screen.getByTestId('ticket-table');
    const rows = Array.from(table.querySelectorAll('[data-testid^="ticket-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'ticket-row-TKT-2026-003', // high
      'ticket-row-TKT-2026-001', // medium
      'ticket-row-TKT-2026-002', // medium
    ]);
  });

  it('can switch sort to due without crashing', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());
    const sortSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(sortSelect, { target: { value: 'due' } });
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());
  });

  it('sorts by due date, earliest first with undated last', async () => {
    const dated = [
      { id: 'TKT-2026-001', title: 'Due later', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: '2026-11-10', updated_at: '2026-11-01T00:00:00Z' },
      { id: 'TKT-2026-002', title: 'Due first', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: '2026-11-05', updated_at: '2026-11-01T00:00:00Z' },
      { id: 'TKT-2026-003', title: 'No due date', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: null, updated_at: '2026-11-01T00:00:00Z' },
      { id: 'TKT-2026-004', title: 'Due middle', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: '2026-11-08', updated_at: '2026-11-01T00:00:00Z' },
    ];
    mockListTickets.mockResolvedValue({ count: 4, tickets: dated });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Due first')).toBeInTheDocument());
    const sortSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(sortSelect, { target: { value: 'due' } });
    await waitFor(() => expect(screen.getByText('Due first')).toBeInTheDocument());
    const table = screen.getByTestId('ticket-table');
    const rows = Array.from(table.querySelectorAll('[data-testid^="ticket-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'ticket-row-TKT-2026-002', // 2026-11-05
      'ticket-row-TKT-2026-004', // 2026-11-08
      'ticket-row-TKT-2026-001', // 2026-11-10
      'ticket-row-TKT-2026-003', // no due date, last
    ]);
  });

  it('sorts by updated date, newest first with undated last', async () => {
    const stamped = [
      { id: 'TKT-2026-001', title: 'Stale', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: null, updated_at: '2026-11-01T00:00:00Z' },
      { id: 'TKT-2026-002', title: 'Fresh', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: null, updated_at: '2026-11-03T00:00:00Z' },
      { id: 'TKT-2026-003', title: 'Never updated', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: null, updated_at: null },
      { id: 'TKT-2026-004', title: 'Mid', status: 'open', client_name: 'CUS-000001', priority: 'low', due_date: null, updated_at: '2026-11-02T00:00:00Z' },
    ];
    mockListTickets.mockResolvedValue({ count: 4, tickets: stamped });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument());
    const sortSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(sortSelect, { target: { value: 'updated' } });
    await waitFor(() => expect(screen.getByText('Fresh')).toBeInTheDocument());
    const table = screen.getByTestId('ticket-table');
    const rows = Array.from(table.querySelectorAll('[data-testid^="ticket-row-"]'));
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'ticket-row-TKT-2026-002', // 2026-11-03
      'ticket-row-TKT-2026-004', // 2026-11-02
      'ticket-row-TKT-2026-001', // 2026-11-01
      'ticket-row-TKT-2026-003', // never updated, last
    ]);
  });

  it('refetch error shows error banner but not empty state (TICKET-001)', async () => {
    mockListTickets
      .mockResolvedValueOnce({ count: 3, tickets: baseTickets })
      .mockRejectedValueOnce(new Error('Connection lost'));
    mockCreateTicket.mockResolvedValue({ ticket_id: 'NEW-1', title: 'New ticket', status: 'new', version: 1 });

    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Ticket/i }));
    const titleInput = screen.getByPlaceholderText('Ticket title');
    fireEvent.input(titleInput, { target: { value: 'New ticket' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    // refetch failed after create: error banner shows
    await waitFor(() => expect(screen.getByText(/unreachable/i)).toBeInTheDocument());
    // but "No tickets found" must NOT show — data was not wiped
    expect(screen.queryByText('No tickets found.')).not.toBeInTheDocument();
    // the ticket rows are still visible
    expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument();
  });

  it('refetch error Retry button is labeled "Retry loading" (TICKET-001)', async () => {
    mockListTickets
      .mockResolvedValueOnce({ count: 3, tickets: baseTickets })
      .mockRejectedValueOnce(new Error('Connection lost'));
    mockCreateTicket.mockResolvedValue({ ticket_id: 'NEW-1', title: 'New ticket', status: 'new', version: 1 });

    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /New Ticket/i }));
    const titleInput = screen.getByPlaceholderText('Ticket title');
    fireEvent.input(titleInput, { target: { value: 'New ticket' } });
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => expect(createTicket).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Retry loading/i })).toBeInTheDocument(),
    );
  });
});

describe('TicketingPage — All/Closed include closed tickets (U1)', () => {
  const allTickets = [
    { id: 'TKT-2026-101', title: 'Closed ticket', status: 'closed', client_name: 'CUS-000001', priority: 'medium' },
    { id: 'TKT-2026-102', title: 'Open ticket', status: 'open', client_name: 'CUS-000002', priority: 'high' },
    { id: 'TKT-2026-103', title: 'Resolved ticket', status: 'resolved', client_name: 'CUS-000003', priority: 'low' },
    { id: 'TKT-2026-104', title: 'Cancelled ticket', status: 'cancelled', client_name: 'CUS-000004', priority: 'low' },
  ];

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    mockListTickets.mockResolvedValue({ count: allTickets.length, tickets: allTickets });
  });

  it('All (default) requests ?all=true and shows closed and resolved tickets too', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Closed ticket')).toBeInTheDocument());
    for (const t of allTickets) {
      expect(screen.getByText(t.title)).toBeInTheDocument();
      expect(screen.getByTestId(`ticket-row-${t.id}`)).toBeInTheDocument();
    }
    expect(mockListTickets.mock.calls).toContainEqual([undefined, { all: true }]);
  });

  it('Open requests without all=true and shows only open tickets', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Open ticket')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-open'));
    await waitFor(() => {
      expect(screen.getByText('Open ticket')).toBeInTheDocument();
      expect(screen.queryByText('Closed ticket')).not.toBeInTheDocument();
      expect(screen.queryByText('Resolved ticket')).not.toBeInTheDocument();
      expect(screen.queryByText('Cancelled ticket')).not.toBeInTheDocument();
    });

    const last = mockListTickets.mock.calls[mockListTickets.mock.calls.length - 1];
    expect(last).toEqual([undefined, undefined]);
  });

  it('Closed requests ?all=true and shows only closed/cancelled/resolved', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Open ticket')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('filter-chip-closed'));
    await waitFor(() => {
      expect(screen.getByText('Closed ticket')).toBeInTheDocument();
      expect(screen.getByText('Resolved ticket')).toBeInTheDocument();
      expect(screen.getByText('Cancelled ticket')).toBeInTheDocument();
      expect(screen.queryByText('Open ticket')).not.toBeInTheDocument();
    });

    const last = mockListTickets.mock.calls[mockListTickets.mock.calls.length - 1];
    expect(last).toEqual([undefined, { all: true }]);
  });

  it('"N open" header counts open statuses only, also on the Closed filter', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Open ticket')).toBeInTheDocument());
    expect(screen.getByText('1 open')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('filter-chip-closed'));
    await waitFor(() => {
      expect(screen.queryByText('Open ticket')).not.toBeInTheDocument();
    });
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });
});

describe('TicketingPage — U7 ticket detail with long text', () => {
  const longDescription = [
    'Customer reports that outbound email from the front desk workstation has stopped working entirely.',
    'SMTP authentication fails with "535 5.7.8 Username and Password not accepted" on every send attempt.',
    'Verified credentials match the mail server configuration; tested with telnet to port 587 — connection',
    'established but AUTH LOGIN rejected. Checked the local mail client (Thunderbird) — same failure.',
    'Reviewed mail server logs: no record of the authentication attempt reaching the server, suggesting',
    'a local firewall or antivirus is intercepting outbound SMTP. Temporarily disabled the third-party',
    'antivirus mail scanner — email sending resumed immediately. Recommended adding an exclusion for',
    'the mail client\'s SMTP process and re-enabling antivirus. Customer confirmed the fix works.',
    'Follow-up scheduled for next week to verify no recurrence.',
  ].join('\n');

  const worklogEntries = [
    { date: '2026-10-01', mode: 'onsite', hours: 0.5, amount: 39, payment: 'uninvoiced', description: 'Diagnosed SMTP auth failure; checked mail server logs and client config.' },
    { date: '2026-10-02', mode: 'remote', hours: 1.33, amount: 39, payment: 'uninvoiced', description: 'Tested telnet to port 587; confirmed AUTH LOGIN rejection before reaching the server.' },
    { date: '2026-10-03', mode: 'onsite', hours: 0.5, amount: 39, payment: 'uninvoiced', description: 'Identified third-party antivirus mail scanner as the interception point.' },
    { date: '2026-10-04', mode: 'remote', hours: 1.33, amount: 39, payment: 'uninvoiced', description: 'Disabled antivirus mail scanner; verified email sending resumed.' },
    { date: '2026-10-05', mode: 'onsite', hours: 0.5, amount: 39, payment: 'uninvoiced', description: 'Configured antivirus exclusion for the mail client SMTP process.' },
    { date: '2026-10-06', mode: 'remote', hours: 1.33, amount: 39, payment: 'uninvoiced', description: 'Re-enabled antivirus; confirmed email still works with exclusion in place.' },
    { date: '2026-10-07', mode: 'onsite', hours: 0.5, amount: 39, payment: 'uninvoiced', description: 'Final verification with customer; follow-up scheduled for next week.' },
  ];

  const detailTicket: any = {
    id: 'TKT-2026-001',
    title: 'Email deliverability remediation',
    status: 'closed',
    client_name: 'ORG-000001',
    priority: 'medium',
    description: longDescription,
    worklog: worklogEntries,
    hours: 5.99,
    total: 273,
    invoice_number: null,
    no_charge: false,
  };

  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    vi.stubGlobal('alert', vi.fn());
    mockListTickets.mockResolvedValue({ count: 3, tickets: baseTickets });
    mockGetTicketDetail.mockResolvedValue(detailTicket);
    mockGenerateInvoice.mockResolvedValue({ invoice_id: 'INV-2026-001', ticket_id: 'TKT-2026-001', amount: 273, status: 'issued' });
  });

  it('selecting a ticket fetches and shows the full detail panel', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());
    await waitFor(() => expect(mockGetTicketDetail).toHaveBeenCalledWith('TKT-2026-001'));
  });

  it('shows the full description with line breaks preserved, no truncation', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());
    await waitFor(() => expect(mockGetTicketDetail).toHaveBeenCalled());

    const description = screen.getByTestId('ticket-description');
    expect(description).toBeInTheDocument();
    // Full long text present (800+ chars)
    expect(description.textContent).toContain('Customer reports that outbound email');
    expect(description.textContent).toContain('Follow-up scheduled for next week to verify no recurrence.');
    // Line breaks preserved: multiple lines visible
    const lines = (description.textContent || '').split('\n');
    expect(lines.length).toBeGreaterThan(5);
  });

  it('shows worklog entries with hours, amount, mode, payment', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('worklog-list')).toBeInTheDocument());

    // All 7 entries rendered
    // Count worklog rows by looking for the mode labels
    expect(screen.getAllByText('onsite')).toHaveLength(4);
    expect(screen.getAllByText('remote')).toHaveLength(3);
    expect(screen.getAllByText('0.50h')).toHaveLength(4);
    expect(screen.getAllByText('1.33h')).toHaveLength(3);
    expect(screen.getAllByText('$39.00')).toHaveLength(7);
    expect(screen.getAllByText('uninvoiced')).toHaveLength(7);
  });

  it('shows correct hours and amount totals', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    // Totals shown in worklog header: 5.99h • $273.00
    expect(screen.getByText('5.99h', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('$273.00', { exact: false })).toBeInTheDocument();
  });

  it('add worklog calls the API with the selected ticket id', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    const entryInput = screen.getByTestId('worklog-entry');
    fireEvent.input(entryInput, { target: { value: 'Replaced the keyboard' } });
    fireEvent.click(screen.getByTestId('add-worklog'));

    await waitFor(() => expect(addWorklog).toHaveBeenCalled());
    expect(addWorklog).toHaveBeenCalledWith('TKT-2026-001', expect.objectContaining({ entry: 'Replaced the keyboard' }));
  });

  it('change status calls the API with the selected ticket id', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('change-status'));

    await waitFor(() => expect(changeTicketStatus).toHaveBeenCalled());
    expect(changeTicketStatus).toHaveBeenCalledWith('TKT-2026-001', 'closed');
  });

  it('generate invoice calls the API and shows the result', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Laptop repair')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('ticket-row-TKT-2026-001'));
    await waitFor(() => expect(screen.getByTestId('ticket-detail')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('generate-invoice'));

    await waitFor(() => expect(mockGenerateInvoice).toHaveBeenCalled());
    expect(mockGenerateInvoice).toHaveBeenCalledWith('TKT-2026-001');
  });
});
