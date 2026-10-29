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
}));

vi.mock('../../lib/api', () => ({
  listTickets: mocks.listTickets,
  createTicket: mocks.createTicket,
  addWorklog: mocks.addWorklog,
  changeTicketStatus: mocks.changeTicketStatus,
  updateTicket: mocks.updateTicket,
}));

import {
  listTickets,
  createTicket,
  addWorklog,
  changeTicketStatus,
  updateTicket,
} from '../../lib/api';

const mockListTickets = listTickets as unknown as ReturnType<typeof vi.fn>;
const mockCreateTicket = createTicket as unknown as ReturnType<typeof vi.fn>;
const mockAddWorklog = addWorklog as unknown as ReturnType<typeof vi.fn>;
const mockChangeTicketStatus = changeTicketStatus as unknown as ReturnType<typeof vi.fn>;
const mockUpdateTicket = updateTicket as unknown as ReturnType<typeof vi.fn>;

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

  it('error state shows a Retry button when list fails', async () => {
    const err: any = new Error('boom');
    err.status = 500;
    mockListTickets.mockRejectedValue(err);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('unreachable')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('Retry reloads the ticket list', async () => {
    const err: any = new Error('boom');
    err.status = 500;
    mockListTickets.mockRejectedValueOnce(err).mockResolvedValue({ count: 3, tickets: baseTickets });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('unreachable')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));
    await waitFor(() => expect(screen.getByText('Email deliverability remediation')).toBeInTheDocument());
    expect(listTickets).toHaveBeenCalledTimes(2);
  });

  it('unauthorized (401) shows unauthorized error', async () => {
    const err: any = new Error('unauthorized');
    err.status = 401;
    mockListTickets.mockRejectedValue(err);
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('unauthorized')).toBeInTheDocument());
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

  it('filters by waiting status', async () => {
    const waiting = [{ id: 'W-1', title: 'Waiting on parts', status: 'waiting', client_name: 'CUS-000001', priority: 'low' }];
    mockListTickets.mockResolvedValue({ count: 1, tickets: waiting });
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Waiting on parts')).toBeInTheDocument());

    // Switch to Waiting filter
    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.click(statusSelect);
    fireEvent.change(statusSelect, { target: { value: "waiting" } });
    await waitFor(() => {
      expect(screen.getByText('Waiting on parts')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
    });
  });

  it('filters by mine status (open tickets)', async () => {
    render(<TicketingPage />);
    await waitFor(() => expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument());

    const statusSelect = screen.getAllByRole('combobox')[0];
    fireEvent.click(statusSelect);
    fireEvent.change(statusSelect, { target: { value: "mine" } });
    await waitFor(() => {
      expect(screen.getByText('Microphone and speaker setup')).toBeInTheDocument();
      expect(screen.queryByText('Email deliverability remediation')).not.toBeInTheDocument();
    });
  });
});
