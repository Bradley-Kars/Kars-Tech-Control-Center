import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useServers, useLocalStats, useFleetStats } from '../hooks';
import { Card, CardSection } from '../components/ui/Card';
import { Gauge } from '../components/ui/Gauge';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Button, IconButton } from '../components/ui/Button';
import { DeviceAvatar } from '../components/ui/Avatar';
import { Skeleton, SkeletonCard } from '../components/ui/Skeleton';
import { Tooltip } from '../components/ui/Tooltip';
import { Link, useNavigate } from 'react-router-dom';
import GridLayout, { useContainerWidth } from 'react-grid-layout';
import { alertList, alertCreate, meshcentralShellFleet } from '../lib/tauri-commands';
import { ToastManager, useToast } from '../components/ui/Toast';
import type { Alert } from '../lib/types';

const DEVICE_ORDER = ['local', 'unraid', 'phone', 'ally'];

/** Map an order key to the device_type values that satisfy it.
 *  The Ally is configured as device_type 'handheld' but everywhere in the UI
 *  we call it 'ally'. */
function matchesDeviceOrder(orderKey: string, deviceType: string): boolean {
  if (orderKey === deviceType) return true;
  if (orderKey === 'ally') return deviceType === 'handheld' || deviceType === 'bazzite';
  return false;
}

function getDeviceType(deviceType: string) {
  switch (deviceType) {
    case 'unraid': return 'unraid' as const;
    case 'phone': return 'phone' as const;
    case 'handheld':
    case 'bazzite':
    case 'ally': return 'handheld' as const;
    case 'local': return 'desktop' as const;
    default: return 'desktop' as const;
  }
}

function getDeviceLabel(deviceType: string) {
  const labels: Record<string, string> = {
    local: 'This Machine',
    unraid: 'Unraid Server',
    phone: 'Galaxy S24 Ultra',
    ally: 'ROG Ally',
    laptop: 'Senpai Laptop',
  };
  return labels[deviceType] || deviceType;
}

function getDevicePath(deviceType: string) {
  const paths: Record<string, string> = {
    local: '/device/local',
    unraid: '/device/unraid',
    phone: '/device/phone',
    ally: '/device/ally',
    laptop: '/device/laptop',
  };
  return paths[deviceType] || '/';
}

