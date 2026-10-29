import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useServers, useLocalStats, useFleetStats } from '../hooks';
import { Card, CardSection } from '../components/ui/Card';
import { Gauge } from '../components/ui/Gauge';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { IconButton } from '../components/ui/Button';
import { DeviceAvatar } from '../components/ui/Avatar';
import { Tooltip } from '../components/ui/Tooltip';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { PhonePage } from '../components/phone/PhonePage';
import { SteamDeckPage } from '../components/steamdeck/SteamDeckPage';
import { ToastManager, useToast } from '../components/ui/Toast';
import {
  meshcentralReboot,
  meshcentralShutdown,
  meshcentralGetTerminalUrl,
  meshcentralGetFileManagerUrl,
  meshcentralGetProcesses,
  meshcentralGetSystemStats,
} from '../lib/tauri-commands';
import type { RemoteProcess, MeshSystemStats } from '../lib/types';
import { EmbeddedTerminal } from '../components/terminal/EmbeddedTerminal';

type DeviceId = 'local' | 'unraid' | 'phone' | 'ally' | 'laptop';

const DEVICE_META: Record<DeviceId, { label: string; deviceType: 'desktop' | 'unraid' | 'phone' | 'handheld' | 'laptop'; hostname: string; blurb: string }> = {
  local: { label: 'This Machine', deviceType: 'desktop', hostname: 'localhost', blurb: 'Omarchy workstation running KTS Master Control' },
  unraid: { label: 'Unraid Server', deviceType: 'unraid', hostname: 'home-server.tailf6d3b4.ts.net', blurb: 'Primary home server — storage, containers, media stack' },
  phone: { label: 'Galaxy S24 Ultra', deviceType: 'phone', hostname: 'bradleys-s24-ultra', blurb: 'Daily driver — telemetry, KDE Connect, SMS' },
  ally: { label: 'ROG Ally', deviceType: 'handheld', hostname: 'lgbtally', blurb: 'Bazzite handheld — Sunshine host, gaming' },
  laptop: { label: 'Senpai Laptop', deviceType: 'laptop', hostname: 'senpais-laptop', blurb: 'Bazzite NVIDIA laptop over Tailscale' },
};

function isDeviceId(v: string | undefined): v is DeviceId {
  return !!v && v in DEVICE_META;
}

/** Resolve the ServerConfig for a device id (null for the local machine). */
function useDeviceServer(deviceId: DeviceId) {
  const { servers } = useServers();
  const deviceType = deviceId === 'ally' ? 'steamdeck' : deviceId;
  return useMemo(() => {
    if (deviceId === 'local') return null;
    return servers.find((s) => s.device_type === deviceType) ?? null;
  }, [servers, deviceId, deviceType]);
}

export function DevicePage() {
  const { deviceId } = useParams();

  if (!isDeviceId(deviceId)) {
    return (
      <div className="space-y-6">
        <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
          Device not found
        </h1>
        <p className="text-[var(--kts-text-secondary)]">
          No device named “{deviceId}”. <Link className="text-[var(--kts-text-link)]" to="/dashboard">Back to dashboard</Link>
        </p>
      </div>
    );
  }

  switch (deviceId) {
    case 'phone':
      return <PhoneDevice />;
    case 'ally':
      return <AllyDevice />;
    case 'local':
      return <LocalDevice />;
    case 'unraid':
      return <UnraidDevice />;
    case 'laptop':
      return <LaptopDevice />;
  }
}

/* ------------------------------------------------------------------ */
/* Shared header                                                       */
/* ------------------------------------------------------------------ */

