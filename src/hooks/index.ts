import { useState, useEffect, useCallback, useMemo } from 'react';
import { getServers, saveServer, removeServer, getSystemStats, getLocalSystemStats, meshcentralGetFleetStats, meshcentralGetSystemStats } from '../lib/tauri-commands';
import type { ServerConfig, ConnectionMethod } from '../lib/types';

export function useServers() {
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getServers();
      setServers(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load servers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const addServer = useCallback(async (config: ServerConfig) => {
    await saveServer(config);
    await loadServers();
  }, [loadServers]);

  const deleteServer = useCallback(async (id: string) => {
    await removeServer(id);
    await loadServers();
  }, [loadServers]);

  const updateServer = useCallback(async (config: ServerConfig) => {
    await saveServer(config);
    await loadServers();
  }, [loadServers]);

  const getServer = useCallback((id: string) => servers.find(s => s.id === id), [servers]);

  return useMemo(() => ({
    servers,
    loading,
    error,
    loadServers,
    addServer,
    deleteServer,
    updateServer,
    getServer,
  }), [servers, loading, error, loadServers, addServer, deleteServer, updateServer, getServer]);
}

export function useLocalStats(interval = 5000) {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await getLocalSystemStats();
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load local stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, interval);
    return () => clearInterval(timer);
  }, [refresh, interval]);

  return useMemo(() => ({ stats, loading, error, refresh }), [stats, loading, error, refresh]);
}

export function useFleetStats(servers: ServerConfig[], interval = 10000) {
  const [fleetStats, setFleetStats] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  // Determine connection priority for a server
  const getConnectionPriority = (server: ServerConfig): ConnectionMethod[] => {
    if (server.connection_priority && server.connection_priority.length > 0) {
      return server.connection_priority;
    }
    // Default priority: MeshCentral first for enrolled devices, then SSH/GraphQL/ADB
    if (server.meshcentral_device_id) {
      return ['meshcentral', 'ssh', 'graphql', 'adb'];
    }
    // Unraid defaults to GraphQL then SSH
    if (server.device_type === 'unraid') {
      return ['graphql', 'ssh'];
    }
    // Phone defaults to ADB then SSH
    if (server.device_type === 'phone') {
      return ['adb', 'ssh'];
    }
    // Handheld/Laptop/HTPC default to SSH
    return ['ssh'];
  };

  const refresh = useCallback(async () => {
    // First, try MeshCentral fleet stats for all enrolled devices
    let mcStats: Record<string, any> = {};
    try {
      mcStats = await meshcentralGetFleetStats();
    } catch {
      // MeshCentral unavailable, continue with fallback
    }

    const results: Record<string, any> = {};

    await Promise.allSettled(
      servers.map(async (server) => {
        const priority = getConnectionPriority(server);
        let connected = false;
        let stats: Record<string, any> = { connected: false, source: 'none' };

        // Try each connection method in priority order
        for (const method of priority) {
          try {
            if (method === 'meshcentral' && server.meshcentral_device_id) {
              // Use MeshCentral transport for detailed stats
              try {
                const mcData = await meshcentralGetSystemStats(server.id);
                if (mcData && mcData.cpu_usage !== undefined) {
                  stats = { 
                    ...mcData, 
                    connected: true, 
                    source: 'meshcentral',
                    server_name: server.name,
                    device_type: server.device_type,
                    hostname: server.hostname,
                  };
                  connected = true;
                  break;
                }
              } catch {
                // Fall through to fleet stats
              }
              
              // Fallback to pre-fetched fleet stats
              const mcFleetData = mcStats[server.id];
              if (mcFleetData && mcFleetData.connected) {
                stats = { ...mcFleetData, connected: true, source: 'meshcentral' };
                connected = true;
                break;
              }
            } else if (method === 'graphql' && server.device_type === 'unraid') {
              const data = await getSystemStats(server.id);
              stats = { ...data, connected: true, source: 'graphql' };
              connected = true;
              break;
            } else if (method === 'ssh') {
              // For SSH-based devices, we'd need specific stats calls
              // For now, mark as connected if we have the server config
              stats = { connected: true, source: 'ssh' };
              connected = true;
              break;
            } else if (method === 'adb' && server.device_type === 'phone') {
              // Phone stats would go here
              stats = { connected: true, source: 'adb' };
              connected = true;
              break;
            }
          } catch {
            // Try next method
            continue;
          }
        }

        // If no method succeeded but we have MeshCentral data, use it
        if (!connected && mcStats[server.id]?.connected) {
          stats = { ...mcStats[server.id], connected: true, source: 'meshcentral' };
          connected = true;
        }

        // Include server metadata in stats for UI
        stats.server_name = server.name;
        stats.device_type = server.device_type;
        stats.hostname = server.hostname;

        results[server.id] = stats;
      })
    );

    setFleetStats(results);
    setLoading(false);
  }, [servers]);

  useEffect(() => {
    if (servers.length > 0) {
      refresh();
      const timer = setInterval(refresh, interval);
      return () => clearInterval(timer);
    }
  }, [refresh, interval, servers.length]);

  return useMemo(() => ({ fleetStats, loading, refresh }), [fleetStats, loading, refresh]);
}

// Media query hook
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

// Local storage hook
export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (e) {
      console.error(`Error setting localStorage key "${key}":`, e);
    }
  }, [key, storedValue]);

  return [storedValue, setValue] as const;
}

// Debounce hook
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

// Click outside hook
export function useClickOutside(ref: React.RefObject<HTMLElement>, handler: (e: MouseEvent) => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler(e);
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

// Key press hook
export function useKeyPress(targetKey: string, handler: (e: KeyboardEvent) => void) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === targetKey) handler(e);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [targetKey, handler]);
}