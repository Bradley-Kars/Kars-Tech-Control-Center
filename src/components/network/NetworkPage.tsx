import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../../lib/types';
import { getNetworkInterfaces, getTailscalePeers } from '../../lib/fleet-api';
import { Skeleton } from '../ui/Skeleton';

interface Props { server: ServerConfig; }

export function NetworkPage({ server }: Props) {
  const [interfaces, setInterfaces] = useState('');
  const [tailscale, setTailscale] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [i, t] = await Promise.all([getNetworkInterfaces(server.id), getTailscalePeers(server.id)]);
      setInterfaces(i || '');
      setTailscale(t || '');
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">Network</h1>
        <button onClick={load} className="btn btn-ghost btn-sm">Refresh</button>
      </div>

      {error && (
        <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono">{error}</div>
      )}

      <div className="card p-4">
        <div className="kicker mb-3">Network Interfaces</div>
        {loading ? (
          <div data-testid="network-interfaces-loading">
            <Skeleton variant="text" lines={5} className="font-mono text-xs" />
          </div>
        ) : (
          <pre className="font-mono text-xs text-muted whitespace-pre">{interfaces}</pre>
        )}
      </div>

      <div className="card p-4">
        <div className="kicker mb-3">Tailscale Peers</div>
        {loading ? (
          <div data-testid="tailscale-peers-loading">
            <Skeleton variant="text" lines={5} className="font-mono text-xs" />
          </div>
        ) : (
          <pre className="font-mono text-xs text-muted whitespace-pre">{tailscale}</pre>
        )}
      </div>
    </div>
  );
}
