// MC-1b — Ticketing page (W1/W2)
// Mobile-first, reuse existing UI components (Card, Badge, Input, Button, Label).
// No @tauri-apps imports — data flows through src/lib/api.ts (same origin,
// API under /api). Identity comes from the bridge (X-API-Token or the
// Tailscale-User-Login header it trusts from loopback, W3).
// No new libraries.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import {
  addWorklog,
  changeTicketStatus,
  createTicket,
  listTickets,
  updateTicket,
  type CreateTicketInput,
  type TicketSummary,
  type WorklogEntryInput,
} from '../../lib/api';

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

interface TicketRow {
  id: string;
  title: string;
  status: string;
  client_id: string;
  priority?: string;
  category?: string;
  hours: number;
  total: number;
  invoice_number: string | null;
  no_charge: boolean;
  created_at?: string;
  updated_at?: string;
}

interface TicketOverview {
  tickets: TicketRow[];
  from_mock: boolean;
  offline_reason: 'none' | 'unreachable' | 'unauthorized' | 'bad_response' | 'other';
}

const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);
const OPEN_STATUSES = new Set(['new', 'open', 'in-progress', 'triaged', 'waiting']);
const WAITING_STATUSES = new Set(['waiting', 'pending']);

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

// ------------------------------------------------------------------ */
/* Small components                                                   */
/* ------------------------------------------------------------------ */