export function DashboardPage() {
  const { servers, loading: serversLoading } = useServers();
  const { stats: localStats } = useLocalStats();
  const { fleetStats } = useFleetStats(servers);
  const navigate = useNavigate();

  // Container width for responsive grid (containerRef must stay mounted from the
  // first commit — the measure effect attaches exactly once and never retries)
  const { width, mounted, containerRef } = useContainerWidth({ measureBeforeMount: true });

  // Swallow the click the browser fires right after a drag/resize ends, so
  // arranging tiles can't trigger a card's navigation click (300 ms window)
  const suppressClickUntilRef = useRef(0);
  const markGridInteract = useCallback(() => {
    suppressClickUntilRef.current = Date.now() + 300;
  }, []);

  // Persisted grid layout (written when the grid reorders; cleared by Reset)
  const [layout, setLayout] = useState<any[] | null>(() => {
    try {
      const saved = localStorage.getItem('kts:dashboard:layout');
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  const saveLayout = useCallback((newLayout: readonly any[]) => {
    setLayout([...newLayout]);
    localStorage.setItem('kts:dashboard:layout', JSON.stringify(newLayout));
  }, []);

  const resetLayout = useCallback(() => {
    setLayout(null);
    localStorage.removeItem('kts:dashboard:layout');
    window.dispatchEvent(new CustomEvent('kts:refresh'));
  }, []);

  // Open alerts persisted in the Alert Center DB (alert_*)
  const [dbAlerts, setDbAlerts] = useState<Alert[]>([]);

  const refreshDbAlerts = useCallback(async () => {
    try {
      const open = await alertList({ acknowledged: false, limit: 50 });
      setDbAlerts(open);
    } catch {
      setDbAlerts([]);
    }
  }, []);

  useEffect(() => {
    refreshDbAlerts();
  }, [refreshDbAlerts]);

  // External grid code (or the command palette) can save the layout via this event
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent).detail;
      if (Array.isArray(next)) saveLayout(next);
    };
    window.addEventListener('kts:dashboard:layout', handler);
    return () => window.removeEventListener('kts:dashboard:layout', handler);
  }, [saveLayout]);

  // Saved layout position for a section, falling back to the default
  const gridPos = useCallback(
    (i: string, fallback: Record<string, unknown>) => layout?.find((l) => l?.i === i) ?? { i, ...fallback },
    [layout],
  );

  const handleRefresh = () => {
    refreshDbAlerts();
    window.dispatchEvent(new CustomEvent('kts:refresh'));
  };

  const { toasts, removeToast, addToast } = useToast();

  // Fleet-wide health check over MeshCentral (primary transport)
  const handleFleetHealth = useCallback(async () => {
    const enrolled = servers.filter((s) => s.meshcentral_device_id);
    if (enrolled.length === 0) {
      addToast({ type: 'info', title: 'No enrolled devices', message: 'Enroll devices from the MeshCentral page first.' });
      return;
    }
    addToast({ type: 'info', title: 'Fleet health check', message: `Pinging ${enrolled.length} device(s) over MeshCentral…`, duration: 4000 });
    try {
      const results = await meshcentralShellFleet(enrolled.map((s) => s.id), 'uptime', 15);
      const ok = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success);
      if (failed.length === 0) {
        addToast({ type: 'success', title: 'Fleet healthy', message: `${ok}/${results.length} devices responded via MeshCentral` });
      } else {
        addToast({
          type: 'warning',
          title: 'Fleet degraded',
          message: `${ok}/${results.length} up — no response from ${failed.map((f) => f.device_id).join(', ')}`,
          duration: 8000,
        });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Health check failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  }, [servers, addToast]);

  // Build ordered device list with stats
  const devices = useMemo(() => {
    const result = [];
    for (const dt of DEVICE_ORDER) {
      if (dt === 'local') {
        result.push({
          deviceType: 'local',
          server: { id: 'local', name: 'This Machine', device_type: 'local', hostname: 'localhost' },
          stats: localStats?.system ? { ...localStats.system, connected: true } : { connected: false },
        });
      } else {
        const server = servers.find((s) => matchesDeviceOrder(dt, s.device_type));
        if (server) {
          const fs = fleetStats[server.id];
          result.push({
            deviceType: dt,
            server,
            stats: fs ? { ...fs, connected: fs.connected !== false } : { connected: false },
          });
        }
      }
    }
    return result;
  }, [servers, fleetStats, localStats]);

  // Alerts: threshold breaches computed from live stats + open rows from the Alert Center DB
  const alerts = useMemo(() => {
    const items: Array<{ type: 'warning' | 'error' | 'info'; title: string; message: string; device?: string }> = [];

    devices.forEach(({ deviceType, server, stats }) => {
      if (!stats.connected) {
        items.push({
          type: 'error',
          title: `${getDeviceLabel(deviceType)} Offline`,
          message: `Last seen: ${stats.last_seen || 'unknown'}`,
          device: server.id,
        });
      } else {
        const cpu = stats.cpu_usage ?? stats.system?.cpu_usage ?? 0;
        const mem = stats.memory_usage_pct ?? stats.system?.memory_usage_pct ?? 0;
        const temp = stats.temp_avg ?? stats.system?.thermal?.cpu_temp_c;

        if (cpu > 90) {
          items.push({ type: 'error', title: 'Critical CPU', message: `${Math.round(cpu)}% usage`, device: server.id });
        } else if (cpu > 75) {
          items.push({ type: 'warning', title: 'High CPU', message: `${Math.round(cpu)}% usage`, device: server.id });
        }

        if (mem > 95) {
          items.push({ type: 'error', title: 'Critical Memory', message: `${Math.round(mem)}% used`, device: server.id });
        } else if (mem > 85) {
          items.push({ type: 'warning', title: 'High Memory', message: `${Math.round(mem)}% used`, device: server.id });
        }

        if (temp && temp > 80) {
          items.push({ type: 'warning', title: 'High Temperature', message: `${Math.round(temp)}°C`, device: server.id });
        }
      }
    });

    // Persist newly-computed breaches into the alert DB (dedup against open rows)
    const openKeys = new Set(dbAlerts.map((a) => `${a.device_id ?? ''}|${a.title}`));
    items
      .filter((it) => it.type !== 'info')
      .forEach((it) => {
        const key = `${it.device ?? ''}|${it.title}`;
        if (!openKeys.has(key)) {
          openKeys.add(key);
          alertCreate(
            it.type === 'error' ? 'critical' : 'warning',
            it.title,
            it.message,
            it.device,
            'dashboard-threshold',
          ).catch(() => {});
        }
      });

    // Merge open Alert Center rows not already represented by a computed breach
    dbAlerts.forEach((a) => {
      const key = `${a.device_id ?? ''}|${a.title}`;
      if (items.every((it) => `${it.device ?? ''}|${it.title}` !== key)) {
        items.push({
          type: a.severity === 'critical' ? 'error' : a.severity === 'warning' ? 'warning' : 'info',
          title: a.title,
          message: a.message,
          device: a.device_id,
        });
      }
    });

    return items.slice(0, 8);
  }, [devices, dbAlerts]);

  // Quick actions based on available devices
  const quickActions = useMemo(() => {
    const actions = [];
    const hasUnraid = servers.some(s => s.device_type === 'unraid');
    const hasPhone = servers.some(s => s.device_type === 'phone');

    if (hasUnraid) {
      actions.push(
        { id: 'reboot-unraid', label: 'Reboot Unraid', icon: '🔄', variant: 'outline' as const, action: () => navigate('/service/system') },
        { id: 'docker', label: 'Docker Containers', icon: '🐳', variant: 'outline' as const, action: () => navigate('/service/docker') },
        { id: 'storage', label: 'Storage Array', icon: '💾', variant: 'outline' as const, action: () => navigate('/service/storage') },
      );
    }
    if (hasPhone) {
      actions.push(
        { id: 'ring-phone', label: 'Ring Phone', icon: '🔔', variant: 'outline' as const, action: () => { window.dispatchEvent(new CustomEvent('kts:ring-phone')); } },
        { id: 'screenshot-phone', label: 'Screenshot Phone', icon: '📱', variant: 'outline' as const, action: () => { window.dispatchEvent(new CustomEvent('kts:screenshot-phone')); } },
      );
    }
    actions.push(
      { id: 'mc-health', label: 'Fleet Health', icon: '🩺', variant: 'outline' as const, action: handleFleetHealth },
      { id: 'refresh', label: 'Refresh All', icon: '↻', variant: 'outline' as const, action: handleRefresh },
    );
    return actions;
  }, [servers, navigate, handleFleetHealth]);

  if (serversLoading) {
    // Keep the measured container mounted during load — useContainerWidth's
    // effect only ever attaches to containerRef once, right after first commit.
    return (
      <div ref={containerRef} className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width="30%" height="2.5rem" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-6 animate-fade-in">
      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
      {/* Page Header — outside the grid so it never participates in layout compaction */}
      <div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
              Fleet Overview
            </h1>
            <p className="text-[var(--kts-text-secondary)] mt-1">Real-time status across {devices.length} {devices.length === 1 ? 'device' : 'devices'}</p>
          </div>
          <div className="flex items-center gap-3">
            <Tooltip content="Refresh all data (⌘R)" position="top">
              <Button variant="ghost" size="sm" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>} onClick={handleRefresh}>
                Refresh
              </Button>
            </Tooltip>
            <Tooltip content="Command Palette (⌘K)" position="top">
              <IconButton variant="ghost" size="sm" aria-label="Command Palette" onClick={() => window.dispatchEvent(new CustomEvent('kts:command-palette'))}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </IconButton>
            </Tooltip>
            <Tooltip content="Reset Layout" position="top">
              <Button variant="ghost" size="sm" leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18"/><path d="M12 3v18"/></svg>} onClick={resetLayout}>
                Reset
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>

      {/* Critical Alerts — outside the grid so appearing/disappearing never reshuffles tiles */}
      {alerts.length > 0 && (
        <div>
          <Card variant="red" className="animate-slide-up">
            <CardSection title="Critical Alerts" action={
              <Badge variant="danger" size="sm" dot>{alerts.length}</Badge>
            }>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {alerts.map((alert, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3 rounded-[var(--kts-radius-base)]"
                    style={{ background: 'var(--kts-bg-tertiary)', border: `1px solid var(--kts-border-${alert.type})` }}
                  >
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{
                        background:
                          alert.type === 'error' ? 'var(--kts-status-error)' :
                          alert.type === 'warning' ? 'var(--kts-status-warning)' :
                          'var(--kts-status-pending)',
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">{alert.title}</p>
                      <p className="text-[var(--kts-text-secondary)] text-[var(--kts-font-size-xs)] mt-0.5">{alert.message}</p>
                    </div>
                    {alert.device && (
                      <Button variant="ghost" size="xs" onClick={() => navigate(getDevicePath(alert.device!))}>
                        View
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardSection>
          </Card>
        </div>
      )}

      {/* Fleet Status Grid — draggable/resizable, persisted to localStorage */}
      <div
        onClickCapture={(e) => {
          if (Date.now() < suppressClickUntilRef.current) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
      {mounted && (
      <GridLayout
        width={width}
        layout={layout ?? []}
        onLayoutChange={saveLayout}
        onDragStop={markGridInteract}
        onResizeStop={markGridInteract}
        gridConfig={{ cols: 12, rowHeight: 40, margin: [16, 16] }}
        dragConfig={{ cancel: 'button, a, input, textarea, select' }}
      >
      {devices.map(({ deviceType, server, stats }, index) => {
        const isOnline = stats.connected !== false;
        const cpu = stats.cpu_usage ?? stats.system?.cpu_usage ?? 0;
        const mem = stats.memory_usage_pct ?? stats.system?.memory_usage_pct ?? 0;
        const temp = stats.temp_avg ?? stats.system?.thermal?.cpu_temp_c ?? stats.thermal?.cpu_temp_c;
        const uptime = stats.uptime ?? stats.system?.uptime;
        const hostname = stats.hostname ?? server.hostname;
        const mcEnrolled = !!(server as { meshcentral_device_id?: string }).meshcentral_device_id;
        const source = typeof stats.source === 'string' ? stats.source : '';
        const viaMeshCentral = source === 'meshcentral';
        const transportLabel =
          source === 'graphql' ? 'GraphQL' :
          source === 'ssh' ? 'SSH' :
          source === 'adb' ? 'ADB' :
          source && source !== 'none' ? source : 'fallback';

        return (
          <div key={`device-${server.id}`} data-grid={gridPos(`device-${server.id}`, { x: (index % 3) * 4, y: Math.floor(index / 3) * 7, w: 4, h: 7, minH: 6, minW: 4 })} style={{ animationDelay: `${index * 50}ms` }}>
            <Card variant={isOnline ? 'default' : 'red'} hoverable onClick={() => navigate(getDevicePath(deviceType))} className="animate-slide-up h-full" style={{ animationDelay: `${index * 50}ms` }}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <DeviceAvatar type={getDeviceType(deviceType)} name={getDeviceLabel(deviceType)} status={isOnline ? 'online' : 'offline'} size="lg" />
                  <div>
                    <h3 className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]" style={{ fontSize: 'var(--kts-font-size-lg)' }}>
                      {getDeviceLabel(deviceType)}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge state={isOnline ? 'running' : 'stopped'} size="sm" showDot pulsing={isOnline} />
                      <span className="text-[var(--kts-text-tertiary)] text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)]">{hostname}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge variant={isOnline ? 'success' : 'danger'} size="sm">
                    {isOnline ? 'Online' : 'Offline'}
                  </Badge>
                  {mcEnrolled && (
                    <Badge
                      variant={viaMeshCentral ? 'info' : 'subtle'}
                      size="sm"
                      dot={viaMeshCentral}
                      title={viaMeshCentral ? 'Live telemetry via MeshCentral agent' : `MeshCentral enrolled — telemetry via ${transportLabel}`}
                    >
                      {viaMeshCentral ? 'via MeshCentral' : `via ${transportLabel}`}
                    </Badge>
                  )}
                </div>
              </div>

            {/* Vitals */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              <Gauge size="sm" value={cpu} variant={cpu > 80 ? 'danger' : cpu > 50 ? 'warning' : 'success'} label="CPU" showValue />
              <Gauge size="sm" value={mem} variant={mem > 85 ? 'danger' : mem > 60 ? 'warning' : 'success'} label="Memory" showValue />
              {temp != null && (
                <Gauge size="sm" value={Math.min(100, (temp / 100) * 100)} variant={temp > 75 ? 'danger' : temp > 55 ? 'warning' : 'success'} label="Temp" showValue valueFormatter={() => `${Math.round(temp)}°C`} />
              )}
            </div>

            {/* Additional info */}
            <div className="flex flex-wrap items-center gap-4 text-[var(--kts-font-size-xs)] text-[var(--kts-text-secondary)] font-[var(--kts-font-mono)]">
              {uptime && <span>Up: {uptime}</span>}
              <span>Click for details →</span>
            </div>
          </Card>
        </div>
      );})}

      <div key="quick-actions" data-grid={gridPos('quick-actions', { x: 0, y: 14, w: 12, h: 4, minH: 3, minW: 6 })}>
        <Card variant="dual" className="h-full">
          <CardSection title="Quick Actions" subtitle="Common fleet operations">
            <div className="flex flex-wrap gap-3">
              {quickActions.map((action) => (
                <Tooltip key={action.id} content={action.label} position="top">
                  <Button
                    variant={action.variant}
                    size="sm"
                    leftIcon={<span style={{ fontSize: '16px' }}>{action.icon}</span>}
                    onClick={action.action}
                  >
                    {action.label}
                  </Button>
                </Tooltip>
              ))}
            </div>
          </CardSection>
        </Card>
      </div>

      {/* Service Status Overview */}
      <div key="services" data-grid={gridPos('services', { x: 0, y: 18, w: 12, h: 6, minH: 5, minW: 6 })}>
        <Card className="h-full">
          <CardSection title="Service Health" subtitle="Unraid-hosted services">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                { id: 'docker', label: 'Docker', icon: '🐳', path: '/service/docker' },
                { id: 'storage', label: 'Storage', icon: '💾', path: '/service/storage' },
                { id: 'system', label: 'System', icon: '⚙', path: '/service/system' },
                { id: 'network', label: 'Network', icon: '🌐', path: '/service/network' },
                { id: 'nextcloud', label: 'Nextcloud', icon: '☁', path: '/service/nextcloud' },
                { id: 'homeassistant', label: 'Home Assistant', icon: '🏠', path: '/service/homeassistant' },
                { id: 'adguard', label: 'AdGuard', icon: '🛡', path: '/service/adguard' },
                { id: 'myspeed', label: 'MySpeed', icon: '⚡', path: '/service/myspeed' },
                { id: 'lidarr', label: 'Lidarr', icon: '🎵', path: '/service/lidarr' },
              ].map((svc) => (
                <Link key={svc.id} to={svc.path} className="group">
                  <div className="flex items-center gap-3 p-3 rounded-[var(--kts-radius-base)] transition-all duration-[var(--kts-motion-fast)] hover:bg-[var(--kts-interactive-hover)]">
                    <span style={{ fontSize: '24px' }}>{svc.icon}</span>
                    <div>
                      <p className="font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">{svc.label}</p>
                      <p className="text-[var(--kts-text-tertiary)] text-[var(--kts-font-size-xs)]">Unraid service</p>
                    </div>
                    <div className="ml-auto">
                      <StatusBadge state="running" size="xs" showDot pulsing />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardSection>
        </Card>
      </div>
      </GridLayout>
      )}
      </div>
    </div>
  );
}