import { useState, useCallback } from 'react';
import type { ServerConfig, DiskInfo, ShareInfo, SmartInfo } from '../../lib/types';
import { getDisks, getShares, getSmartData } from '../../lib/tauri-commands';
import { useResource } from '../../hooks/useResource';
import { pageDef } from '../../lib/serviceRegistry';

interface Props { server: ServerConfig; }

function formatBytes(bytes: number | string): string {
  const num = typeof bytes === 'string' ? Number(bytes) : bytes;
  if (!num || num === 0) return '—';
  const gb = num / (1024 * 1024 * 1024);
  if (gb > 1024) return `${(gb / 1024).toFixed(1)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = num / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

export function StoragePage({ server }: Props) {
  const serverId = server.id;
  const [selectedDisk, setSelectedDisk] = useState<string | null>(null);
  const [smart, setSmart] = useState<SmartInfo | null>(null);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [tab, setTab] = useState<'disks' | 'shares'>('disks');

  const { data, loading, errors, refresh } = useResource(
    {
      disks: () => getDisks(serverId),
      shares: () => getShares(serverId),
    },
    [serverId],
    pageDef('storage').pollMs,
  );

  const disks: DiskInfo[] = data.disks ?? [];
  const shares: ShareInfo[] = data.shares ?? [];
  const error = errors.disks ?? errors.shares ?? null;

  // SMART is a deliberate on-demand fetch — it shells out to smartctl per
  // device, far too slow to poll alongside the disk list.
  const viewSmart = useCallback(
    async (device: string) => {
      setSmartError(null);
      try {
        const info = await getSmartData(serverId, device);
        setSmart(info);
        setSelectedDisk(device);
      } catch (e) {
        setSmartError(e instanceof Error ? e.message : String(e));
      }
    },
    [serverId],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">Storage</h1>
        <button
          onClick={refresh}
          className="text-xs text-muted hover:text-off font-mono"
          title="Refresh"
        >
          ⟳ refresh
        </button>
      </div>

      {error && (
        <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono">{error}</div>
      )}

      <div className="flex gap-1 bg-panel rounded-lg p-1 w-fit">
        <button onClick={() => setTab('disks')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'disks' ? 'bg-ink text-teal' : 'text-muted hover:text-off'}`}>Disks</button>
        <button onClick={() => setTab('shares')} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === 'shares' ? 'bg-ink text-teal' : 'text-muted hover:text-off'}`}>Shares</button>
      </div>

      {tab === 'disks' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {disks.filter(d => d.device).map(d => (
            <div key={d.device} className={`card p-4 cursor-pointer transition-all ${selectedDisk === d.device ? 'border-teal/50' : ''}`}
              onClick={() => viewSmart(d.device)}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${d.smartStatus === 'OK' || d.smartStatus === 'PASSED' ? 'bg-green' : 'bg-red'}`} />
                  <span className="text-sm font-heading font-bold">{d.name}</span>
                </div>
                <span className="text-[10px] font-mono text-muted">{d.type}</span>
              </div>
              <div className="text-[10px] text-muted font-mono mb-2 truncate">{d.device}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted">Temp:</span> <span className="font-mono">{d.temperature || '—'}°C</span></div>
                <div><span className="text-muted">Vendor:</span> <span className="font-mono">{d.vendor || '—'}</span></div>
              </div>
              {d.size > 0 && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-muted mb-1">
                    <span>{formatBytes(d.size)}</span>
                    {d.free != null && d.free > 0 && (
                      <span className="text-green">{formatBytes(d.free)} free</span>
                    )}
                  </div>
                  {d.free != null && d.free > 0 && (
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-teal transition-all"
                        style={{ width: `${((d.size - d.free) / d.size) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {disks.length === 0 && !error && (
            <div className="card p-4 text-center text-sm text-muted col-span-full">
              {loading ? 'Loading disks...' : 'No disks reported by the array.'}
            </div>
          )}
        </div>
      )}

      {tab === 'shares' && (
        <div className="space-y-2">
          {shares.filter(s => s.name).map(s => {
            const total = s.size || ((s.used || 0) + (s.free || 0));
            const pct = total > 0 ? ((s.used || 0) / total) * 100 : 0;
            return (
              <div key={s.name} className="card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-[10px] text-muted font-mono">Allocation: {s.allocator} · Cache: {s.cache ? 'Yes' : 'No'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-mono">{formatBytes(s.used || 0)}</div>
                    <div className="text-[10px] text-muted">of {formatBytes(total)}</div>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
          {shares.length === 0 && !error && (
            <div className="card p-4 text-center text-sm text-muted">
              {loading ? 'Loading shares...' : 'No shares configured.'}
            </div>
          )}
        </div>
      )}

      {smartError && (
        <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono">{smartError}</div>
      )}

      {selectedDisk && smart && (
        <div className="card p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-heading font-bold">SMART — {smart.device}</h3>
            <button onClick={() => setSelectedDisk(null)} className="text-muted hover:text-off text-xs">✕</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted text-xs block">Model</span><span className="font-mono text-xs">{smart.model}</span></div>
            <div><span className="text-muted text-xs block">Health</span><span className={`font-mono text-xs ${smart.health === 'PASSED' ? 'text-green' : 'text-red'}`}>{smart.health}</span></div>
            <div><span className="text-muted text-xs block">Temperature</span><span className="font-mono text-xs">{smart.temperature || '—'}°C</span></div>
            <div><span className="text-muted text-xs block">Power-On Hours</span><span className="font-mono text-xs">{smart.power_on_hours || '—'}</span></div>
            <div><span className="text-muted text-xs block">Reallocated Sectors</span><span className={`font-mono text-xs ${parseInt(smart.reallocated_sectors || '0') > 0 ? 'text-amber' : 'text-green'}`}>{smart.reallocated_sectors || '0'}</span></div>
            <div><span className="text-muted text-xs block">Pending Sectors</span><span className="font-mono text-xs">{smart.pending_sectors || '0'}</span></div>
            <div><span className="text-muted text-xs block">Capacity</span><span className="font-mono text-xs">{smart.capacity}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
