import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../../lib/types';
import { getProcesses, getSyslog, getUserScripts, getPlugins, runUserScript } from '../../lib/tauri-commands';
import { Skeleton } from '../ui/Skeleton';

interface Props { server: ServerConfig; }

type SysTab = 'processes' | 'syslog' | 'scripts' | 'plugins';

export function SystemPage({ server }: Props) {
  const [tab, setTab] = useState<SysTab>('processes');
  const [processes, setProcesses] = useState('');
  const [syslog, setSyslog] = useState('');
  const [scripts, setScripts] = useState('');
  const [plugins, setPlugins] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [scriptOutput, setScriptOutput] = useState('');
  const [loading, setLoading] = useState(true);

  const runScript = async (name: string) => {
    try {
      setError('');
      setScriptOutput('Running...');
      const out = await runUserScript(server.id, name);
      setScriptOutput(out.trim() || `Finished: ${name}`);
    } catch (e: any) {
      setError(e.toString());
      setScriptOutput('');
    }
  };

  const load = useCallback(async (t: SysTab) => {
    setError('');
    setLoading(true);
    try {
      if (t === 'processes') setProcesses(await getProcesses(server.id));
      else if (t === 'syslog') setSyslog(await getSyslog(server.id, 100));
      else if (t === 'scripts') setScripts(await getUserScripts(server.id));
      else if (t === 'plugins') {
        const p = await getPlugins(server.id);
        setPlugins(Array.isArray(p) ? p : []);
      }
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }, [server.id]);

  useEffect(() => { load(tab); }, [tab, load]);

  const refresh = () => load(tab);

  const tabs: { id: SysTab; label: string }[] = [
    { id: 'processes', label: 'Processes' },
    { id: 'syslog', label: 'Syslog' },
    { id: 'scripts', label: 'User Scripts' },
    { id: 'plugins', label: 'Plugins' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">System</h1>
        <button onClick={refresh} className="btn btn-ghost btn-sm">Refresh</button>
      </div>

      {error && (
        <div className="text-sm text-red bg-red/10 border border-red/20 rounded-lg px-3 py-2 font-mono">{error}</div>
      )}

      <div className="flex gap-1 bg-panel rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-ink text-teal' : 'text-muted hover:text-off'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'processes' && (
        <div className="card p-4 overflow-x-auto max-h-[calc(100vh-280px)] overflow-auto">
          {loading ? (
            <div data-testid="system-processes-loading">
              <Skeleton variant="text" lines={6} className="font-mono text-xs" />
            </div>
          ) : (
            <pre className="font-mono text-xs text-muted whitespace-pre">{processes}</pre>
          )}
        </div>
      )}

      {tab === 'syslog' && (
        <div className="card p-4 max-h-[calc(100vh-280px)] overflow-auto">
          {loading ? (
            <div data-testid="system-syslog-loading">
              <Skeleton variant="text" lines={6} className="font-mono text-xs" />
            </div>
          ) : (
            <pre className="font-mono text-xs text-muted whitespace-pre-wrap">{syslog}</pre>
          )}
        </div>
      )}

      {tab === 'scripts' && (
        <div className="space-y-2">
          {loading ? (
            <div data-testid="system-scripts-loading">
              <Skeleton variant="text" lines={4} className="font-mono text-xs" />
            </div>
          ) : (
            <>
              {(scripts || '').split('\n').filter(Boolean).map(s => (
                <div key={s} className="card px-4 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-teal" />
                  <span className="text-sm font-mono flex-1">{s}</span>
                  <button onClick={() => runScript(s)} className="btn btn-ghost btn-sm text-xs">Run</button>
                </div>
              ))}
              {!scripts && <div className="card p-4 text-center text-sm text-muted">No scripts found</div>}
            </>
          )}
          {scriptOutput && (
            <div className="card p-4">
              <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Last Run Output</div>
              <pre className="font-mono text-xs text-muted whitespace-pre-wrap">{scriptOutput}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'plugins' && (
        <div className="space-y-2">
          {loading ? (
            <div data-testid="system-plugins-loading">
              <Skeleton variant="text" lines={4} className="font-mono text-xs" />
            </div>
          ) : (
            <>
              {plugins.map((p: string, i: number) => (
                <div key={i} className="card px-4 py-3 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-amber" />
                  <span className="text-sm font-mono flex-1">{p}</span>
                </div>
              ))}
              {plugins.length === 0 && <div className="card p-4 text-center text-sm text-muted">No plugins found</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