function StatusChip({ status }: { status: string }) {
  const isClosed = CLOSED_STATUSES.has(status);
  const isWaiting = WAITING_STATUSES.has(status);
  const variant =
    isClosed ? 'subtle' : isWaiting ? 'amber' : status === 'in-progress' ? 'brand' : 'default';
  return (
    <Badge variant={variant} size="xs">
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

function PriorityChip({ priority }: { priority?: string }) {
  const variant =
    priority === 'high' ? 'danger' : priority === 'medium' ? 'amber' : 'subtle';
  return (
    <Badge variant={variant} size="xs">
      {priority ? priority.charAt(0).toUpperCase() + priority.slice(1) : '—'}
    </Badge>
  );
}

function ErrorBanner({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <Card variant="amber" className="p-4">
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold">⚠</span>
        <div className="flex-1">
          <div className="text-sm font-semibold">{error}</div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card variant="subtle" className="flex-1 min-w-[140px] p-4">
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </Card>
  );
}

function TicketRowItem({ ticket, onSelect }: { ticket: TicketRow; onSelect: (t: TicketRow) => void }) {
  const isClosed = CLOSED_STATUSES.has(ticket.status);
  const isWaiting = WAITING_STATUSES.has(ticket.status);
  const isOverdue = false; // No due dates in current data model

  return (
    <button
      onClick={() => onSelect(ticket)}
      className={`flex flex-col gap-2 p-3 rounded-lg border border-[var(--kts-border-default)] cursor-pointer transition-all duration-200 ${isClosed ? 'opacity-50 grayscale-[0.5]' : 'hover:bg-[var(--kts-bg-tertiary)] hover:border-[var(--kts-border-focus)]'}`}
    >
      <div className="flex items-center justify-between">
        <div className="font-mono text-sm">{ticket.id}</div>
        <div className="flex items-center gap-2">
          <PriorityChip priority={ticket.priority} />
          <StatusChip status={ticket.status} />
        </div>
      </div>
      <div className="mt-2 font-semibold">{ticket.title}</div>
      <div className="flex items-center gap-4 text-sm text-[var(--kts-text-secondary)]">
        <span className="font-mono">{ticket.client_id}</span>
        {isOverdue && <span className="text-[var(--kts-status-error)]">Overdue</span>}
      </div>
    </button>
  );
}

// ------------------------------------------------------------------ */
/* TicketingPage                                                      */
/* ------------------------------------------------------------------ */

export function TicketingPage() {
  const [data, setData] = useState<TicketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createClient, setCreateClient] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');

  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'picks' | 'closed'>('all');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'rating' | 'capture_date' | 'edit_date'>('rating');

  // View mode (mobile vs desktop)
  const [isMobile, setIsMobile] = useState(false);

  // Filtered & sorted tickets
  const filteredTickets = useMemo(() => {
    if (!data) return [];
    let result = [...data.tickets];

    // Filter by status
    if (filterStatus !== 'all') {
      if (filterStatus === 'open') {
        result = result.filter((t) => !CLOSED_STATUSES.has(t.status));
      } else if (filterStatus === 'picks') {
        result = result.filter((t) => !CLOSED_STATUSES.has(t.status));
      } else if (filterStatus === 'closed') {
        result = result.filter((t) => CLOSED_STATUSES.has(t.status));
      }
    }

    // Search
    if (searchText.trim()) {
      const s = searchText.toLowerCase();
      result = result.filter(
        (t) =>
          t.id.toLowerCase().includes(s) ||
          t.title.toLowerCase().includes(s) ||
          t.client_id.toLowerCase().includes(s),
      );
    }

    // Sort
    if (sortBy === 'rating') {
      result = result.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority ?? 'medium'] ?? 1;
        const pb = PRIORITY_ORDER[b.priority ?? 'medium'] ?? 1;
        return pa - pb;
      });
    } else if (sortBy === 'capture_date') {
      result = result.sort((a, b) => a.id.localeCompare(b.id));
    } else if (sortBy === 'edit_date') {
      result = result.sort((a, b) => a.id.localeCompare(b.id));
    }

    return result;
  }, [data, filterStatus, searchText, sortBy]);

  // View mode (mobile vs desktop)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Fetch tickets on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listTickets();
        if (mounted) {
          setData({
            tickets: res.tickets.map((t) => ({
              id: t.id,
              title: t.title,
              status: t.status,
              client_id: t.client_id ?? '',
              priority: t.priority ?? 'medium',
              hours: 0,
              total: 0,
              invoice_number: null,
              no_charge: false,
            })),
            offline_reason: 'none',
          });
        }
      } catch (err) {
        if (mounted) {
          console.error('[ticketing] list failed:', err);
          setData({
            tickets: [],
            from_mock: false,
            offline_reason: (err as { status?: number }).status === 401 ? 'unauthorized' : 'unreachable',
          });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refetch = async () => {
    try {
      const res = await listTickets();
      setData({
        tickets: res.tickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          client_id: t.client_id ?? '',
          priority: t.priority ?? 'medium',
          hours: 0,
          total: 0,
          invoice_number: null,
          no_charge: false,
        })),
        from_mock: false,
        offline_reason: 'none',
      });
    } catch (err) {
      console.error('[ticketing] refetch failed:', err);
      const offline: TicketOverview = {
        tickets: [],
        from_mock: false,
        offline_reason: (err as { status?: number }).status === 401 ? 'unauthorized' : 'unreachable',
      };
      setData(offline);
    }
  };

  // Create ticket
  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim()) return;
    try {
      const input: CreateTicketInput = {
        title: createTitle,
        priority: createPriority,
        category: createClient || undefined,
      };
      await createTicket(input);
      setCreateTitle('');
      setCreateClient('');
      setCreatePriority('medium');
      setCreating(false);
      await refetch();
    } catch (err) {
      console.error('[ticketing] create failed:', err);
      alert(`Failed to create ticket: ${err}`);
    }
  };

  // Add worklog
  const handleAddWorklog = async () => {
    if (!selected) return;
    const entryInput = document.getElementById(`worklog-input-${selected.id}`) as HTMLInputElement | null;
    const hoursInput = document.getElementById(`worklog-hours-${selected.id}`) as HTMLInputElement | null;
    if (!entryInput?.value.trim()) return;
    try {
      const input: WorklogEntryInput = {
        entry: entryInput.value,
        hours: parseFloat(hoursInput?.value || '0.5') || 0.5,
        payment: 'uninvoiced',
      };
      await addWorklog(selected.id, input);
      entryInput.value = '';
      hoursInput.value = '0.5';
      await refetch();
    } catch (err) {
      console.error('[ticketing] worklog failed:', err);
      alert(`Failed to add worklog: ${err}`);
    }
  };

  // Change status
  const handleChangeStatus = async (newStatus: string) => {
    if (!selected) return;
    try {
      await changeTicketStatus(selected.id, newStatus);
      await refetch();
      const refreshed = await listTickets();
      setSelected(
        refreshed.tickets.find((t) => t.id === selected.id) ?? selected,
      );
    } catch (err) {
      console.error('[ticketing] status change failed:', err);
      alert(`Failed to change status: ${err}`);
    }
  };

  // Update ticket inline
  const handleUpdateTicket = async (updates: Record<string, unknown>) => {
    if (!selected) return;
    try {
      await updateTicket(selected.id, updates);
      await refetch();
      const refreshed = await listTickets();
      setSelected(
        refreshed.tickets.find((t) => t.id === selected.id) ?? selected,
      );
    } catch (err) {
      console.error('[ticketing] update failed:', err);
      alert(`Failed to update: ${err}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6" data-testid="ticketing-page">
        <div className="text-center opacity-50">Loading ticketing…</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 space-y-6" data-testid="ticketing-page">
        <ErrorBanner error="Failed to load tickets" onRetry={() => refetch()} />
      </div>
    );
  }

  const { tickets, offline_reason } = data;

  // Mobile view: cards
  if (isMobile) {
    return (
      <div className="p-4 space-y-4" data-testid="ticketing-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Ticketing</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold font-mono">
              MC-1b · live bridge
            </span>
            <Button onClick={() => setCreating(!creating)}>
              {creating ? 'Cancel' : 'New Ticket'}
            </Button>
          </div>
        </div>

        {/* OFF-1 offline banner */}
        {data.offline_reason && data.offline_reason !== 'none' && (
          <ErrorBanner error={data.offline_reason} onRetry={() => refetch()} />
        )}

        {/* Create ticket form */}
        {creating && (
          <Card variant="subtle" className="p-4">
            <form onSubmit={handleCreateTicket} className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label>Title</Label>
                <Input
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.currentTarget.value)}
                  placeholder="Ticket title"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-col gap-1">
                  <Label>Priority</Label>
                  <select
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.currentTarget.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="flex-col gap-1">
                  <Label>Client</Label>
                  <Input
                    value={createClient}
                    onChange={(e) => setCreateClient(e.currentTarget.value)}
                    placeholder="Client (optional)"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-2">
                <Button variant="primary" onClick={handleCreateTicket} disabled={!createTitle.trim()}>
                  Create
                </Button>
                <Button variant="outline" onClick={() => setCreating(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Ticket list - cards on mobile */}
        <div className="space-y-3">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-8 text-[var(--kts-text-secondary)]">
              No tickets found.
            </div>
          ) : (
            tickets.map((t) => (
              <TicketRowItem key={t.id} ticket={t} onSelect={setSelected} />
            ))
          )}
        </div>
      </div>
    );
  }

  // Desktop view: table
  return (
    <div className="p-6 space-y-6" data-testid="ticketing-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-xl font-semibold">Ticketing</h1>
          <div className="text-sm opacity-70">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setCreating(!creating)}>
            {creating ? 'Cancel' : 'New Ticket'}
          </Button>
        </div>
      </div>

      {/* Error banner */}
      {data.offline_reason && data.offline_reason !== 'none' && (
        <ErrorBanner error={data.offline_reason} onRetry={() => refetch()} />
      )}

      {/* Quick add */}
      {creating && (
        <Card variant="subtle" className="p-4">
          <form onSubmit={handleCreateTicket} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <Label>Title</Label>
              <Input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.currentTarget.value)}
                placeholder="Ticket title"
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-col gap-1">
                <Label>Priority</Label>
                <select
                  value={createPriority}
                  onChange={(e) => setCreatePriority(e.currentTarget.value)}
                  className="border rounded px-2 py-1 text-sm w-full"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex-col gap-1">
                <Label>Client</Label>
                <Input
                  value={createClient}
                  onChange={(e) => setCreateClient(e.currentTarget.value)}
                  placeholder="Client (optional)"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="primary" onClick={handleCreateTicket} disabled={!createTitle.trim()}>
                Create
              </Button>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
        )}

        {/* Controls: filter, search, sort */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-[var(--kts-text-secondary)]">Status</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.currentTarget.value as any)}
              className="border rounded px-2 py-1 text-sm w-full"
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="picks">Picks</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-xs font-mono text-[var(--kts-text-secondary)]">Search</label>
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.currentTarget.value)}
              placeholder="Search id, title, client…"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-[var(--kts-text-secondary)]">Sort by</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.currentTarget.value as any)}
              className="border rounded px-2 py-1 text-sm w-full"
            >
              <option value="rating">Priority</option>
              <option value="capture_date">Capture date</option>
              <option value="edit_date">Edit date</option>
            </select>
          </div>
        </div>

        {/* Ticket table */}
        <Card variant="subtle" className="p-4">
          <table className="w-full text-sm" data-testid="ticket-table">
            <thead>
              <tr className="text-left border-b border-[var(--kts-border-default)]">
                <th className="p-3">ID</th>
                <th className="p-3">Title</th>
                <th className="p-3">Status</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Client</th>
                <th className="p-3 text-right">Hours</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-[var(--kts-border-default)] cursor-pointer hover:bg-[var(--kts-bg-tertiary)]"
                  onClick={() => setSelected(t)}
                  data-testid={`ticket-row-${t.id}`}
                >
                  <td className="p-3 font-mono">{t.id}</td>
                  <td className="p-3">{t.title}</td>
                  <td className="p-3">
                    <StatusChip status={t.status} />
                  </td>
                  <td className="p-3">
                    <PriorityChip priority={t.priority} />
                  </td>
                  <td className="p-3 font-mono">{t.client_id}</td>
                  <td className="p-3 text-right">{t.hours}</td>
                  <td className="p-3 text-right">{t.total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    );
  }
