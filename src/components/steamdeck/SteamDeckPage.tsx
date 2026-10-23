import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig } from '../../lib/types';
import { 
  steamdeckGetSystemStats,
  steamdeckGetBattery,
  steamdeckGetThermal,
  steamdeckGetDisk,
  steamdeckGetNetwork,
  steamdeckGetGpu,
  steamdeckLaunchRustdesk,
  steamdeckGetDeskflowStatus,
  allyProvision,
  allyLaunchAgent,
} from '../../lib/tauri-commands';

function GaugeRing({ value, label, color }: { value: number; label: string; color: string }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(139,157,179,0.16)" strokeWidth="6" />
          <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-lg font-mono font-bold">{Math.round(value)}%</span>
        </div>
      </div>
      <span className="text-xs text-muted font-mono uppercase">{label}</span>
    </div>
  );
}

function StatCard({ label, value, sub, color = 'text-off' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-mono text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-heading font-bold ${color}`}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

function CardSection({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card p-6 ${className}`}>
      <div className="kicker mb-4">{title}</div>
      {children}
    </div>
  );
}

interface Props {
  servers: ServerConfig[];
}

export function SteamDeckPage({ servers }: Props) {
  const steamdeckServer = servers.find(s => s.device_type === 'steamdeck');

  const [systemStats, setSystemStats] = useState<any>(null);
  const [battery, setBattery] = useState<any>(null);
  const [thermal, setThermal] = useState<any>(null);
  const [disk, setDisk] = useState<any>(null);
  const [network, setNetwork] = useState<any>(null);
  const [gpu, setGpu] = useState<any>(null);
  const [deskflowConnected, setDeskflowConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState(false);
  const [provisionLog, setProvisionLog] = useState<string | null>(null);
  const [summoning, setSummoning] = useState(false);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    if (!steamdeckServer) return;
    setLoading(true);
    setError(null);
    try {
      const [stats, bat, therm, dsk, net, g, desk] = await Promise.allSettled([
        steamdeckGetSystemStats(steamdeckServer.id),
        steamdeckGetBattery(steamdeckServer.id),
        steamdeckGetThermal(steamdeckServer.id),
        steamdeckGetDisk(steamdeckServer.id),
        steamdeckGetNetwork(steamdeckServer.id),
        steamdeckGetGpu(steamdeckServer.id),
        steamdeckGetDeskflowStatus(steamdeckServer.id),
      ]);
      if (stats.status === 'fulfilled') setSystemStats(stats.value);
      if (bat.status === 'fulfilled') setBattery(bat.value);
      if (therm.status === 'fulfilled') setThermal(therm.value);
      if (dsk.status === 'fulfilled') setDisk(dsk.value);
      if (net.status === 'fulfilled') setNetwork(net.value);
      if (g.status === 'fulfilled') setGpu(g.value);
      if (desk.status === 'fulfilled') setDeskflowConnected(desk.value?.connected ?? false);
      const failed = [stats, bat, therm, dsk, net, g, desk].filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        console.error('Steam Deck probes failed:', failed.map(r => (r as PromiseRejectedResult).reason));
      }
    } catch (e: any) {
      console.error('Steam Deck refresh failed:', e);
      setError(e.message);
    }
    setLoading(false);
  }, [steamdeckServer]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  const handleProvision = useCallback(async () => {
    if (!steamdeckServer) return;
    setProvisioning(true);
    setProvisionLog(null);
    try {
      const res = await allyProvision(steamdeckServer.id);
      setProvisionLog(res?.log ?? 'done');
      refreshAll();
    } catch (e: any) {
      setProvisionLog(`Provisioning error: ${e?.message ?? e}`);
    } finally {
      setProvisioning(false);
    }
  }, [steamdeckServer, refreshAll]);

  const handleLaunchAgent = useCallback(async () => {
    if (!steamdeckServer) return;
    setSummoning(true);
    setAgentStatus(null);
    try {
      const result = await allyLaunchAgent(steamdeckServer.id);
      setAgentStatus(
        result.ok
          ? `🤖 AI agent opened in a ${result.terminal ?? 'terminal'} window — monitor progress there and approve permission prompts as they appear.`
          : 'Agent failed to open.',
      );
    } catch (e: any) {
      setAgentStatus(`Agent error: ${e?.message ?? e}`);
    } finally {
      setSummoning(false);
    }
  }, [steamdeckServer]);

  if (!steamdeckServer) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-4xl mb-4">🎮</div>
          <h2 className="text-lg font-heading font-bold mb-2">No Steam Deck Connected</h2>
          <p className="text-sm text-muted">Add a Steam Deck / ROG Ally server to get started.</p>
        </div>
      </div>
    );
  }

  const batteryLevel = battery?.percentage ?? 0;
  const batteryCharging = battery?.charging ?? false;
  const cpuTemp = thermal?.cpu_temp_c;
  const gpuTemp = thermal?.gpu_temp_c;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">{steamdeckServer.name}</h1>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className={`w-2 h-2 rounded-full ${deskflowConnected ? 'bg-green' : 'bg-red'}`} />
          <span>Deskflow: {deskflowConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <GaugeRing value={systemStats?.cpu_usage ?? 0} label="CPU" color={systemStats?.cpu_usage && systemStats.cpu_usage > 80 ? '#ef4444' : '#22c55e'} />
        <GaugeRing value={systemStats?.memory_usage_pct ?? 0} label="RAM" color={systemStats?.memory_usage_pct && systemStats.memory_usage_pct > 80 ? '#ef4444' : '#3b82f6'} />
        <GaugeRing value={batteryLevel} label="Battery" color={batteryCharging ? '#22c55e' : batteryLevel > 20 ? '#f59e0b' : '#ef4444'} />
        <GaugeRing value={disk?.usage_pct ?? 0} label="Disk" color={disk?.usage_pct && disk.usage_pct > 80 ? '#ef4444' : '#8b5cf6'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSection title="System">
          {systemStats?.platform_profile && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 rounded-full bg-ink text-off font-mono text-xs">
                PROFILE: {systemStats.platform_profile}
              </span>
              {systemStats.platform_profile_choices && (
                <span className="text-xs text-muted">
                  Available: {systemStats.platform_profile_choices}
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <StatCard label="Hostname" value={systemStats?.hostname ?? '—'} />
            <StatCard label="OS" value={systemStats?.os_release ?? '—'} />
            <StatCard label="Kernel" value={systemStats?.kernel ?? '—'} />
            <StatCard label="Arch" value={systemStats?.arch ?? '—'} />
            <StatCard label="Uptime" value={systemStats?.uptime ?? '—'} />
            <StatCard label="Timezone" value={systemStats?.timezone ?? '—'} />
            <StatCard label="CPU" value={systemStats?.cpu_brand ?? '—'} sub={systemStats ? `${systemStats.cpu_cores ?? 0} cores @ ${systemStats.cpu_speed ?? 0}GHz` : undefined} />
            <StatCard label="Load Avg" value={systemStats?.load_avg ? systemStats.load_avg.map((l: number) => l.toFixed(2)).join(', ') : '—'} />
          </div>
        </CardSection>

        <CardSection title="Memory & Swap">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <StatCard label="Total RAM" value={systemStats ? `${(systemStats.memory_total_mb / 1024).toFixed(1)} GB` : '—'} />
            <StatCard label="Used RAM" value={systemStats ? `${(systemStats.memory_used_mb / 1024).toFixed(1)} GB` : '—'} />
            <StatCard label="Free RAM" value={systemStats ? `${(systemStats.memory_free_mb / 1024).toFixed(1)} GB` : '—'} />
            <StatCard label="Usage" value={systemStats && systemStats.memory_usage_pct != null ? `${systemStats.memory_usage_pct.toFixed(1)}%` : '—'} />
            <StatCard label="Total Swap" value={systemStats ? `${(systemStats.swap_total_mb / 1024).toFixed(1)} GB` : '—'} />
            <StatCard label="Used Swap" value={systemStats ? `${(systemStats.swap_used_mb / 1024).toFixed(1)} GB` : '—'} />
          </div>
        </CardSection>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CardSection title="Thermal">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <StatCard label="CPU Temp" value={cpuTemp ? `${cpuTemp}°C` : '—'} color={cpuTemp && cpuTemp > 80 ? 'text-red' : cpuTemp && cpuTemp > 60 ? 'text-yellow' : 'text-green'} />
            <StatCard label="GPU Temp" value={gpuTemp ? `${gpuTemp}°C` : '—'} color={gpuTemp && gpuTemp > 80 ? 'text-red' : gpuTemp && gpuTemp > 60 ? 'text-yellow' : 'text-green'} />
            <StatCard label="Fan Speed" value={thermal?.fan_speed_rpm ? `${thermal.fan_speed_rpm} RPM` : '—'} />
            <StatCard label="GPU Fan" value={thermal?.gpu_fan_speed_rpm ? `${thermal.gpu_fan_speed_rpm} RPM` : '—'} />
            <StatCard label="Fan PWM" value={thermal?.fan_pwm ? `${thermal.fan_pwm}%` : '—'} />
            <StatCard label="SoC Power" value={thermal?.power_w != null ? `${thermal.power_w.toFixed(1)} W` : '—'} color={thermal?.power_w != null && thermal.power_w > 28 ? 'text-red' : 'text-off'} />
          </div>
        </CardSection>

        <CardSection title="GPU">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <StatCard label="Vendor" value={gpu?.vendor ?? '—'} />
            <StatCard label="Model" value={gpu?.model ?? '—'} />
            <StatCard label="Driver" value={gpu?.driver_version ?? '—'} />
            <StatCard label="VRAM" value={gpu?.memory_total_mb ? `${(gpu.memory_total_mb / 1024).toFixed(1)} GB` : '—'} sub={gpu?.memory_used_mb ? `${(gpu.memory_used_mb / 1024).toFixed(1)} GB used` : undefined} />
            <StatCard label="GPU Temp" value={gpu?.temperature_c ? `${gpu.temperature_c}°C` : '—'} color={gpu?.temperature_c && gpu.temperature_c > 80 ? 'text-red' : gpu?.temperature_c && gpu.temperature_c > 60 ? 'text-yellow' : 'text-green'} />
            <StatCard label="Utilization" value={gpu?.utilization_pct ? `${gpu.utilization_pct}%` : '—'} />
            <StatCard label="Clock" value={gpu?.clock_mhz ? `${gpu.clock_mhz} MHz` : '—'} />
            <StatCard label="VRAM Used" value={gpu?.memory_used_mb ? `${(gpu.memory_used_mb / 1024).toFixed(2)} GB` : '—'} />
          </div>
        </CardSection>
      </div>

      <CardSection title="Disk">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <StatCard label="Total" value={disk ? `${disk.total_gb?.toFixed(1) ?? 0} GB` : '—'} />
          <StatCard label="Used" value={disk ? `${disk.used_gb?.toFixed(1) ?? 0} GB` : '—'} />
          <StatCard label="Free" value={disk ? `${disk.free_gb?.toFixed(1) ?? 0} GB` : '—'} />
          <StatCard label="Usage" value={disk && disk.usage_pct != null ? `${disk.usage_pct.toFixed(1)}%` : '—'} color={disk?.usage_pct && disk.usage_pct > 80 ? 'text-red' : 'text-off'} />
        </div>
      </CardSection>

      <CardSection title="Network">
        <div className="space-y-2">
          {network?.interfaces?.map((iface: any) => (
            <div key={iface.name} className="flex items-center justify-between p-2 bg-ink rounded text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono">{iface.name}</span>
                <span className="text-muted">{iface.ip}</span>
              </div>
              <span className="text-xs text-muted font-mono">{iface.mac}</span>
            </div>
          ))}
          {(!network?.interfaces?.length || network.interfaces.length === 0) && (
            <p className="text-sm text-muted">No network interfaces found</p>
          )}
        </div>
      </CardSection>

      <CardSection title="Battery">
        <div className="flex items-center gap-4">
          <GaugeRing value={batteryLevel} label="Battery" color={batteryCharging ? '#22c55e' : batteryLevel > 20 ? '#f59e0b' : '#ef4444'} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-mono">{batteryCharging ? '⚡ Charging' : '🔋 Discharging'}</span>
            {battery?.time_remaining && <span className="text-xs text-muted">{battery.time_remaining} remaining</span>}
            {battery?.capacity_wh && <span className="text-xs text-muted">Capacity: {battery.capacity_wh} Wh</span>}
            {battery?.energy_wh && <span className="text-xs text-muted">Current: {battery.energy_wh} Wh</span>}
            {battery?.voltage_v && <span className="text-xs text-muted">Voltage: {battery.voltage_v} V</span>}
          </div>
        </div>
      </CardSection>

      <CardSection title="Quick Actions">
        <div className="flex flex-wrap gap-3">
          <button onClick={refreshAll} disabled={loading} className="btn btn-primary">
            {loading ? '...' : '↻ Refresh All'}
          </button>
          <button onClick={() => steamdeckLaunchRustdesk(steamdeckServer.id)} className="btn btn-secondary">
            🖥 Launch RustDesk
          </button>
          <button onClick={handleProvision} disabled={provisioning} className="btn btn-secondary">
            {provisioning ? 'Provisioning…' : '🔧 Provision (stable connection)'}
          </button>
          <button onClick={handleLaunchAgent} disabled={summoning} className="btn btn-secondary">
            {summoning ? '🤖 Launching agent…' : '🤖 Summon Agent — Optimize Library'}
          </button>
          <button onClick={refreshAll} className="btn btn-ghost">📊 Refresh Stats</button>
        </div>
        {error && <p className="mt-2 text-sm text-red">{error}</p>}
        {provisionLog && (
          <pre className="mt-3 p-3 bg-ink rounded text-xs text-muted whitespace-pre-wrap">{provisionLog}</pre>
        )}
      </CardSection>

      {(summoning || agentStatus) && (
        <CardSection title="Agent — Steam Library Optimization">
          {summoning && (
            <p className="text-sm text-muted">Launching the KTS optimization agent…</p>
          )}
          {agentStatus && <p className="text-sm text-off">{agentStatus}</p>}
        </CardSection>
      )}
    </div>
  );
}