function DeviceHeader({
  deviceId,
  status,
  onRefresh,
  extraActions,
}: {
  deviceId: DeviceId;
  status: 'online' | 'offline' | 'warning' | 'unknown';
  onRefresh?: () => void;
  extraActions?: React.ReactNode;
}) {
  const meta = DEVICE_META[deviceId];
  const badgeState = status === 'online' ? 'running' : status === 'offline' ? 'stopped' : status === 'warning' ? 'warning' : 'unknown';
  const badgeLabel = status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : status === 'warning' ? 'Warning' : 'Unknown';
  return (
    <div className="flex flex-wrap items-center gap-4">
      <DeviceAvatar type={meta.deviceType} name={meta.label} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-[var(--kts-font-heading)] font-bold truncate" style={{ fontSize: 'var(--kts-font-size-3xl)', letterSpacing: '-0.02em' }}>
            {meta.label}
          </h1>
          <StatusBadge state={badgeState} label={badgeLabel} pulsing={status === 'online'} />
        </div>
        <p className="text-[var(--kts-text-secondary)] mt-0.5" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
          {meta.blurb}
        </p>
        <p className="font-[var(--kts-font-mono)] text-[var(--kts-text-tertiary)] truncate" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
          {meta.hostname}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {extraActions}
        {onRefresh && (
          <Tooltip content="Refresh" position="bottom">
            <IconButton variant="ghost" size="sm" onClick={onRefresh} aria-label="Refresh device data">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </IconButton>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local machine                                                       */
/* ------------------------------------------------------------------ */

function LocalDevice() {
  const { stats, loading, refresh } = useLocalStats(5000);
  const system = stats?.system;
  const thermal = stats?.thermal;
  const gpu = stats?.gpu;

  const cpu = system?.cpu_usage ?? 0;
  const mem = system?.memory_usage_pct ?? 0;
  const gpuUtil = gpu?.utilization_pct ?? null;
  const cpuTemp = thermal?.cpu_temp_c ?? thermal?.average ?? null;

  return (
    <div className="space-y-6">
      <DeviceHeader deviceId="local" status={loading ? 'unknown' : system ? 'online' : 'offline'} onRefresh={refresh} />

      {/* Vitals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card padded>
          <Gauge size="base" value={cpu} variant={loading ? 'default' : cpu > 80 ? 'danger' : cpu > 50 ? 'warning' : 'success'} label="CPU" showValue loading={loading} />
        </Card>
        <Card padded>
          <Gauge size="base" value={mem} variant={loading ? 'default' : mem > 85 ? 'danger' : mem > 60 ? 'warning' : 'success'} label="Memory" showValue loading={loading} />
        </Card>
        <Card padded>
          <Gauge size="base" value={gpuUtil ?? 0} variant={loading ? 'default' : 'info'} label="GPU" showValue={gpuUtil != null} loading={loading} />
          {gpuUtil == null && (
            <p className="text-center text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>No dGPU</p>
          )}
        </Card>
        <Card padded>
          <Gauge size="base" value={cpuTemp != null ? Math.min(100, cpuTemp) : 0} variant={loading || cpuTemp == null ? 'default' : cpuTemp > 80 ? 'danger' : cpuTemp > 65 ? 'warning' : 'success'} label="Temp" showValue={cpuTemp != null} loading={loading} valueFormatter={cpuTemp != null ? () => `${Math.round(cpuTemp)}°C` : undefined} />
          {cpuTemp == null && (
            <p className="text-center text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>No sensor</p>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System details */}
        <Card>
          <CardSection title="System" subtitle="This machine">
            <dl className="divide-y divide-[var(--kts-border-default)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
              {[
                ['Hostname', system?.hostname ?? '—'],
                ['Kernel', system?.kernel ?? '—'],
                ['Uptime', system?.uptime ?? '—'],
                ['CPU', system?.cpu_brand ?? '—'],
                ['Cores', system?.cpu_cores != null ? String(system.cpu_cores) : '—'],
                ['Memory', system?.memory_total_mb != null ? `${Math.round(system.memory_used_mb ?? 0)} / ${Math.round(system.memory_total_mb)} MB` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2.5 gap-4">
                  <dt className="text-[var(--kts-text-secondary)]">{k}</dt>
                  <dd className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)] truncate text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </CardSection>
        </Card>

        {/* More details / GPU */}
        <Card>
          <CardSection title={gpu ? 'Graphics' : 'Thermals'} subtitle={gpu ? gpu.name ?? 'GPU' : 'Sensors'}>
            {gpu ? (
              <dl className="divide-y divide-[var(--kts-border-default)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                {[
                  ['GPU', gpu.name ?? '—'],
                  ['Utilization', gpu.utilization_pct != null ? `${gpu.utilization_pct}%` : '—'],
                  ['Memory', gpu.memory_used_mb != null ? `${Math.round(gpu.memory_used_mb)} / ${Math.round(gpu.memory_total_mb ?? 0)} MB` : '—'],
                  ['Temperature', gpu.temperature_c != null ? `${Math.round(gpu.temperature_c)}°C` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-2.5 gap-4">
                    <dt className="text-[var(--kts-text-secondary)]">{k}</dt>
                    <dd className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)] truncate text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : thermal ? (
              <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                CPU {thermal.cpu_temp_c != null ? `${Math.round(thermal.cpu_temp_c)}°C` : '—'}
                {thermal.gpu_temp_c != null ? ` · GPU ${Math.round(thermal.gpu_temp_c)}°C` : ''}
              </p>
            ) : (
              <p className="text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>No sensor data available.</p>
            )}
          </CardSection>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Unraid server                                                       */
/* ------------------------------------------------------------------ */

function UnraidDevice() {
  const { servers, loading } = useServers();
  const { fleetStats, refresh } = useFleetStats(servers, 5000);
  const [confirmAction, setConfirmAction] = useState<'reboot' | 'shutdown' | null>(null);
  const [busy, setBusy] = useState(false);
  const { toasts, removeToast, addToast } = useToast();

  // Process browser (fetched over MeshCentral)
  const [showProcesses, setShowProcesses] = useState(false);
  const [processes, setProcesses] = useState<RemoteProcess[]>([]);
  const [procLoading, setProcLoading] = useState(false);

  // Embedded SSH terminal (direct fallback — MC web terminal stays primary)
  const [showTerminal, setShowTerminal] = useState(false);

  const server = servers.find((s) => s.device_type === 'unraid');
  const stats = server ? fleetStats[server.id] : null;
  const connected = !!server && stats?.connected !== false && stats != null;
  const mcEnrolled = !!server?.meshcentral_device_id;

  const cpu = stats?.cpu_usage ?? 0;
  const mem = stats?.memory_usage_pct ?? 0;
  const tempSensors = stats?.temperature_sensors as Array<{ name: string; value: number }> | undefined;
  const hottest = tempSensors?.length ? Math.max(...tempSensors.map((s) => s.value)) : (stats?.temp_avg ?? null);

  const runPowerAction = async () => {
    if (!server || !confirmAction) return;
    setBusy(true);
    try {
      // MeshCentral is the PRIMARY transport — direct GraphQL/SSH only as fallback
      if (mcEnrolled) {
        if (confirmAction === 'reboot') await meshcentralReboot(server.id);
        else await meshcentralShutdown(server.id);
        addToast({ type: 'success', title: 'Power command sent', message: `${confirmAction === 'reboot' ? 'Reboot' : 'Shutdown'} issued via MeshCentral` });
      } else {
        if (confirmAction === 'reboot') await meshcentralReboot(server.id);
        else await meshcentralShutdown(server.id);
        addToast({ type: 'success', title: 'Power command sent', message: `${confirmAction === 'reboot' ? 'Reboot' : 'Shutdown'} issued via direct transport` });
      }
    } catch (e) {
      addToast({ type: 'error', title: 'Power command failed', message: e instanceof Error ? e.message : 'Unknown error' });
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const openMCTerminal = async () => {
    if (!server) return;
    try {
      const url = await meshcentralGetTerminalUrl(server.id);
      window.open(url, '_blank', 'width=1200,height=800');
    } catch (e) {
      addToast({ type: 'error', title: 'Terminal failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const openMCFiles = async () => {
    if (!server) return;
    try {
      const url = await meshcentralGetFileManagerUrl(server.id);
      window.open(url, '_blank', 'width=1200,height=800');
    } catch (e) {
      addToast({ type: 'error', title: 'File manager failed', message: e instanceof Error ? e.message : 'Unknown error' });
    }
  };

  const openProcesses = async () => {
    if (!server) return;
    setShowProcesses(true);
    setProcLoading(true);
    try {
      setProcesses(await meshcentralGetProcesses(server.id, 50));
    } catch (e) {
      addToast({ type: 'error', title: 'Process list failed', message: e instanceof Error ? e.message : 'Unknown error' });
      setShowProcesses(false);
    } finally {
      setProcLoading(false);
    }
  };

  const serviceLinks = [
    { id: 'docker', label: 'Docker', icon: '🐳', desc: 'Containers' },
    { id: 'storage', label: 'Storage', icon: '💾', desc: 'Array & disks' },
    { id: 'system', label: 'System', icon: '⚙', desc: 'Processes & logs' },
    { id: 'network', label: 'Network', icon: '🌐', desc: 'Interfaces & Tailscale' },
  ];

  return (
    <div className="space-y-6">
      <DeviceHeader
        deviceId="unraid"
        status={loading ? 'unknown' : connected ? 'online' : 'offline'}
        onRefresh={refresh}
        extraActions={
          <>
            {mcEnrolled && (
              <>
                <Tooltip content="MeshCentral Terminal" position="bottom">
                  <IconButton variant="ghost" size="sm" onClick={openMCTerminal} aria-label="Open MeshCentral terminal">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                  </IconButton>
                </Tooltip>
                <Tooltip content="MeshCentral File Manager" position="bottom">
                  <IconButton variant="ghost" size="sm" onClick={openMCFiles} aria-label="Open MeshCentral file manager">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </IconButton>
                </Tooltip>
                <Tooltip content="Processes via MeshCentral" position="bottom">
                  <IconButton variant="ghost" size="sm" onClick={openProcesses} aria-label="View processes via MeshCentral">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </IconButton>
                </Tooltip>
              </>
            )}
            <Tooltip content="Embedded Terminal (SSH)" position="bottom">
              <IconButton variant="ghost" size="sm" onClick={() => setShowTerminal(true)} aria-label="Open embedded SSH terminal">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <polyline points="6 9 9.5 12 6 15" />
                  <line x1="12.5" y1="15" x2="17" y2="15" />
                </svg>
              </IconButton>
            </Tooltip>
            <Tooltip content="Reboot Unraid" position="bottom">
              <IconButton variant="ghost" size="sm" onClick={() => setConfirmAction('reboot')} aria-label="Reboot Unraid">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </IconButton>
            </Tooltip>
            <Tooltip content="Shutdown Unraid" position="bottom">
              <IconButton variant="ghost" size="sm" onClick={() => setConfirmAction('shutdown')} aria-label="Shutdown Unraid">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                  <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
              </IconButton>
            </Tooltip>
          </>
        }
      />

      {!server ? (
        <Card padded>
          <p className="text-[var(--kts-text-secondary)]">
            No Unraid server configured yet. Add it from the connection screen to see live stats.
          </p>
        </Card>
      ) : !connected && !loading ? (
        <Card padded>
          <div className="flex items-center gap-3">
            <Badge variant="danger" size="sm">Offline</Badge>
            <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
              Can’t reach <span className="font-[var(--kts-font-mono)]">{server.hostname}</span> — check Tailscale or the server’s power.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Vitals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card padded>
              <Gauge size="base" value={cpu} variant={loading ? 'default' : cpu > 80 ? 'danger' : cpu > 50 ? 'warning' : 'success'} label="CPU" showValue loading={loading} />
            </Card>
            <Card padded>
              <Gauge size="base" value={mem} variant={loading ? 'default' : mem > 85 ? 'danger' : mem > 60 ? 'warning' : 'success'} label="Memory" showValue loading={loading} />
            </Card>
            <Card padded>
              <Gauge
                size="base"
                value={hottest != null ? Math.min(100, hottest) : 0}
                variant={loading || hottest == null ? 'default' : hottest > 75 ? 'danger' : hottest > 55 ? 'warning' : 'success'}
                label="Hottest"
                showValue={hottest != null}
                loading={loading}
                valueFormatter={hottest != null ? () => `${Math.round(hottest)}°C` : undefined}
              />
            </Card>
            <Card padded>
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <Badge variant={stats?.array_state === 'Started' ? 'success' : 'warning'} size="sm">
                  Array {stats?.array_state ?? '…'}
                </Badge>
                <span className="text-[var(--kts-text-tertiary)] font-[var(--kts-font-mono)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
                  {stats?.hostname ?? server.hostname}
                </span>
              </div>
            </Card>
          </div>

          {/* Service shortcuts */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {serviceLinks.map((svc) => (
              <Link key={svc.id} to={`/service/${svc.id}`} className="group">
                <Card padded className="transition-all duration-[var(--kts-motion-fast)] group-hover:border-[var(--kts-brand-primary)] h-full">
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: '22px' }}>{svc.icon}</span>
                    <div className="min-w-0">
                      <p className="font-medium text-[var(--kts-text-primary)] group-hover:text-[var(--kts-brand-primary)] transition-colors" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                        {svc.label}
                      </p>
                      <p className="text-[var(--kts-text-tertiary)] truncate" style={{ fontSize: 'var(--kts-font-size-xs)' }}>{svc.desc}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* System details */}
          <Card>
            <CardSection title="Server" subtitle={server.hostname}>
              <dl className="divide-y divide-[var(--kts-border-default)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                {[
                  ['Hostname', stats?.hostname ?? server.hostname],
                  ['CPU', stats?.cpu_brand ?? '—'],
                  ['Cores', stats?.cpu_cores != null ? `${stats.cpu_cores} cores / ${stats.cpu_threads ?? '—'} threads` : '—'],
                  ['Memory', stats?.memory_total_mb != null ? `${Math.round(stats.memory_used_mb ?? 0)} / ${Math.round(stats.memory_total_mb)} MB` : '—'],
                  ['Uptime', stats?.uptime ?? '—'],
                  ['Array', stats?.array_state ?? '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between py-2.5 gap-4">
                    <dt className="text-[var(--kts-text-secondary)]">{k}</dt>
                    <dd className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)] truncate text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardSection>
          </Card>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmAction !== null}
        title={confirmAction === 'reboot' ? 'Reboot Unraid?' : 'Shutdown Unraid?'}
        message={
          confirmAction === 'reboot'
            ? 'The server will restart. All containers and shares will be unavailable until it is back online.'
            : 'The server will power off. You will need physical or Wake-on-LAN access to bring it back.'
        }
        confirmText={confirmAction === 'reboot' ? 'Reboot' : 'Shutdown'}
        variant="danger"
        loading={busy}
        onConfirm={runPowerAction}
        onClose={() => setConfirmAction(null)}
      />

      <Modal
        isOpen={showProcesses}
        onClose={() => setShowProcesses(false)}
        title="Processes"
        description={mcEnrolled ? 'Live process list via MeshCentral' : undefined}
        size="lg"
      >
        {procLoading ? (
          <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>Fetching process list via MeshCentral…</p>
        ) : (
          <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
            <table className="w-full" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
              <thead>
                <tr className="text-left text-[var(--kts-text-tertiary)] border-b border-[var(--kts-border-default)]">
                  <th className="py-2 pr-3 font-medium">PID</th>
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium text-right">CPU%</th>
                  <th className="py-2 pr-3 font-medium text-right">MEM%</th>
                  <th className="py-2 font-medium">User</th>
                </tr>
              </thead>
              <tbody className="font-[var(--kts-font-mono)]">
                {processes.map((p) => (
                  <tr key={p.pid} className="border-b border-[var(--kts-border-default)] last:border-0">
                    <td className="py-1.5 pr-3 text-[var(--kts-text-secondary)]">{p.pid}</td>
                    <td className="py-1.5 pr-3 text-[var(--kts-text-primary)] truncate max-w-[220px]" title={p.command ?? p.name}>{p.name}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--kts-text-secondary)]">{p.cpu_percent != null ? p.cpu_percent.toFixed(1) : '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-[var(--kts-text-secondary)]">{p.memory_percent != null ? p.memory_percent.toFixed(1) : '—'}</td>
                    <td className="py-1.5 text-[var(--kts-text-secondary)]">{p.user ?? '—'}</td>
                  </tr>
                ))}
                {processes.length === 0 && (
                  <tr><td colSpan={5} className="py-3 text-[var(--kts-text-tertiary)]">No processes returned.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
        title="Terminal"
        description={server ? `SSH PTY → ${server.hostname} · MeshCentral web terminal remains the primary path` : undefined}
        size="xl"
        closeOnEscape={false}
      >
        {server && <EmbeddedTerminal serverId={server.id} />}
      </Modal>

      <ToastManager toasts={toasts} onClose={removeToast} position="top-right" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phone & Ally — delegate to existing full pages                      */
/* ------------------------------------------------------------------ */

function PhoneDevice() {
  const { servers } = useServers();
  return <PhonePage servers={servers} />;
}

function AllyDevice() {
  const { servers } = useServers();
  return <SteamDeckPage servers={servers} />;
}

/* ------------------------------------------------------------------ */
/* Laptop                                                              */
/* ------------------------------------------------------------------ */

function LaptopDevice() {
  const server = useDeviceServer('laptop');
  const [mcStats, setMcStats] = useState<MeshSystemStats | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const mcEnrolled = !!server?.meshcentral_device_id;

  useEffect(() => {
    if (!server?.meshcentral_device_id) {
      setMcStats(null);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const s = await meshcentralGetSystemStats(server.id);
        if (alive) setMcStats(s);
      } catch {
        // MC unreachable — keep last stats; card shows the fallback note
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [server?.id, server?.meshcentral_device_id]);

  return (
    <div className="space-y-6">
      <DeviceHeader
        deviceId="laptop"
        status={server ? 'online' : 'unknown'}
        extraActions={
          <Tooltip content="Embedded Terminal (SSH)" position="bottom">
            <IconButton variant="ghost" size="sm" onClick={() => setShowTerminal(true)} aria-label="Open embedded SSH terminal">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <polyline points="6 9 9.5 12 6 15" />
                <line x1="12.5" y1="15" x2="17" y2="15" />
              </svg>
            </IconButton>
          </Tooltip>
        }
      />

      <Card>
        <CardSection title="Connection" subtitle={mcEnrolled ? 'MeshCentral (primary) + Tailscale' : 'Tailscale'}>
          <dl className="divide-y divide-[var(--kts-border-default)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            {[
              ['Hostname', server?.hostname ?? DEVICE_META.laptop.hostname],
              ['Address', 'senpais-laptop.tailf6d3b4.ts.net'],
              ['Transport', mcEnrolled ? 'MeshCentral → SSH fallback' : 'Tailscale SSH'],
              ['OS', 'Bazzite (Fedora ostree, NVIDIA)'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2.5 gap-4">
                <dt className="text-[var(--kts-text-secondary)]">{k}</dt>
                <dd className="font-[var(--kts-font-mono)] text-[var(--kts-text-primary)] truncate text-right">{v}</dd>
              </div>
            ))}
          </dl>
        </CardSection>
      </Card>

      {mcEnrolled ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padded>
            <Gauge size="base" value={mcStats?.cpu_usage ?? 0} variant={!mcStats ? 'default' : mcStats.cpu_usage > 80 ? 'danger' : mcStats.cpu_usage > 50 ? 'warning' : 'success'} label="CPU" showValue loading={!mcStats} />
          </Card>
          <Card padded>
            <Gauge size="base" value={mcStats?.memory_usage_pct ?? 0} variant={!mcStats ? 'default' : mcStats.memory_usage_pct > 85 ? 'danger' : mcStats.memory_usage_pct > 60 ? 'warning' : 'success'} label="Memory" showValue loading={!mcStats} />
          </Card>
          <Card padded>
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <Badge variant="info" size="sm" dot>via MeshCentral</Badge>
              <span className="text-[var(--kts-text-secondary)] font-[var(--kts-font-mono)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
                {mcStats?.uptime ?? '—'}
              </span>
              <span className="text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>Uptime</span>
            </div>
          </Card>
          <Card padded>
            <div className="flex flex-col items-center justify-center h-full gap-1">
              <span className="text-[var(--kts-text-primary)] font-semibold font-[var(--kts-font-mono)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                {mcStats ? `${mcStats.memory_used_mb ?? 0} / ${mcStats.memory_total_mb ?? 0} MB` : '—'}
              </span>
              <span className="text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>RAM used</span>
              <span className="text-[var(--kts-text-tertiary)] font-[var(--kts-font-mono)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
                {mcStats?.cpu_brand ? `${mcStats.cpu_cores ?? '?'}C/${mcStats.cpu_threads ?? '?'}T` : ''}
              </span>
            </div>
          </Card>
        </div>
      ) : (
        <Card padded>
          <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            Detailed telemetry for Senpai-Laptop is not wired up yet — enroll it in MeshCentral to get live stats over the agent.
          </p>
        </Card>
      )}

      <Modal
        isOpen={showTerminal}
        onClose={() => setShowTerminal(false)}
        title="Terminal"
        description={server ? `SSH PTY → ${server.hostname} · MeshCentral web terminal remains the primary path` : undefined}
        size="xl"
        closeOnEscape={false}
      >
        {server && <EmbeddedTerminal serverId={server.id} />}
      </Modal>
    </div>
  );
}
