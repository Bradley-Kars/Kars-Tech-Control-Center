import { useState, useEffect } from 'react';
import {
  getHomeAssistantStates,
  getHomeAssistantConfig,
  homeAssistantToggle,
  homeAssistantTurnOn,
  homeAssistantTurnOff,
} from '../../lib/tauri-commands';
import type { ServerConfig } from '../../lib/types';

interface HAState {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

interface HAConfig {
  components: string[];
  config_dir: string;
  elevation: number;
  latitude: number;
  location_name: string;
  longitude: number;
  time_zone: string;
  unit_system: any;
  version: string;
}

export function HomeAssistantPage({ server }: { server: ServerConfig }) {
  const [states, setStates] = useState<HAState[]>([]);
  const [config, setConfig] = useState<HAConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'states'>('overview');
  const [filterDomain, setFilterDomain] = useState<string>('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statesRes, configRes] = await Promise.allSettled([
        getHomeAssistantStates(server.id),
        getHomeAssistantConfig(server.id),
      ]);
      if (statesRes.status === 'fulfilled') setStates(statesRes.value);
      if (configRes.status === 'fulfilled') setConfig(configRes.value);
    } catch (err) {
      console.error('Failed to fetch Home Assistant data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [server.id]);

  const getDomain = (entityId: string) => entityId.split('.')[0];

  const handleToggle = async (entityId: string) => {
    await homeAssistantToggle(server.id, entityId);
    fetchData();
  };

  const handleTurnOn = async (entityId: string) => {
    await homeAssistantTurnOn(server.id, entityId);
    fetchData();
  };

  const handleTurnOff = async (entityId: string) => {
    await homeAssistantTurnOff(server.id, entityId);
    fetchData();
  };

  const filteredStates = states.filter(s => {
    const domain = getDomain(s.entity_id);
    if (filterDomain && domain !== filterDomain) return false;
    return true;
  });

  const domains = [...new Set(states.map(s => getDomain(s.entity_id)))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">Home Assistant</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">Version:</span>
          <span className="font-mono">{config?.version}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-line mb-4">
        {['overview', 'states'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            className={`px-4 py-2 text-sm font-mono capitalize transition-colors whitespace-nowrap ${
              activeTab === tab
                ? 'text-teal border-b-2 border-teal'
                : 'text-muted hover:text-off'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && config && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Entities</div>
            <div className="text-xl font-heading font-bold">{states.length}</div>
            <div className="text-xs text-muted">Total entities</div>
          </div>
          <div className="card p-4">
            <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Integrations</div>
            <div className="text-xl font-heading font-bold">{config.components.length}</div>
            <div className="text-xs text-muted">Loaded components</div>
          </div>
        </div>
      )}

      {activeTab === 'states' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <select
              value={filterDomain}
              onChange={(e) => setFilterDomain(e.target.value)}
              className="input input-sm w-auto font-mono text-sm"
            >
              <option value="">All Domains</option>
              {domains.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-mono text-muted uppercase tracking-wider">
                  <th className="p-3">Entity</th>
                  <th className="p-3">State</th>
                  <th className="p-3">Domain</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStates.slice(0, 100).map((state) => {
                  const isOn = state.state === 'on' || state.state === 'home' || state.state === 'open';
                  const isOff = state.state === 'off' || state.state === 'not_home' || state.state === 'closed';
                  return (
                    <tr key={state.entity_id} className="border-b border-line/50 hover:bg-panel-2/50">
                      <td className="p-3 font-mono text-sm">{state.entity_id}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 text-xs font-mono rounded ${
                          isOn ? 'bg-green-500/20 text-green' :
                          isOff ? 'bg-red-500/20 text-red' :
                          'bg-amber-500/20 text-amber'
                        }`}>
                          {state.state}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-muted">{getDomain(state.entity_id)}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          {isOn && (
                            <button
                              onClick={() => handleTurnOff(state.entity_id)}
                              className="btn btn-ghost btn-xs btn-sm"
                              title="Turn off"
                            >
                              Off
                            </button>
                          )}
                          {isOff && (
                            <button
                              onClick={() => handleTurnOn(state.entity_id)}
                              className="btn btn-ghost btn-xs btn-sm"
                              title="Turn on"
                            >
                              On
                            </button>
                          )}
                          {!isOn && !isOff && (
                            <button
                              onClick={() => handleToggle(state.entity_id)}
                              className="btn btn-ghost btn-xs btn-sm"
                              title="Toggle"
                            >
                              Toggle
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}