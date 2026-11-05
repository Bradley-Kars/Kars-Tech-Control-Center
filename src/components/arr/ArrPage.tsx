import { useState, useEffect, useCallback } from 'react';
import type {
  ServerConfig,
  ArrApp,
  ArrStatus,
  ArrHealthIssue,
  ArrQueue,
  ArrWantedMissing,
} from '../../lib/types';
import {
  getArrStatus,
  getArrHealth,
  getArrQueue,
  getArrWanted,
} from '../../lib/fleet-api';

const APPS: { id: ArrApp; label: string }[] = [
  { id: 'lidarr', label: 'Lidarr' },
  { id: 'sonarr', label: 'Sonarr' },
  { id: 'radarr', label: 'Radarr' },
];

const API_KEY_FOR: Record<ArrApp, keyof NonNullable<ServerConfig['service_keys']>> = {
  lidarr: 'lidarr_api_key',
  sonarr: 'sonarr_api_key',
  radarr: 'radarr_api_key',
};

interface AppState {
  status: ArrStatus | null;
  health: ArrHealthIssue[];
  queue: ArrQueue | null;
  wanted: ArrWantedMissing | null;
}

function isConfigured(server: ServerConfig, app: ArrApp): boolean {
  const key = server.service_keys?.[API_KEY_FOR[app]];
  return typeof key === 'string' && key.length > 0;
}

/** One *arr tab: fetches status, health, queue and wanted/missing for a single app. */
function ArrAppSection({ app, server }: { app: ArrApp; server: ServerConfig }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);

  const fetchData = useCallback(async () => {
    const ok = isConfigured(server, app);
    setConfigured(ok);
    if (!ok) {
      setLoading(false);
      setState(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [statusRes, healthRes, queueRes, wantedRes] = await Promise.allSettled([
        getArrStatus(server.id, app),
        getArrHealth(server.id, app),
        getArrQueue(server.id, app),
        getArrWanted(server.id, app),
      ]);
      const failed = [statusRes, healthRes, queueRes, wantedRes].find((r) => r.status === 'rejected');
      if (failed) {
        const err = failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
        setError(err.message);
        setState(null);
        return;
      }
      setState({
        status: ((statusRes as PromiseFulfilledResult<ArrStatus>).value ?? null),
        health: ((healthRes as PromiseFulfilledResult<ArrHealthIssue[]>).value ?? []),
        queue: ((queueRes as PromiseFulfilledResult<ArrQueue>).value ?? null),
        wanted: ((wantedRes as PromiseFulfilledResult<ArrWantedMissing>).value ?? null),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [server.id, server.service_keys, app]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div data-testid="arr-loading" className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent" />
      </div>
    );
  }

  if (configured === false) {
    return (
      <div data-testid="arr-not-configured" className="card p-6 text-center">
        <h2 className="text-sm font-heading font-bold">{app} not configured</h2>
        <p className="text-sm text-muted">
          Add the {app} API key in Settings &rarr; Servers to view {app} status, health, queue and missing.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div data-testid="arr-error" className="card p-6 text-center">
        <h2 className="text-sm font-heading font-bold text-red">Failed to load {app}</h2>
        <p className="text-sm text-muted font-mono">{error}</p>
      </div>
    );
  }

  const s = state!;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Status</div>
          {s.status ? (
            <>
              <div className="text-xl font-heading font-bold">{s.status.instance_name}</div>
              <div className="text-xs text-muted">v{s.status.version} · {s.status.os_name}</div>
            </>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Health issues</div>
          <div className="text-xl font-heading font-bold">{s.health.length}</div>
          <div className="text-xs text-muted">
            {s.health.length === 0 ? 'No issues' : 'Needs attention'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Queue</div>
          {s.queue ? (
            <>
              <div className="text-xl font-heading font-bold">{s.queue.total_records}</div>
              <div className="text-xs text-muted">Items in queue</div>
            </>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Wanted / missing</div>
          {s.wanted ? (
            <>
              <div className="text-xl font-heading font-bold">{s.wanted.total_records}</div>
              <div className="text-xs text-muted">Missing items</div>
            </>
          ) : (
            <div className="text-sm text-muted">—</div>
          )}
        </div>
      </div>

      {s.health.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                <th className="p-3">Source</th>
                <th className="p-3">Issue</th>
                <th className="p-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {s.health.map((issue) => (
                <tr key={issue.message} className="border-b border-line/50">
                  <td className="p-3 text-sm text-muted">{issue.source || '—'}</td>
                  <td className="p-3 font-mono">{issue.issue_type}</td>
                  <td className="p-3 text-sm">{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ArrPage({ server }: { server: ServerConfig }) {
  const [activeApp, setActiveApp] = useState<ArrApp>('lidarr');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Arr</h1>
        <span className="text-xs text-muted font-mono">Lidarr · Sonarr · Radarr</span>
      </div>

      <div className="flex gap-2 border-b border-line mb-4 overflow-x-auto">
        {APPS.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiveApp(a.id)}
            className={`px-4 py-2 text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              activeApp === a.id
                ? 'text-teal border-b-2 border-teal'
                : 'text-muted hover:text-off'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <ArrAppSection app={activeApp} server={server} />
    </div>
  );
}
