// Ticketing page (W1/W2)
// Mobile-first, reuse existing UI components (Card, Badge, Input, Button, Label).
// No @tauri-apps imports — data flows through src/lib/api.ts (same origin,
// API under /api). Identity comes from the bridge (X-API-Token or the
// Tailscale-User-Login header it trusts from loopback, W3).
// No new libraries.

import { ChevronDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '../layout/PageHeader';
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
  offline_reason: 'none' | 'unreachable' | 'unauthorized' | 'bad_response' | 'other';
}

const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);
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
          <Button className="min-h-[44px] min-w-[44px]" variant="outline" size="sm" onClick={onRetry}>
            Retry
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

// ------------------------------------------------------------------ */
/* TicketingPage                                                      */
/* ------------------------------------------------------------------ */

export function TicketingPage() {
  const [data, setData] = useState<TicketOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
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
      // No due-date field in the data model; sort by updated_at as a proxy.
      result = result.sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
    } else if (sortBy === 'updated') {
      result = result.sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
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
              client_id: t.client_name ?? '',
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
          setListError(err instanceof Error ? err.message : 'Failed to load tickets');
          setLoading(false);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    try {
      const res = await listTickets();
      setData({
        tickets: res.tickets.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          client_id: t.client_name ?? '',
          priority: t.priority ?? 'medium',
          hours: 0,
          total: 0,
          invoice_number: null,
          no_charge: false,
        })),
        offline_reason: 'none',
      });
    } catch (err) {
      console.error('[ticketing] refetch failed:', err);
      const offline: TicketOverview = {
        tickets: [],
        offline_reason: (err as { status?: number }).status === 401 ? 'unauthorized' : 'unreachable',
      };
      setData(offline);
    }
  }, []);

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
      await refetch();
      const refreshed = await listTickets();
      setSelected(
        refreshed.tickets
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            client_id: t.client_name ?? '',
            priority: t.priority ?? 'medium',
            hours: 0,
            total: 0,
            invoice_number: null,
            no_charge: false,
          }))
          .find((t) => t.id === selected.id) ?? selected,
      );
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
      await refetch();
      const refreshed = await listTickets();
      setSelected(
        refreshed.tickets
          .map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            client_id: t.client_name ?? '',
            priority: t.priority ?? 'medium',
            hours: 0,
            total: 0,
            invoice_number: null,
            no_charge: false,
          }))
          .find((t) => t.id === selected.id) ?? selected,
      );
      setEditTitle(selected.title);
      setEditStatus(selected.status);
      setEditPriority(selected.priority ?? '');
    } catch (err) {
      console.error('[ticketing] update failed:', err);
      alert(`Failed to update: ${err}`);
    }
  };

  // Selected ticket detail panel (inline edit + worklog + status change)
  const detailPanel = selected ? (
    <Card variant="subtle" className="p-4 space-y-4" data-testid="ticket-detail">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Ticket {selected.id}</h2>
        <Button className="min-h-[44px] min-w-[44px]" variant="outline" size="sm" onClick={() => setSelected(null)}>
          Close
        </Button>
      </div>

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
    const openCount = filteredTickets.filter((t) => !CLOSED_STATUSES.has(t.status)).length;
    return `${openCount} open`;
  }, [filteredTickets]);

  const offline_reason = data?.offline_reason ?? 'none';

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
            <ErrorBanner error={listError} onRetry={() => refetch()} />
          </div>
        ) : (
          <>
            {offline_reason !== 'none' && (
              <div className="pt-6 pr-6 pb-2 pl-6">
                <ErrorBanner error={offline_reason} onRetry={() => refetch()} />
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
                    <Button variant="primary" onClick={handleCreateTicket} disabled={!createTitle.trim()}>
                      Create
                    </Button>
                    <Button variant="outline" onClick={() => setCreating(false)}>
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
              <div className="relative">
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.currentTarget.value as any)}
                  className="border rounded px-2 py-1 text-sm w-full pr-8"
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="mine">Mine</option>
                  <option value="waiting">Waiting</option>
                  <option value="closed">Closed</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] size-4 pointer-events-none" />
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
            {filteredTickets.length === 0 && (
              <div className="pt-6 pr-6 pb-6 pl-6 text-center py-8 text-[var(--kts-text-secondary)]">
                No tickets found.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
