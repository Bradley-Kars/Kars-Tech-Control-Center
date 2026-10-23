// MC-1b — Ticketing section with live sandbox bridge + OFF-1 fallback with distinct states.

import { useEffect, useMemo, useState } from 'react';
import { Card } from '../ui/Card';
import { Badge, StatusBadge } from '../ui/Badge';
import { invoke } from '@tauri-apps/api/core';

interface TicketRow {
  id: string;
  title: string;
  status: string;
  client_id: string;
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

type OfflineReason = 'none' | 'unreachable' | 'unauthorized' | 'bad_response';

interface TicketingOverview {
  overview: Overview;
  tickets: TicketRow[];
  invoices: InvoiceRow[];
  from_mock: boolean;
  offline_reason: 'none' | 'unreachable' | 'unauthorized' | 'bad_response';
}

const BRIDGE_URL_DEFAULT = 'http://127.0.0.1:8799';

function StatCard({ label, value, tone }: { label: string; value: number | string; tone?: 'default' | 'amber' | 'red' }) {
  return (
    <Card variant={tone ?? 'subtle'} className="flex-1 min-w-[140px]" data-testid={`stat-${label.toLowerCase()}`}>
      <div className="text-sm opacity-70">{label}</div>
      <div className="text-3xl font-semibold mt-1" data-testid={`stat-${label.toLowerCase()}-value`}>{value}</div>
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

export function TicketingPage() {
  const [data, setData] = useState<TicketingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<TicketRow | null>(null);

  useEffect(() => {
    let mounted = true;
    invoke<TicketingOverview>('ticketing_overview')
      .then((res) => {
        if (mounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.error('[ticketing] invoke failed:', err);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

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

  // Live bridge doesn't send hours/total/invoice_number - detect live data
  const isLiveData = !from_mock && offline_reason === 'none';

  return (
    <div className="p-6 space-y-6" data-testid="ticketing-page">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold">Ticketing</h1>
        <div className="flex items-center gap-2">
          {from_mock && <Badge variant="info">MC-1 · mock data</Badge>}
          {!from_mock && <Badge variant="success">MC-1b · live bridge</Badge>}
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

      {/* Cards */}
      <div className="flex flex-wrap gap-4">
        <StatCard label="Open" value={overview.open} />
        <StatCard label="Critical" value={overview.critical} tone={overview.critical > 0 ? 'red' : undefined} />
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
          <div className="text-sm opacity-70 mb-1">Selected</div>
          <div className="font-mono">{selected.id}</div>
          <div>{selected.title}</div>
          <div className="mt-1">
            invoice:{' '}
            {isLiveData ? 'n/a' : invoices.find((i) => i.ticket_id === selected.id)?.number ?? 'none'}
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
            Current mode: {from_mock ? 'MC-1 (mock)' : data?.offline_reason && data.offline_reason !== 'none' ? 'OFF-1 (' + offlineReasonLabel(data.offline_reason) + ')' : 'MC-1b (live)'}.
          </div>
        </div>
      </Card>
    </div>
  );
}
