// Ticketing page (W1/W2)
// Mobile-first, reuse existing UI components (Card, Badge, Input, Button, Label).
// No desktop-app imports — data flows through src/lib/api.ts (same origin,
// API under /api). Identity comes from the bridge (X-API-Token or the
// Tailscale-User-Login header it trusts from loopback, W3).
// No new libraries.

import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../layout/PageHeader';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { AuthRequired } from '../shared/AuthRequired';
import {
  addWorklog,
  changeTicketStatus,
  createTicket,
  generateInvoice,
  getTicketDetail,
  listTickets,
  updateTicket,
  type CreateTicketInput,
  type InvoiceResult,
  type TicketDetail,
  type TicketSummary,
  type TicketsResponse,
  type WorklogEntryInput,
  type WorklogEntryView,
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
  due_date?: string | null;
  updated_at?: string | null;
}

/** Ascending date sort; nulls sort last. Stable for equal keys. */
function compareDate(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

/** Descending date sort (newest first); nulls sort last. Stable for equal keys. */
function compareDateDesc(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b.localeCompare(a);
}

interface TicketOverview {
  tickets: TicketRow[];
  offline_reason: 'none' | 'unreachable' | 'unauthorized' | 'bad_response' | 'other';
}

const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);
const WAITING_STATUSES = new Set(['waiting', 'pending']);

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Map a TicketSummary from the bridge into a TicketRow for the UI. */
function toTicketRow(t: TicketSummary): TicketRow {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    client_id: t.client_name ?? '',
    priority: t.priority ?? 'medium',
    due_date: t.due_date ?? null,
    updated_at: t.updated_at ?? null,
    hours: 0,
    total: 0,
    invoice_number: null,
    no_charge: false,
  };
}

/** True when the filter needs every ticket (including closed/cancelled/resolved), so the request must ask for ?all=true. */
function filterNeedsAllTickets(value: 'all' | 'open' | 'mine' | 'waiting' | 'closed'): boolean {
  return value === 'all' || value === 'closed';
}

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
          <Button className="min-h-[44px] min-w-[44px]" variant="outline" size="sm" onClick={onRetry}>
            Retry loading
          </Button>
        </div>
      </div>
    </Card>
  );
}

