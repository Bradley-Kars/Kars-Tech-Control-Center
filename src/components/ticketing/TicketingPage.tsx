// MC-1b — Ticketing section backed by the KTS bridge API (fetch, W2/W3).
// No @tauri-apps imports: data flows through src/lib/api.ts (same origin,
// API under /api). Identity comes from the bridge (X-API-Token or the
// Tailscale-User-Login header it trusts from loopback, W3).

import { useEffect, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge, StatusBadge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import {
  addWorklog,
  changeTicketStatus,
  createTicket,
  listTickets,
  type CreateTicketInput,
  type TicketSummary,
  type WorklogEntryInput,
} from '../../lib/api';

interface TicketRow {
  id: string;
  title: string;
  status: string;
  client_id: string;
  priority?: string;
  hours: number;
  total: number;
  invoice_number: string | null;
  no_charge: boolean;
}

interface InvoiceRow {
  number: string;
  ticket_id: string;
  total: number;
  no_charge: boolean;
}

interface Overview {
  open: number;
  critical: number;
  overdue: number;
  tickets_total: number;
  invoices_total: number;
  collected: number;
  outstanding: number;
}

interface TicketingOverview {
  overview: Overview;
  tickets: TicketRow[];
  invoices: InvoiceRow[];
  from_mock: boolean;
  offline_reason: 'none' | 'unreachable' | 'unauthorized' | 'bad_response';
}

const BRIDGE_URL_DEFAULT = 'http://127.0.0.1:8799';

const CLOSED_STATUSES = new Set(['closed', 'cancelled', 'resolved']);

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: 'default' | 'amber' | 'red';
}) {
  return (
    <Card variant={tone ?? 'subtle'} className="flex-1 min-w-[140px]" data-testid={`stat-${label.toLowerCase()}`}>
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-3xl font-semibold mt-1" data-testid={`stat-${label.toLowerCase()}-value`}>
        {value}
      </div>
    </Card>
  );
}

function offlineReasonLabel(reason: string): string {
  switch (reason) {
    case 'unreachable':
      return 'Unreachable (network/timeout)';
    case 'unauthorized':
      return 'Unauthorized (401)';
    case 'bad_response':
      return 'Bad response (parse/format error)';
    default:
      return 'Unknown';
  }
}

function mapOverview(tickets: TicketSummary[]): TicketingOverview {
  const rows: TicketRow[] = tickets.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    client_id: t.client_name ?? '',
    priority: t.priority,
    hours: 0,
    total: 0,
    invoice_number: null,
    no_charge: false,
  }));

  const open = rows.filter((t) => !CLOSED_STATUSES.has(t.status)).length;
  const critical = rows.filter((t) => t.priority === 'critical').length;

  const overview: Overview = {
    open,
    critical,
    overdue: 0,
    tickets_total: rows.length,
    invoices_total: 0,
    collected: 0,
    outstanding: 0,
  };

  return {
    overview,
    tickets: rows,
    invoices: [],
    from_mock: false,
    offline_reason: 'none',
  };
}

