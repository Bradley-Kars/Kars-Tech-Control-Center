import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../../lib/types';
import { getDockerContainers, dockerStart, dockerStop, dockerRestart, dockerLogs, dockerRemove } from '../../lib/tauri-commands';

type Page = 'dashboard' | 'docker' | 'storage' | 'system' | 'network' | 'nextcloud' | 'lidarr' | 'homeassistant' | 'myspeed' | 'adguard';

interface Props {
  server: ServerConfig;
  setPage: (page: Page) => void;
}

const getServiceInfo = (name: string) => {
  const lower = name.toLowerCase().replace(/^\//, '');
  for (const [key, info] of Object.entries(SERVICE_MAP)) {
    if (lower.includes(key)) return info;
  }
  return null;
};

const SERVICE_MAP: Record<string, { page: Page; icon: string; color: string }> = {
  'nextcloud': { page: 'nextcloud', icon: '☁', color: 'bg-blue-500' },
  'lidarr': { page: 'lidarr', icon: '♪', color: 'bg-purple-500' },
  'homeassistant': { page: 'homeassistant', icon: '🏠', color: 'bg-blue-500' },
  'home-assistant': { page: 'homeassistant', icon: '🔗', color: 'bg-blue-500' },
  'myspeed': { page: 'myspeed', icon: '⚡', color: 'bg-yellow-500' },
  'adguard': { page: 'adguard', icon: '🛡', color: 'bg-green-500' },
  'homepage': { page: 'docker', icon: '🏠', color: 'bg-blue-500' },
  'uptimekuma': { page: 'docker', icon: '📊', color: 'bg-teal-500' },
  'scrutiny': { page: 'docker', icon: '💾', color: 'bg-orange-500' },
  'your_spotify': { page: 'docker', icon: '🎵', color: 'bg-green-500' },
  'dozzle': { page: 'docker', icon: '📋', color: 'bg-teal-500' },
  'krusader': { page: 'docker', icon: '📁', color: 'bg-blue-500' },
  'pairdrop': { page: 'docker', icon: '📤', color: 'bg-purple-500' },
  'plex': { page: 'docker', icon: '🎬', color: 'bg-orange-500' },
  'mariadb': { page: 'docker', icon: '🗄', color: 'bg-blue-500' },
  'mongo': { page: 'docker', icon: '🗄', color: 'bg-green-500' },
  'redis': { page: 'docker', icon: '🗄', color: 'bg-red-500' },
  'ollama': { page: 'docker', icon: '🤖', color: 'bg-teal-500' },
  'open-webui': { page: 'docker', icon: '🤖', color: 'bg-teal-500' },
  'mqtt': { page: 'docker', icon: '📡', color: 'bg-yellow-500' },
  'mosquitto': { page: 'docker', icon: '📡', color: 'bg-yellow-500' },
  'nodered': { page: 'docker', icon: '🔗', color: 'bg-red-500' },
  'grafana': { page: 'docker', icon: '📊', color: 'bg-orange-500' },
  'prometheus': { page: 'docker', icon: '📊', color: 'bg-red-500' },
  'influxdb': { page: 'docker', icon: '📊', color: 'bg-blue-500' },
  'vaultwarden': { page: 'docker', icon: '🔐', color: 'bg-blue-500' },
  'invoiceninja': { page: 'docker', icon: '🧾', color: 'bg-green-500' },
  'aurral': { page: 'docker', icon: '🎵', color: 'bg-indigo-500' },
  'searxng': { page: 'docker', icon: '🔍', color: 'bg-blue-500' },
  'cloudflared': { page: 'docker', icon: '☁', color: 'bg-orange-500' },
  'slskd': { page: 'docker', icon: '🎵', color: 'bg-purple-500' },
  'soularr': { page: 'docker', icon: '🎵', color: 'bg-purple-500' },
  'clamav': { page: 'docker', icon: '🛡', color: 'bg-blue-500' },
  'rustdesk': { page: 'docker', icon: '🖥', color: 'bg-teal-500' },
};

export function DockerPage({ server, setPage }: Props) {
  const [containers, setContainers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setError('');
      const c = await getDockerContainers(server.id);
      setContainers(Array.isArray(c) ? c : []);
    } catch (e: any) {
      setError(e.toString());
    }
  }, [server.id]);

  useEffect(() => { refresh(); }, [refresh]);

  const doAction = async (action: string, containerId: string) => {
    setLoading(true);
    setActionMsg('');
    try {
      let msg = '';
      if (action === 'start') msg = await dockerStart(server.id, containerId);
      else if (action === 'stop') msg = await dockerStop(server.id, containerId);
      else if (action === 'restart') msg = await dockerRestart(server.id, containerId);
      else if (action === 'remove') {
        if (confirm('Remove this container?')) msg = await dockerRemove(server.id, containerId);
      }
      setActionMsg(msg);
      refresh();
    } catch (e: any) { setActionMsg(e.toString()); }
    setLoading(false);
  };

  const viewLogs = async (containerId: string, containerName: string) => {
    try {
      const l = await dockerLogs(server.id, containerId, 100);
      setLogs(l);
      setSelected(containerName);
    } catch { /* empty */ }
  };

  const navigateToService = (containerName: string) => {
    const service = getServiceInfo(containerName);
    if (service && service.page !== 'docker') {
      setPage(service.page);
    }
  };

  const filtered = containers.filter(c =>
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.image || '').toLowerCase().includes(search.toLowerCase())
  );

  const sortContainers = (a: any, b: any) => {
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  };

  const running = filtered.filter(c => c.state === 'running').sort(sortContainers);
  const stopped = filtered.filter(c => c.state !== 'running').sort(sortContainers);

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-heading font-bold">Docker Containers</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted">{running.length} running · {stopped.length} stopped · {containers.length} total</span>
            <button onClick={refresh} className="btn btn-ghost btn-sm">Refresh</button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono">{error}</div>
        )}

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search containers..."
          className="w-full bg-ink border border-line rounded-lg px-3 py-2 text-sm text-off font-mono focus:border-teal focus:outline-none" />

        {actionMsg && (
          <div className="text-sm text-teal bg-teal/10 border border-teal/20 rounded-lg px-3 py-2">{actionMsg}</div>
        )}

        <div className="space-y-1">
          {running.map(c => (
            <ContainerRow key={c.id || c.name} container={c} selected={selected === c.name}
              onSelect={() => { viewLogs(c.id, c.name); navigateToService(c.name); }} loading={loading}
              onStart={() => doAction('start', c.id)} onStop={() => doAction('stop', c.id)}
              onRestart={() => doAction('restart', c.id)} onRemove={() => doAction('remove', c.id)} />
          ))}
        </div>

        {stopped.length > 0 && (
          <>
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider pt-2">Stopped</div>
            <div className="space-y-1">
              {stopped.map(c => (
                <ContainerRow key={c.id || c.name} container={c} selected={selected === c.name}
                  onSelect={() => { viewLogs(c.id, c.name); navigateToService(c.name); }} loading={loading}
                  onStart={() => doAction('start', c.id)} onStop={() => doAction('stop', c.id)}
                  onRestart={() => doAction('restart', c.id)} onRemove={() => doAction('remove', c.id)} />
              ))}
            </div>
          </>
        )}
      </div>

      {selected && (
        <div className="w-[420px] card p-4 flex flex-col max-h-[calc(100vh-200px)]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-heading font-bold truncate">{selected}</h3>
            <button onClick={() => setSelected(null)} className="text-muted hover:text-off text-xs">✕</button>
          </div>
          <div className="flex-1 overflow-auto bg-ink rounded-lg p-3 font-mono text-xs text-muted whitespace-pre-wrap">
            {logs || 'No logs'}
          </div>
        </div>
      )}
    </div>
  );
}