function TicketRowItem({ ticket, onSelect }: { ticket: TicketRow; onSelect: (t: TicketRow) => void }) {
  const isClosed = CLOSED_STATUSES.has(ticket.status);
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

/** One worklog entry row in the ticket detail view. */
function WorklogEntryRow({ entry }: { entry: WorklogEntryView }) {
  return (
    <div className="border-b border-[var(--kts-border-default)] pb-3 pt-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-start gap-3 text-sm">
        <div className="font-mono text-[var(--kts-text-secondary)]">{entry.date}</div>
        <span className="text-xs px-1.5 py-0.5 rounded border border-[var(--kts-border-default)] text-[var(--kts-text-tertiary)]">{entry.mode}</span>
        <span className="font-mono text-right w-12">{entry.hours.toFixed(2)}h</span>
        <span className="font-mono text-right w-14">${entry.amount.toFixed(2)}</span>
        <span className="text-xs text-[var(--kts-text-tertiary)]">{entry.payment}</span>
      </div>
      {entry.description && (
        <div className="mt-1 text-sm text-[var(--kts-text-secondary)] whitespace-pre-wrap break-words">
          {entry.description}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ */
/* TicketingPage                                                      */
/* ------------------------------------------------------------------ */

export function TicketingPage() {
  const [data, setData] = useState<TicketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  interface ApiErrorInfo {
    message: string;
    status: number | null;
  }
  const [listError, setListError] = useState<ApiErrorInfo | null>(null);
  const [refetchError, setRefetchError] = useState<ApiErrorInfo | null>(null);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createClient, setCreateClient] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');

  // Inline edit state for the selected ticket
  const [editTitle, setEditTitle] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPriority, setEditPriority] = useState('');

  // Worklog state for the selected ticket
  const [worklogEntry, setWorklogEntry] = useState('');
  const [worklogHours, setWorklogHours] = useState('0.5');

  // Ticket detail state (fetched when a ticket is selected)
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<'all' | 'open' | 'mine' | 'waiting' | 'closed'>('all');
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'due' | 'updated'>('priority');

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
      } else if (filterStatus === 'mine') {
        // No assignee field in the data model yet; treat "mine" as open tickets.
        result = result.filter((t) => !CLOSED_STATUSES.has(t.status));
      } else if (filterStatus === 'waiting') {
        result = result.filter((t) => WAITING_STATUSES.has(t.status));
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
    if (sortBy === 'priority') {
      result = result.sort((a, b) => {
        const pa = PRIORITY_ORDER[a.priority ?? 'medium'] ?? 1;
        const pb = PRIORITY_ORDER[b.priority ?? 'medium'] ?? 1;
        return pa - pb;
      });
    } else if (sortBy === 'due') {
      // Earliest due date first; undated tickets sort last.
      result = result.sort((a, b) => compareDate(a.due_date ?? null, b.due_date ?? null));
    } else if (sortBy === 'updated') {
      // Most recently updated first; never-updated tickets sort last.
      result = result.sort((a, b) => compareDateDesc(a.updated_at ?? null, b.updated_at ?? null));
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

  // Fetch tickets on mount, and re-fetch when the status filter changes
  // ('all' and 'closed' need every ticket, so they request ?all=true).
  useEffect(() => {
    let mounted = true;
    const all = filterNeedsAllTickets(filterStatus);
    (async () => {
      try {
        setLoading(true);
        const res = await listTickets(undefined, all ? { all: true } : undefined);
        if (mounted) {
          setData({
            tickets: res.tickets.map(toTicketRow),
            offline_reason: 'none',
          });
        }
      } catch (err) {
        if (mounted) {
          console.error('[ticketing] list failed:', err);
          const e = err as { status?: number; message?: string };
          setListError({ message: e.message ?? 'Failed to load tickets', status: e.status ?? null });
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [filterStatus]);

  const refetch = useCallback(async (): Promise<TicketsResponse | null> => {
    try {
      const all = filterNeedsAllTickets(filterStatus);
      const res = await listTickets(undefined, all ? { all: true } : undefined);
      setData({
        tickets: res.tickets.map(toTicketRow),
        offline_reason: 'none',
      });
      setRefetchError(null);
      return res;
    } catch (err) {
      console.error('[ticketing] refetch failed:', err);
      const e = err as { status?: number; message?: string };
      setRefetchError({ message: e.status === 401 ? 'Unauthorized' : 'Unreachable', status: e.status ?? null });
      return null;
    }
  }, [filterStatus]);

  // Fetch full ticket detail when a ticket is selected.
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let mounted = true;
    setDetailLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const d = await getTicketDetail(selected.id);
        if (mounted) {
          setDetail(d);
          setDetailLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setDetailError(err instanceof Error ? err.message : 'Failed to load ticket detail');
          setDetailLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selected]);

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
    if (!worklogEntry.trim()) return;
    try {
      const input: WorklogEntryInput = {
        entry: worklogEntry,
        hours: parseFloat(worklogHours || '0.5') || 0.5,
        payment: 'uninvoiced',
      };
      await addWorklog(selected.id, input);
      setWorklogEntry('');
      setWorklogHours('0.5');
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
      const refreshed = await refetch();
      if (refreshed) {
        setSelected(
          refreshed.tickets.map(toTicketRow).find((t) => t.id === selected.id) ?? selected,
        );
      }
    } catch (err) {
      console.error('[ticketing] status change failed:', err);
      alert(`Failed to change status: ${err}`);
    }
  };

  // Update ticket inline
  const handleUpdateTicket = async () => {
    if (!selected) return;
    const fields: Record<string, unknown> = {};
    if (editTitle.trim() && editTitle !== selected.title) fields.title = editTitle.trim();
    if (editPriority && editPriority !== (selected.priority ?? '')) fields.priority = editPriority;
    if (Object.keys(fields).length === 0) return;
    try {
      await updateTicket(selected.id, fields);
      const refreshed = await refetch();
      if (refreshed) {
        setSelected(
          refreshed.tickets.map(toTicketRow).find((t) => t.id === selected.id) ?? selected,
        );
      }
      setEditTitle(selected.title);
      setEditStatus(selected.status);
      setEditPriority(selected.priority ?? '');
    } catch (err) {
      console.error('[ticketing] update failed:', err);
      alert(`Failed to update: ${err}`);
    }
  };

  // Selected ticket detail panel (inline edit + worklog + status change + invoice)
  const detailPanel = selected ? (
    <Card variant="subtle" className="p-4 space-y-5" data-testid="ticket-detail">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ticket {selected.id}</h2>
        <Button className="min-h-[44px] min-w-[44px]" variant="outline" size="sm" onClick={() => setSelected(null)}>
          Close
        </Button>
      </div>

      {/* Detail header: status, client, priority */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div className="flex flex-col gap-1">
          <Label className="text-[var(--kts-text-tertiary)] text-xs uppercase">Status</Label>
          <StatusChip status={selected.status} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[var(--kts-text-tertiary)] text-xs uppercase">Client</Label>
          <span className="font-mono">{selected.client_id}</span>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[var(--kts-text-tertiary)] text-xs uppercase">Priority</Label>
          <PriorityChip priority={selected.priority} />
        </div>
      </div>

      {/* Description: full text, line breaks preserved */}
      {detail && (
        <div className="border border-[var(--kts-border-default)] rounded-lg p-4 bg-[var(--kts-bg-tertiary)]">
          <Label className="text-[var(--kts-text-tertiary)] text-xs uppercase block mb-2">Description</Label>
          <div className="text-sm text-[var(--kts-text-secondary)] whitespace-pre-wrap break-words" data-testid="ticket-description">
            {detail.description || 'No description recorded.'}
          </div>
        </div>
      )}

      {!detail && detailLoading && (
        <div className="py-4 text-center text-[var(--kts-text-tertiary)] text-sm">Loading ticket detail…</div>
      )}
      {detailError && (
        <div className="p-3 rounded bg-[var(--kts-bg-error)] text-[var(--kts-text-error-on)] text-sm border border-[var(--kts-border-error)]">
          {detailError}
        </div>
      )}

      {/* Worklog entries */}
      {detail && detail.worklog.length > 0 && (
        <div className="border border-[var(--kts-border-default)] rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <Label className="text-[var(--kts-text-tertiary)] text-xs uppercase">Worklog ({detail.worklog.length})</Label>
            <span className="font-mono text-sm text-[var(--kts-text-secondary)]">
              {detail.hours.toFixed(2)}h • ${detail.total.toFixed(2)}
            </span>
          </div>
          <div className="space-y-0" data-testid="worklog-list">
            {detail.worklog.map((entry, i) => (
              <WorklogEntryRow key={i} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Invoice action */}
      {detail && (
        <div className="flex items-center gap-3 border-t pt-4">
          <Button
            className="min-h-[44px] min-w-[44px]"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!selected) return;
              try {
                const inv: InvoiceResult = await generateInvoice(selected.id);
                alert(`Invoice ${inv.invoice_id} created for $${inv.amount.toFixed(2)}`);
              } catch (err) {
                alert(`Failed to generate invoice: ${err}`);
              }
            }}
            data-testid="generate-invoice"
          >
            Generate Invoice
          </Button>
          <span className="flex-1 text-[var(--kts-text-tertiary)] text-sm">
            Invoice not yet generated for this ticket.
          </span>
        </div>
      )}

      {/* Existing inline edit form */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-2">
          <Label>Title</Label>
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.currentTarget.value)}
            data-testid="edit-title"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <div className="relative">
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.currentTarget.value)}
              className="border rounded px-2 py-1 text-sm w-full pr-8"
              data-testid="edit-status"
            >
              <option value="new">New</option>
              <option value="open">Open</option>
              <option value="in-progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="closed">Closed</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] size-4 pointer-events-none" />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Priority</Label>
          <div className="relative">
            <select
              value={editPriority}
              onChange={(e) => setEditPriority(e.currentTarget.value)}
              className="border rounded px-2 py-1 text-sm w-full pr-8"
              data-testid="edit-priority"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] size-4 pointer-events-none" />
          </div>
        </div>
      </div>

      <Button className="min-h-[44px] min-w-[44px]" variant="primary" onClick={handleUpdateTicket} data-testid="save-ticket">
        Save changes
      </Button>

      <Button
        className="min-h-[44px] min-w-[44px]"
        variant="danger"
        size="sm"
        onClick={() => handleChangeStatus(editStatus || selected.status)}
        data-testid="change-status"
      >
        Change status to {editStatus || selected.status}
      </Button>

      {/* Add worklog form */}
      <div className="border-t pt-4">
        <h3 className="text-sm font-semibold mb-2">Add worklog</h3>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1 min-w-0">
            <Label>Entry</Label>
            <Input
              value={worklogEntry}
              onChange={(e) => setWorklogEntry(e.currentTarget.value)}
              placeholder="Work done…"
              data-testid="worklog-entry"
            />
          </div>
          <div className="w-full md:w-24">
            <Label>Hours</Label>
            <Input
              type="number"
              value={worklogHours}
              onChange={(e) => setWorklogHours(e.currentTarget.value)}
              data-testid="worklog-hours"
            />
          </div>
          <Button className="min-h-[44px] min-w-[44px]"
            variant="primary"
            onClick={handleAddWorklog}
            disabled={!worklogEntry.trim()}
            data-testid="add-worklog"
          >
            Add
          </Button>
        </div>
      </div>
    </Card>
  ) : null;

  const subtitle = useMemo(() => {
    const openCount = (data?.tickets ?? []).filter((t) => !CLOSED_STATUSES.has(t.status)).length;
    return `${openCount} open`;
  }, [data]);

  return (
    <div className="flex flex-col h-full min-w-0" data-testid="ticketing-page">
      <PageHeader
        title="Ticketing"
        description={subtitle}
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreating(!creating)}>
            {creating ? 'Cancel' : 'New Ticket'}
          </Button>
        }
      />

      <div className="flex-1 min-w-0 overflow-y-auto">
        {loading ? (
          <div className="px-6 pt-6 pb-6 pl-6 text-center opacity-50">
            Loading ticketing…
          </div>
        ) : !data && listError ? (
          <div className="px-6 pt-6 pb-6 pl-6">
            {listError.status === 401 ? (
              <AuthRequired />
            ) : (
              <ErrorBanner error={listError.message} onRetry={() => refetch()} />
            )}
          </div>
        ) : (
          <>
            {refetchError && (
              <div className="pt-6 pr-6 pb-2 pl-6">
                {refetchError.status === 401 ? (
                  <AuthRequired />
                ) : (
                  <ErrorBanner error={refetchError.message} onRetry={() => refetch()} />
                )}
              </div>
            )}

            {creating && (
              <div className="pt-2 pr-6 pb-2 pl-6">
                <form onSubmit={handleCreateTicket} className="space-y-4">
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
                      <div className="relative">
                        <select
                          value={createPriority}
                          onChange={(e) => setCreatePriority(e.currentTarget.value)}
                          className="border rounded px-2 py-1 text-sm w-full pr-8"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] size-4 pointer-events-none" />
                      </div>
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
                    <Button variant="primary" type="submit" disabled={!createTitle.trim()}>
                      Create
                    </Button>
                    <Button variant="outline" type="button" onClick={() => setCreating(false)}>
                      Cancel
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {detailPanel}

            {/* Controls: filter, search, sort */}
            <div className="flex flex-wrap gap-4 items-end pt-2 pr-6 pb-2 pl-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-mono text-[var(--kts-text-secondary)]">Status</label>
                <div className="flex gap-2" role="group" aria-label="Status filter">
                  {(['all', 'open', 'mine', 'waiting', 'closed'] as const).map((value) => (
                    <button
                      key={value}
                      data-testid={`filter-chip-${value}`}
                      aria-pressed={filterStatus === value}
                      onClick={() => setFilterStatus(value)}
                      className={`px-3 py-1 text-xs border border-[var(--kts-border-default)] rounded-md ${
                        filterStatus === value
                          ? 'bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-secondary)] font-medium opacity-100'
                          : 'bg-transparent text-[var(--kts-text-secondary)] opacity-70 hover:opacity-100'
                      }`}
                    >
                      {value.charAt(0).toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
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
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.currentTarget.value as any)}
                  className="border rounded px-2 py-1 text-sm w-full pr-8"
                >
                  <option value="priority">Priority</option>
                  <option value="due">Due</option>
                  <option value="updated">Updated</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] size-4 pointer-events-none" />
              </div>
              </div>
            </div>

            {/* Ticket table (desktop) */}
            {!isMobile && filteredTickets.length > 0 && (
              <div className="pt-2 pr-6 pb-6 pl-6">
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
                        <th className="p-3 text-right">Invoice</th>
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
                          <td className="p-3 font-mono text-right">{t.invoice_number ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            )}

            {/* Ticket cards (mobile) */}
            {isMobile && filteredTickets.length > 0 && (
              <div className="pt-6 pr-6 pb-6 pl-6 space-y-3">
                {filteredTickets.map((t) => (
                  <TicketRowItem key={t.id} ticket={t} onSelect={setSelected} />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!refetchError && filteredTickets.length === 0 && (
              <EmptyState message="No tickets found." />
            )}
          </>
        )}
      </div>
    </div>
  );
}