export function TicketingPage() {
  const [data, setData] = useState<TicketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createPriority, setCreatePriority] = useState('medium');
  const [createCategory, setCreateCategory] = useState('');
  const [worklogEntry, setWorklogEntry] = useState('');
  const [worklogHours, setWorklogHours] = useState(0.5);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await listTickets();
        if (mounted) {
          setData(mapOverview(res.tickets));
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error('[ticketing] list failed:', err);
          const offline: TicketingOverview = {
            overview: {
              open: 0,
              critical: 0,
              overdue: 0,
              tickets_total: 0,
              invoices_total: 0,
              collected: 0,
              outstanding: 0,
            },
            tickets: [],
            invoices: [],
            from_mock: false,
            offline_reason: (err as { status?: number }).status === 401 ? 'unauthorized' : 'unreachable',
          };
          setData(offline);
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refetch = async (): Promise<void> => {
    try {
      const res = await listTickets();
      setData(mapOverview(res.tickets));
    } catch (err) {
      console.error('[ticketing] refetch failed:', err);
    }
  };

  // Create ticket
  const handleCreateTicket = async () => {
    if (!createTitle.trim()) return;
    try {
      const input: CreateTicketInput = {
        title: createTitle,
        priority: createPriority,
        category: createCategory || undefined,
      };
      await createTicket(input);
      setCreateTitle('');
      setCreatePriority('medium');
      setCreateCategory('');
      setCreating(false);
      await refetch();
    } catch (err) {
      console.error('[ticketing] create failed:', err);
      alert(`Failed to create ticket: ${err}`);
    }
  };

  // Add worklog entry
  const handleAddWorklog = async () => {
    if (!selected) return;
    if (!worklogEntry.trim()) return;
    try {
      const input: WorklogEntryInput = {
        entry: worklogEntry,
        hours: worklogHours,
        payment: 'uninvoiced',
      };
      await addWorklog(selected.id, input);
      setWorklogEntry('');
      setWorklogHours(0.5);
      await refetch();
      const refreshed = await listTickets();
      setSelected(mapOverview(refreshed.tickets).tickets.find((t) => t.id === selected.id) ?? null);
    } catch (err) {
      console.error('[ticketing] worklog failed:', err);
      alert(`Failed to add worklog: ${err}`);
    }
  };

  // Change ticket status
  const handleChangeStatus = async (newStatus: string) => {
    if (!selected) return;
    try {
      await changeTicketStatus(selected.id, newStatus);
      await refetch();
      const refreshed = await listTickets();
      setSelected(
        mapOverview(refreshed.tickets).tickets.find((t) => t.id === selected.id) ?? selected,
      );
    } catch (err) {
      console.error('[ticketing] status change failed:', err);
      alert(`Failed to change status: ${err}`);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6" data-testid="ticketing-page">
        <div className="text-center opacity-50">Loading ticketing…</div>
      </div>
    );
  }

  const { overview, tickets, invoices, from_mock, offline_reason } = data ?? {
    overview: { open: 0, critical: 0, overdue: 0, tickets_total: 0, invoices_total: 0, collected: 0, outstanding: 0 },
    tickets: [],
    invoices: [],
    from_mock: true,
    offline_reason: 'none',
  };

  // Live data carries no hours/total/invoice_number — detect and show n/a
  // rather than fabricating money figures.
  const isLiveData = !from_mock && offline_reason === 'none';

  return (
    <div className="p-6 space-y-6" data-testid="ticketing-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Ticketing</h1>
        <div className="flex items-center gap-2">
          {from_mock && <Badge variant="info">MC-1 · mock data</Badge>}
          {!from_mock && <Badge variant="success">MC-1b · live bridge</Badge>}
          <Button onClick={() => setCreating(!creating)}>
            {creating ? 'Cancel' : 'New Ticket'}
          </Button>
        </div>
      </div>

      {/* OFF-1 offline banner with specific reason */}
      {data?.offline_reason && data.offline_reason !== 'none' && (
        <Card variant="amber" className="p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠</span>
            <div>
              <div className="font-semibold">
                OFF-1 — {offlineReasonLabel(data.offline_reason)}
              </div>
              <div className="text-sm opacity-80">
                Could not reach the ticketing bridge at <code>127.0.0.1:8799</code>. Showing mock data as fallback.
                Configure the bridge URL and token in <code>~/.config/master-control/config.private.json</code> and set
                <code>use_live_bridge: true</code> to enable live data.
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Create ticket form */}
      {creating && (
        <Card variant="subtle" className="p-4">
          <div className="text-sm font-semibold mb-2">New Ticket</div>
          <div className="space-y-2">
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
                  className="border rounded px-2 py-1 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="flex-col gap-1">
                <Label>Category</Label>
                <Input
                  value={createCategory}
                  onChange={(e) => setCreateCategory(e.currentTarget.value)}
                  placeholder="e.g. support, hardware, network"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-2">
              <Button onClick={handleCreateTicket} disabled={!createTitle.trim()}>
                Create
              </Button>
              <Button
                onClick={() => {
                  setCreating(false);
                  setCreateTitle('');
                  setCreatePriority('medium');
                  setCreateCategory('');
                }}
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Cards */}
      <div className="flex flex-wrap gap-4">
        <StatCard label="Open" value={overview.open} />
        <StatCard
          label="Critical"
          value={overview.critical}
          tone={overview.critical > 0 ? 'red' : undefined}
        />
        {/* Live data carries no hours/total/due-date, so "overdue" cannot be computed:
            show n/a rather than a fabricated 0. Same for Collected below. */}
        <StatCard
          label="Overdue"
          value={isLiveData ? 'n/a' : overview.overdue}
          tone={!isLiveData && overview.overdue > 0 ? 'amber' : undefined}
        />
        <StatCard label="Tickets" value={overview.tickets_total} />
        <StatCard label="Invoices" value={overview.invoices_total} />
        <StatCard label="Collected" value={isLiveData ? 'n/a' : overview.collected} />
      </div>

      {/* Ticket list */}
      <Card padded={false}>
        <table className="w-full text-sm" data-testid="ticket-table">
          <thead>
            <tr className="text-left border-b border-[var(--kts-border-default)]">
              <th className="p-3">Ticket</th>
              <th className="p-3">Title</th>
              <th className="p-3">Status</th>
              <th className="p-3">Client</th>
              <th className="p-3 text-right">Hours</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3">Invoice</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => {
              const inv = invoices.find((i) => i.ticket_id === t.id) ?? null;
              const isLive = isLiveData;
              return (
                <tr
                  key={t.id}
                  className="border-b border-[var(--kts-border-default)] cursor-pointer hover:bg-[var(--kts-bg-tertiary)]"
                  onClick={() => setSelected(t)}
                  data-testid={`ticket-row-${t.id}`}
                >
                  <td className="p-3 font-mono">{t.id}</td>
                  <td className="p-3">{t.title}</td>
                  <td className="p-3">
                    <StatusBadge state={t.status === 'closed' ? 'stopped' : 'unknown'} label={t.status} />
                  </td>
                  <td className="p-3 font-mono">{t.client_id}</td>
                  <td className="p-3 text-right">{isLive ? 'n/a' : t.hours}</td>
                  <td className="p-3 text-right">{isLive ? 'n/a' : t.total.toFixed(2)}</td>
                  <td className="p-3 font-mono">
                    {inv && !isLive ? (
                      <span>
                        {inv.number}
                        {inv.no_charge && <Badge variant="subtle" className="ml-2">no-charge</Badge>}
                      </span>
                    ) : (
                      <span className="opacity-50">{isLive ? 'n/a' : '—'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Detail strip */}
      {selected && (
        <Card variant="dual" data-testid="ticket-detail">
          <div className="text-sm font-semibold mb-2">Selected</div>
          <div className="font-mono">{selected.id}</div>
          <div>{selected.title}</div>
          <div className="mt-1">
            invoice:{' '}
            {isLiveData ? 'n/a' : invoices.find((i) => i.ticket_id === selected.id)?.number ?? 'none'}
          </div>
          <div className="mt-2">
            Status:{' '}
            <select
              value={selected.status}
              onChange={(e) => handleChangeStatus(e.currentTarget.value)}
            >
              <option value="new">New</option>
              <option value="triaged">Triaged</option>
              <option value="in-progress">In Progress</option>
              <option value="waiting">Waiting</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="mt-2">
            <div className="text-sm font-semibold mb-1">Worklog</div>
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1">
                <Label>Entry</Label>
                <Input
                  value={worklogEntry}
                  onChange={(e) => setWorklogEntry(e.currentTarget.value)}
                  placeholder="Describe the work done"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Hours</Label>
                <Input
                  type="number"
                  value={worklogHours}
                  onChange={(e) => setWorklogHours(parseFloat(e.currentTarget.value) || 0.5)}
                />
              </div>
              <Button
                onClick={() => {
                  if (!worklogEntry.trim()) return;
                  handleAddWorklog();
                }}
              >
                Add Worklog
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Settings placeholder (design only — token never enters the frontend) */}
      <Card variant="subtle" data-testid="ticketing-settings">
        <div className="text-sm font-semibold mb-1">Bridge connection</div>
        <div className="text-sm opacity-70 space-y-1">
          <div>Default URL: <code>{BRIDGE_URL_DEFAULT}</code> (loopback only).</div>
          <div>
            MC-1b reads the bridge URL and token from <code>~/.config/master-control/config.private.json</code>
            (mode 0o600). Token never enters the frontend, never in servers.json, never logged.
          </div>
          <div>
            Set <code>use_live_bridge: true</code> and provide <code>bridge_token</code> to enable live data.
            Current mode:{' '}
            {from_mock
              ? 'MC-1 (mock)'
              : data?.offline_reason && data.offline_reason !== 'none'
              ? 'OFF-1 (' + offlineReasonLabel(data.offline_reason) + ')'
              : 'MC-1b (live)'}.
          </div>
        </div>
      </Card>
    </div>
  );
}
