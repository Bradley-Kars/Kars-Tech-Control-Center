import { useMemo } from 'react';
import { Badge, StatusBadge } from '../ui/Badge';
import { Gauge } from '../ui/Gauge';
import { DeviceAvatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { Button, IconButton } from '../ui/Button';

interface StatusBarProps {
  servers: Array<{ id: string; name: string; device_type: string; hostname: string }>;
  fleetStats: Record<string, any>;
  localStats: any;
}

const DEVICE_ORDER = ['local', 'unraid', 'phone', 'ally', 'laptop'];

function getDeviceType(deviceType: string) {
  switch (deviceType) {
    case 'unraid': return 'unraid' as const;
    case 'phone': return 'phone' as const;
    case 'handheld':
    case 'bazzite': return 'handheld' as const;
    case 'local': return 'desktop' as const;
    default: return 'desktop' as const;
  }
}

function getDeviceLabel(deviceType: string) {
  const labels: Record<string, string> = {
    local: 'This Machine',
    unraid: 'Unraid',
    phone: 'Phone',
    handheld: 'ROG Ally',
    laptop: 'Laptop',
  };
  return labels[deviceType] || deviceType;
}

export function StatusBar({ servers, fleetStats, localStats }: StatusBarProps) {
  // Build ordered device list
  const devices = useMemo(() => {
    const result = [];
    for (const dt of DEVICE_ORDER) {
      if (dt === 'local') {
        result.push({ deviceType: 'local', server: { id: 'local', name: 'This Machine', device_type: 'local', hostname: 'localhost' }, stats: localStats });
      } else {
        const server = servers.find((s) => s.device_type === dt);
        if (server) {
          result.push({ deviceType: dt, server, stats: fleetStats[server.id] });
        }
      }
    }
    return result;
  }, [servers, fleetStats, localStats]);

  return (
    <footer
      className="status-bar flex items-center justify-between gap-4 flex-wrap"
      style={{
        height: '44px',
        padding: '0 var(--kts-space-6)',
        background: 'var(--kts-bg-tertiary)',
        borderTop: '1px solid var(--kts-border-default)',
        fontSize: 'var(--kts-font-size-xs)',
        fontFamily: 'var(--kts-font-mono)',
      }}
    >
      {/* Left: Device Status Pills */}
      <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto pb-1" role="status" aria-live="polite">
        {devices.map(({ deviceType, server, stats }) => {
          const isOnline = stats?.connected !== false && (stats?.cpu_usage !== undefined || stats?.system?.cpu_usage !== undefined);
          const cpu = stats?.system?.cpu_usage ?? stats?.cpu_usage ?? 0;
          const mem = stats?.system?.memory_usage_pct ?? stats?.memory_usage_pct ?? 0;
          const temp = stats?.system?.thermal?.cpu_temp_c ?? stats?.temp_avg ?? stats?.thermal?.cpu_temp_c;

          return (
            <Tooltip key={server.id} content={`${getDeviceLabel(deviceType)} (${server.hostname})`} position="top" delay={300}>
              <div
                className={[
                  'flex items-center gap-2 px-2 py-1.5 rounded-[var(--kts-radius-base)]',
                  'transition-all duration-[var(--kts-motion-fast)]',
                  'bg-[var(--kts-bg-secondary)] border',
                  isOnline ? 'border-[var(--kts-border-success)]' : 'border-[var(--kts-border-error)]',
                  'cursor-default select-none whitespace-nowrap',
                ].join(' ')}
              >
                <DeviceAvatar type={getDeviceType(deviceType)} status={isOnline ? 'online' : 'offline'} size="xs" />
                <div className="flex items-center gap-1.5">
                  <StatusBadge state={isOnline ? 'running' : 'stopped'} size="xs" showDot pulsing={isOnline} />
                  <span className="font-medium text-[var(--kts-text-primary)]">{getDeviceLabel(deviceType)}</span>
                  <span className="text-[var(--kts-text-tertiary)]">|</span>
                  <span className="text-[var(--kts-text-secondary)]">CPU</span>
                  <Gauge size="xs" value={cpu} variant={cpu > 80 ? 'danger' : cpu > 50 ? 'warning' : 'success'} showValue valueFormatter={(v) => `${Math.round(v)}%`} />
                  <span className="text-[var(--kts-text-tertiary)]">|</span>
                  <span className="text-[var(--kts-text-secondary)]">RAM</span>
                  <Gauge size="xs" value={mem} variant={mem > 85 ? 'danger' : mem > 60 ? 'warning' : 'success'} showValue valueFormatter={(v) => `${Math.round(v)}%`} />
                  {temp != null && (
                    <>
                      <span className="text-[var(--kts-text-tertiary)]">|</span>
                      <span className="text-[var(--kts-text-secondary)]">Temp</span>
                      <Badge
                        variant={temp > 75 ? 'danger' : temp > 55 ? 'warning' : 'success'}
                        size="xs"
                        className="font-[var(--kts-font-mono)]"
                      >
                        {Math.round(temp)}°C
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* Right: Global Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <Tooltip content="Refresh All Data (⌘R)" position="top">
          <Button variant="ghost" size="xs" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>} onClick={() => console.log('Refresh all')}>
            Refresh
          </Button>
        </Tooltip>

        <Tooltip content="Open Settings" position="top">
          <IconButton variant="ghost" size="sm" aria-label="Open Settings" onClick={() => console.log('Open settings')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </IconButton>
        </Tooltip>

        {/* Version */}
        <span className="text-[var(--kts-text-tertiary)] hidden lg:inline" style={{ fontSize: '10px' }}>
          v1.0.0-dev
        </span>
      </div>
    </footer>
  );
}