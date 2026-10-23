import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../../lib/types';
import { getNetworkInterfaces, getTailscalePeers } from '../../lib/tauri-commands';

interface Props { server: ServerConfig; }

export function NetworkPage({ server }: Props) {
  const [interfaces, setInterfaces] = useState('');
  const [tailscale, setTailscale] = useState('');

  const load = useCallback(async () => {
    try {
      const [i, t] = await Promise.all([getNetworkInterfaces(server.id), getTailscalePeers(server.id)]);
      setInterfaces(i || '');
      setTailscale(t || '');
    } catch { /* empty */ }
  }, [server.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">Network</h1>
        <button onClick={load} className="btn btn-ghost btn-sm">Refresh</button>
      </div>

      <div className="card p-4">
        <div className="kicker mb-3">Network Interfaces</div>
        <pre className="font-mono text-xs text-muted whitespace-pre">{interfaces || 'Loading...'}</pre>
      </div>

      <div className="card p-4">
        <div className="kicker mb-3">Tailscale Peers</div>
        <pre className="font-mono text-xs text-muted whitespace-pre">{tailscale || 'Loading...'}</pre>
      </div>
    </div>
  );
}