function ContainerRow({ container: c, selected, onSelect, loading, onStart, onStop, onRestart, onRemove }: {
  container: any; selected: boolean; onSelect: () => void; loading: boolean;
  onStart: () => void; onStop: () => void; onRestart: () => void; onRemove: () => void;
}) {
  const stateColor = c.state === 'running' ? 'bg-green' : c.state === 'exited' || c.state === 'stopped' ? 'bg-red' : 'bg-muted';

  const service = getServiceInfo(c.name);

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${selected ? 'bg-ink border border-teal/30' : 'bg-panel hover:bg-panel-2 border border-transparent'}`} onClick={onSelect}>
      <div className={`w-2 h-2 rounded-full ${stateColor} shrink-0`} />
      {service && (
        <div className={`w-6 h-6 rounded flex items-center justify-center text-xs shrink-0 ${service.color} text-ink font-bold`} title={`Open ${service.page} page`}>
          {service.icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{c.name}</div>
        <div className="text-[10px] text-muted font-mono truncate">{c.image}</div>
      </div>
      <div className="text-[10px] text-muted font-mono shrink-0">{c.status}</div>
      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
        {c.state === 'running' ? (
          <>
            <button onClick={onStop} disabled={loading} className="text-[10px] px-2 py-1 rounded bg-amber/15 text-amber hover:bg-amber/25">Stop</button>
            <button onClick={onRestart} disabled={loading} className="text-[10px] px-2 py-1 rounded bg-teal/15 text-teal hover:bg-teal/25">Restart</button>
          </>
        ) : (
          <button onClick={onStart} disabled={loading} className="text-[10px] px-2 py-1 rounded bg-green/15 text-green hover:bg-green/25">Start</button>
        )}
        <button onClick={onRemove} disabled={loading} className="text-[10px] px-2 py-1 rounded bg-red/15 text-red hover:bg-red/25">Remove</button>
      </div>
    </div>
  );
}