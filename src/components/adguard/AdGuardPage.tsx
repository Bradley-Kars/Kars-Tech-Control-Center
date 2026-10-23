import { useState, useEffect } from 'react';
import {
  getAdGuardStatus,
  getAdGuardStats,
  getAdGuardQueryLog,
  getAdGuardClients,
  getAdGuardFilters,
  getAdGuardDhcp,
  adguardEnable,
  adguardDisable,
} from '../../lib/tauri-commands';
import type { ServerConfig } from '../../lib/types';

interface AdGuardStatus {
  version: string;
  dns_addresses: string[];
  config_hash: string;
  protection_enabled: boolean;
}

interface AdGuardStats {
  dns_queries: {
    total: number;
    blocked: number;
    replaced: number;
    safe_browsing: number;
    parental: number;
    avg_processing_time: number;
  };
  blocked: {
    domains: number;
    clients: number;
  };
  replaced: {
    domains: number;
    clients: number;
  };
  clients: {
    total: number;
    active: number;
  };
  filters: {
    total: number;
    enabled: number;
  };
}

interface AdGuardQueryLogEntry {
  filterId?: number | null;
  elapsedMs?: string;
  cached?: boolean;
  client?: string;
  client_info?: { name?: string; whois?: any; disallowed_rule?: string; disallowed?: boolean };
  client_proto?: string;
  reason?: string;
  rule?: string;
  rules?: Array<{ filter_list_id: number; text: string }>;
  status: string;
  time: string;
  upstream?: string;
  answer?: Array<{ type: string; value: string; ttl: number }>;
  answer_dnssec?: boolean;
  question?: { type: string; name: string; class: string };
}

interface AdGuardQueryLog {
  data: AdGuardQueryLogEntry[];
  limit: number;
  offset: number;
  total: number;
}

interface AdGuardDHCP {
  enabled: boolean;
  leases: Array<{
    ip: string;
    mac: string;
    hostname: string;
    expires: number;
    id: string;
  }>;
}

export function AdGuardPage({ server }: { server: ServerConfig }) {
  const [status, setStatus] = useState<AdGuardStatus | null>(null);
  const [stats, setStats] = useState<AdGuardStats | null>(null);
  const [queryLog, setQueryLog] = useState<AdGuardQueryLog | null>(null);
  const [clients, setClients] = useState<any | null>(null);
  const [filters, setFilters] = useState<any[]>([]);
  const [dhcp, setDhcp] = useState<AdGuardDHCP | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'clients' | 'filters' | 'dhcp'>('overview');
  const [logFilter, setLogFilter] = useState<'all' | 'blocked' | 'allowed'>('all');

  const fetchData = async (isInitial = false) => {
    if (isInitial) setLoading(true);
    setError(null);
    try {
      // Fetch each independently - don't use Promise.all so partial failures don't break everything
      const statusRes = await getAdGuardStatus(server.id).catch(e => { console.error('Status failed:', e); return null; });
      const statsRes = await getAdGuardStats(server.id).catch(e => { console.error('Stats failed:', e); return null; });
      const queryLogRes = await getAdGuardQueryLog(server.id, 50, 0).catch(e => { console.error('QueryLog failed:', e); return null; });
      const clientsRes = await getAdGuardClients(server.id).catch(e => { console.error('Clients failed:', e); return null; });
      const filtersRes = await getAdGuardFilters(server.id).catch(e => { console.error('Filters failed:', e); return null; });
      const dhcpRes = await getAdGuardDhcp(server.id).catch(e => { console.error('DHCP failed:', e); return null; });

      // Set each independently - partial success is better than nothing
      if (statusRes) setStatus(statusRes);
      if (statsRes) setStats(statsRes);
      if (queryLogRes) setQueryLog(queryLogRes);
      if (clientsRes) setClients(clientsRes);
      if (filtersRes) setFilters(filtersRes);
      if (dhcpRes) setDhcp(dhcpRes);

      // Track which calls failed
      const errors: string[] = [];
      if (!statusRes) errors.push('Status');
      if (!statsRes) errors.push('Stats');
      if (!queryLogRes) errors.push('QueryLog');
      if (!clientsRes) errors.push('Clients');
      if (!filtersRes) errors.push('Filters');
      if (!dhcpRes) errors.push('DHCP');

      if (errors.length > 0) {
        setError(`Failed to load: ${errors.join(', ')}`);
      }
    } catch (err) {
      console.error('Failed to fetch AdGuard data:', err);
      setError('Failed to fetch AdGuard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), 30000);
    return () => clearInterval(interval);
  }, [server.id]);

  const handleEnable = async () => {
    await adguardEnable(server.id);
    fetchData();
  };

  const handleDisable = async () => {
    await adguardDisable(server.id);
    fetchData();
  };

  const formatNumber = (num: number): string => num.toLocaleString();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono mb-4">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">AdGuard Home</h1>
        <div className="flex items-center gap-4">
          {status && (
            <>
              <span className={`px-2 py-1 text-xs font-mono rounded ${
                status.dns_addresses.length > 0 ? 'bg-green-500/20 text-green' : 'bg-red-500/20 text-red'
              }`}>
                {status.protection_enabled ? 'Protection Enabled' : 'Protection Disabled'}
              </span>
              {status.protection_enabled ? (
                <button onClick={handleDisable} className="btn btn-sm btn-ghost">
                  Disable
                </button>
              ) : (
                <button onClick={handleEnable} className="btn btn-sm btn-primary">
                  Enable
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">DNS Queries</div>
            <div className="text-2xl font-heading font-bold">{formatNumber(stats.dns_queries.total)}</div>
            <div className="text-xs text-muted">Total</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Blocked</div>
            <div className="text-2xl font-heading font-bold text-red">{formatNumber(stats.dns_queries.blocked)}</div>
            <div className="text-xs text-muted">{(stats.dns_queries.total > 0 ? (stats.dns_queries.blocked / stats.dns_queries.total * 100).toFixed(1) : 0)}%</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Replaced</div>
            <div className="text-2xl font-heading font-bold text-amber">{formatNumber(stats.dns_queries.replaced)}</div>
            <div className="text-xs text-muted">SafeSearch/SafeBrowsing</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Avg Response</div>
            <div className="text-2xl font-heading font-bold">{stats.dns_queries.avg_processing_time.toFixed(2)} ms</div>
            <div className="text-xs text-muted">Processing time</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Clients</div>
            <div className="text-2xl font-heading font-bold">{stats.clients.active} / {stats.clients.total}</div>
            <div className="text-xs text-muted">Active / Total</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-line mb-4">
        {['overview', 'queries', 'clients', 'filters', 'dhcp'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-mono capitalize transition-colors ${
              activeTab === tab
                ? 'text-teal border-b-2 border-teal'
                : 'text-muted hover:text-off'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-3">Blocked Domains</div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total Blocked</span>
                <span className="font-mono text-red">{formatNumber(stats.blocked.domains)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Clients Affected</span>
                <span className="font-mono">{formatNumber(stats.blocked.clients)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-red transition-all"
                  style={{ width: `${stats.dns_queries.total > 0 ? (stats.blocked.domains / stats.dns_queries.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-3">Filters</div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total Filters</span>
                <span className="font-mono">{stats.filters.total}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Enabled</span>
                <span className="font-mono text-green">{stats.filters.enabled}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-green transition-all"
                  style={{ width: `${stats.filters.total > 0 ? (stats.filters.enabled / stats.filters.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'queries' && queryLog && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <select
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value as typeof logFilter)}
              className="input input-sm w-auto font-mono text-sm"
            >
              <option value="all">All Queries</option>
              <option value="blocked">Blocked</option>
              <option value="allowed">Allowed</option>
            </select>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                  <th className="p-3">Time</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Domain</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Upstream</th>
                  <th className="p-3">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {queryLog.data
                  .filter(entry => {
                    const isBlocked = entry.reason?.startsWith('Filtered');
                    if (logFilter === 'blocked') return isBlocked;
                    if (logFilter === 'allowed') return !isBlocked;
                    return true;
                  })
                  .map((entry, idx) => (
                    <tr key={entry.filterId || entry.time || idx} className="border-b border-line/50 hover:bg-panel-2/50">
                      <td className="p-3 text-sm font-mono">
                        {entry.time ? new Date(entry.time).toLocaleTimeString() : '—'}
                      </td>
                      <td className="p-3 text-sm">
                        {entry.client || entry.client_info?.name || entry.client_info?.whois?.name || '—'}
                      </td>
                      <td className="p-3 font-mono text-sm truncate max-w-xs">
                        {entry.question?.name || '—'}
                      </td>
                      <td className="p-3 text-sm text-muted">{entry.question?.type || '—'}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 text-xs font-mono rounded ${
                          entry.reason?.startsWith('Filtered') ? 'bg-red-500/20 text-red' : 'bg-green-500/20 text-green'
                        }`}>
                          {entry.reason?.startsWith('Filtered') ? entry.reason : 'Allowed'}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-muted truncate max-w-xs">
                        {entry.upstream || '—'}
                      </td>
                      <td className="p-3 text-sm font-mono text-muted">
                        {entry.elapsedMs ? `${entry.elapsedMs} ms` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'clients' && clients && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">Name</th>
                <th className="p-4">IPs</th>
                <th className="p-4">Filtering</th>
                <th className="p-4">Parental</th>
                <th className="p-4">Safe Search</th>
                <th className="p-4">Safe Browsing</th>
                <th className="p-4">Global Settings</th>
              </tr>
            </thead>
            <tbody>
              {(clients.clients || []).map((client: any, idx: number) => (
                <tr key={idx} className="border-b border-line/50 hover:bg-panel-2/50">
                  <td className="p-4 font-mono">{client.name}</td>
                  <td className="p-4 text-sm font-mono">
                    {client.ids.join(', ')}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${client.filtering_enabled ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {client.filtering_enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${client.parental_enabled ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {client.parental_enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${client.safe_search.enabled ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {client.safe_search.enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${client.safebrowsing_enabled ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {client.safebrowsing_enabled ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${client.use_global_settings ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {client.use_global_settings ? 'Yes' : 'No'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'filters' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-4">Filter</th>
                <th className="p-4">Rules</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Updated</th>
                <th className="p-4">Error</th>
              </tr>
            </thead>
            <tbody>
              {filters.map((filter, idx) => (
                <tr key={idx} className="border-b border-line/50 hover:bg-panel-2/50">
                  <td className="p-4">
                    <div className="font-mono text-sm truncate max-w-md" title={filter.name}>{filter.name}</div>
                    <div className="text-xs text-muted truncate max-w-md" title={filter.url}>{filter.url}</div>
                  </td>
                  <td className="p-4 font-mono text-sm">{filter.rules_count.toLocaleString()}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-mono rounded ${filter.enabled ? 'bg-green-500/20 text-green' : 'bg-muted/20 text-muted'}`}>
                      {filter.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-muted">{filter.last_updated || 'Never'}</td>
                  <td className="p-4 text-sm text-red truncate max-w-xs">{filter.last_error || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'dhcp' && dhcp && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">DHCP Server</div>
                <div className={`font-heading font-bold ${dhcp.enabled ? 'text-green' : 'text-red'}`}>
                  {dhcp.enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
            </div>
          </div>
          {dhcp.leases.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                    <th className="p-4">IP Address</th>
                    <th className="p-4">MAC Address</th>
                    <th className="p-4">Hostname</th>
                    <th className="p-4">Expires</th>
                    <th className="p-4">ID</th>
                  </tr>
                </thead>
                <tbody>
                  {dhcp.leases.map((lease) => (
                    <tr key={lease.id} className="border-b border-line/50 hover:bg-panel-2/50">
                      <td className="p-4 font-mono">{lease.ip}</td>
                      <td className="p-4 font-mono text-sm">{lease.mac}</td>
                      <td className="p-4">{lease.hostname || 'Unknown'}</td>
                      <td className="p-4 text-sm text-muted">
                        {new Date(lease.expires * 1000).toLocaleString()}
                      </td>
                      <td className="p-4 text-sm text-muted font-mono">{lease.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}