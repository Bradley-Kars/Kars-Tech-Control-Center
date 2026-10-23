import { useState, useEffect, useCallback } from 'react';
import type { ServerConfig, GpuInfo } from '../../lib/types';
import { 
  getGpuInfo, 
  getDockerContainers, 
  meshcentralReboot, 
  meshcentralShutdown,
  getArrayInfo,
  getPhoneDeviceInfo,
  getPhoneBattery,
  getPhoneMemory,
  getPhoneCpu,
  getPhoneStorage,
  getKdeConnectNotifications,
  getKdeConnectMpris,
  getAdGuardStats,
  getMySpeedSummary,
  steamdeckGetBattery,
  steamdeckGetThermal,
  steamdeckGetDeskflowStatus,
  steamdeckGetSystemStats,
  steamdeckGetDisk,
  steamdeckGetGpu,
  getLocalSystemStats,
} from '../../lib/tauri-commands';

type Page = 'dashboard' | 'phone' | 'steamdeck' | 'docker' | 'storage' | 'system' | 'network' | 'nextcloud' | 'lidarr' | 'homeassistant' | 'myspeed' | 'adguard';

interface Props {
  servers: ServerConfig[];
  stats: any;
  onRefresh: () => void;
  onNavigate?: (page: Page) => void;
}

function GaugeRing({ value, label, color, size = 'md' }: { value: number; label: string; color: string; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 80 : 96;
  const radius = size === 'sm' ? 32 : 40;
  const stroke = size === 'sm' ? 5 : 6;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: dim, height: dim }}>
        <svg width={dim} height={dim} className="-rotate-90" viewBox={`0 0 100 100`}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(139,157,179,0.16)" strokeWidth={stroke} />
          <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth={stroke}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono font-bold" style={{ fontSize: size === 'sm' ? '1rem' : '1.125rem' }}>
            {Number.isFinite(value) ? `${Math.round(value)}%` : '—'}
          </span>
        </div>
      </div>
      {label && <span className="text-xs text-muted font-mono uppercase">{label}</span>}
    </div>
  );
}

function CardSection({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`card p-5 h-full flex flex-col ${className}`}>
      <div className="kicker mb-3">{title}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function RowSection({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="kicker mb-0">{title}</h2>
        {right}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">{children}</div>
    </section>
  );
}

function RowLine({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-2 text-sm ${className}`}>
      <span className="text-muted">{label}</span>
      <span className="font-mono text-right">{value}</span>
    </div>
  );
}

export function Dashboard({ servers, stats, onRefresh, onNavigate: _onNavigate }: Props) {
  const unraidServer = servers.find(s => s.device_type === 'unraid');
  const phoneServer = servers.find(s => s.device_type === 'phone');
  const steamdeckServer = servers.find(s => s.device_type === 'steamdeck');

  // This System (local controller)
  const [localData, setLocalData] = useState<any>(null);

  // Unraid summary data
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [containers, setContainers] = useState<any[]>([]);
  const [arrayInfo, setArrayInfo] = useState<any>(null);

  // Phone summary data
  const [phoneDeviceInfo, setPhoneDeviceInfo] = useState<any>(null);
  const [phoneBattery, setPhoneBattery] = useState<any>(null);
  const [phoneMemory, setPhoneMemory] = useState<any>(null);
  const [phoneCpu, setPhoneCpu] = useState<any>(null);
  const [phoneStorage, setPhoneStorage] = useState<any>(null);
  const [phoneNotifications, setPhoneNotifications] = useState<any[]>([]);
  const [phoneMpris, setPhoneMpris] = useState<any>(null);

  // Steam Deck summary data
  const [steamdeckBattery, setSteamdeckBattery] = useState<any>(null);
  const [steamdeckThermal, setSteamdeckThermal] = useState<any>(null);
  const [steamdeckDeskflow, setSteamdeckDeskflow] = useState(false);
  const [steamdeckStats, setSteamdeckStats] = useState<any>(null);
  const [steamdeckDisk, setSteamdeckDisk] = useState<any>(null);
  const [steamdeckGpu, setSteamdeckGpu] = useState<any>(null);

  // AdGuard & MySpeed data
  const [adguardStats, setAdguardStats] = useState<any>(null);
  const [myspeedStats, setMyspeedStats] = useState<any>(null);

  const refreshLocal = useCallback(async () => {
    try {
      const data = await getLocalSystemStats();
      setLocalData(data && data.system ? data : null);
    } catch (e) { console.error('getLocalSystemStats failed:', e); setLocalData(null); }
  }, []);

  const refreshGpu = useCallback(async () => {
    if (!unraidServer) return;
    try {
      const g = await getGpuInfo(unraidServer.id);
      setGpu(g);
    } catch (e) { console.error(`getGpuInfo(${unraidServer.id}) failed:`, e); setGpu(null); }
  }, [unraidServer]);

  const refreshContainers = useCallback(async () => {
    if (!unraidServer) return;
    try {
      const c = await getDockerContainers(unraidServer.id);
      setContainers(c || []);
    } catch (e) { console.error(`getDockerContainers(${unraidServer.id}) failed:`, e); setContainers([]); }
  }, [unraidServer]);

  const refreshArray = useCallback(async () => {
    if (!unraidServer) return;
    try {
      const info = await getArrayInfo(unraidServer.id);
      setArrayInfo(info || null);
    } catch (e) { console.error('getArrayInfo failed:', e); setArrayInfo(null); }
  }, [unraidServer]);

  const refreshPhone = useCallback(async () => {
    if (!phoneServer) return;
    try {
      const dev = await getPhoneDeviceInfo(phoneServer.id);
      setPhoneDeviceInfo(dev);

      const [bat, mem, cpu, storage, notif, mpris] = await Promise.allSettled([
        getPhoneBattery(phoneServer.id),
        getPhoneMemory(phoneServer.id),
        getPhoneCpu(phoneServer.id),
        getPhoneStorage(phoneServer.id),
        getKdeConnectNotifications(phoneServer.id),
        getKdeConnectMpris(phoneServer.id),
      ]);

      if (bat.status === 'fulfilled') setPhoneBattery(bat.value);
      if (mem.status === 'fulfilled') setPhoneMemory(mem.value);
      if (cpu.status === 'fulfilled') setPhoneCpu(cpu.value);
      if (storage.status === 'fulfilled') setPhoneStorage(storage.value);
      if (notif.status === 'fulfilled') setPhoneNotifications(notif.value || []);
      if (mpris.status === 'fulfilled') setPhoneMpris(mpris.value);
    } catch (e) {
      console.error('Phone refresh failed:', e);
      // Phone unreachable — leave existing data as-is.
    }
  }, [phoneServer]);

  const refreshSteamdeck = useCallback(async () => {
    if (!steamdeckServer) return;
    try {
      const [bat, therm, desk, stats, disk, gpuRes] = await Promise.allSettled([
        steamdeckGetBattery(steamdeckServer.id),
        steamdeckGetThermal(steamdeckServer.id),
        steamdeckGetDeskflowStatus(steamdeckServer.id),
        steamdeckGetSystemStats(steamdeckServer.id),
        steamdeckGetDisk(steamdeckServer.id),
        steamdeckGetGpu(steamdeckServer.id),
      ]);

      // Online = battery probe answered (any individual failure is contained).
      if (bat.status === 'fulfilled') setSteamdeckBattery(bat.value);
      if (therm.status === 'fulfilled') setSteamdeckThermal(therm.value);
      if (desk.status === 'fulfilled') setSteamdeckDeskflow(desk.value?.connected ?? false);
      if (stats.status === 'fulfilled') setSteamdeckStats(stats.value);
      if (disk.status === 'fulfilled') setSteamdeckDisk(disk.value);
      if (gpuRes.status === 'fulfilled') setSteamdeckGpu(gpuRes.value);
    } catch (e) {
      console.error('Steam Deck refresh failed:', e);
      // Handheld unreachable — leave existing data as-is.
    }
  }, [steamdeckServer]);

  const refreshAdguard = useCallback(async () => {
    if (!unraidServer) return;
    try {
      const stats = await getAdGuardStats(unraidServer.id);
      setAdguardStats(stats);
    } catch (e) { console.error(`getAdGuardStats(${unraidServer.id}) failed:`, e); setAdguardStats(null); }
  }, [unraidServer]);

  const refreshMyspeed = useCallback(async () => {
    if (!unraidServer) return;
    try {
      const stats = await getMySpeedSummary(unraidServer.id);
      setMyspeedStats(stats);
    } catch (e) { console.error(`getMySpeedSummary(${unraidServer.id}) failed:`, e); setMyspeedStats(null); }
  }, [unraidServer]);

  useEffect(() => {
    refreshLocal();
    refreshGpu();
    refreshContainers();
    refreshArray();
    refreshPhone();
    refreshSteamdeck();
    refreshAdguard();
    refreshMyspeed();
    const interval = setInterval(() => {
      refreshLocal();
      refreshGpu();
      refreshContainers();
      refreshArray();
      refreshPhone();
      refreshSteamdeck();
      refreshAdguard();
      refreshMyspeed();
    }, 10000);
    return () => clearInterval(interval);
  }, [refreshLocal, refreshGpu, refreshContainers, refreshArray, refreshPhone, refreshSteamdeck, refreshAdguard, refreshMyspeed]);

  const memTotalMB = stats?.memory_total_mb || (stats?.memory_total_bytes ? stats.memory_total_bytes / (1024 * 1024) : 0);
  const memUsedMB = stats?.memory_used_mb || (stats?.memory_used_bytes ? stats.memory_used_bytes / (1024 * 1024) : 0);
  const memPct = stats?.memory_usage_pct || (memTotalMB > 0 ? (memUsedMB / memTotalMB * 100) : 0);
  const cpuPct = stats?.cpu_usage || 0;
  const cpuCores = stats?.cpu_cores || stats?.cpu_threads || 1;
  const memUsedGB = (memUsedMB / 1024).toFixed(1);
  const memTotalGB = (memTotalMB / 1024).toFixed(0);

  const running = containers.filter(c => c.state === 'running').length;
  const stopped = containers.filter(c => c.state !== 'running').length;

  let uptime = stats?.uptime || '';
  if (uptime && uptime.includes('T')) {
    try {
      const boot = new Date(uptime);
      const now = new Date();
      const diffMs = now.getTime() - boot.getTime();
      const days = Math.floor(diffMs / 86400000);
      const hrs = Math.floor((diffMs % 86400000) / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      uptime = days > 0 ? `${days}d ${hrs}h ${mins}m` : `${hrs}h ${mins}m`;
    } catch {}
  }

  const localSys = localData?.system;
  const localThermal = localData?.thermal;
  const localGpu = localData?.gpu;

  // Shared 5-card device grid (CPU / Memory / GPU / System / Temps)
  const localRow = (
    <RowSection title="This System" right={<span className="text-xs text-muted font-mono">This machine</span>}>
      <CardSection title="CPU">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={localSys?.cpu_usage ?? 0} label={localSys?.cpu_cores ? `${localSys.cpu_cores} cores` : ''} color="#2DD4BF" />
        </div>
        {localSys && (
          <div className="mt-2 text-center text-xs text-muted font-mono">
            {localSys.cpu_usage !== undefined ? `${localSys.cpu_usage.toFixed(1)}%` : '—'}
          </div>
        )}
      </CardSection>

      <CardSection title="Memory">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={localSys?.memory_usage_pct ?? 0} label={localSys ? `${(localSys.memory_used_mb / 1024).toFixed(1)} / ${(localSys.memory_total_mb / 1024).toFixed(1)} GB` : ''} color="#8B5CF6" />
        </div>
      </CardSection>

      <CardSection title="GPU">
        {localGpu && localGpu.model ? (
          <div className="space-y-2">
            <div className="text-sm font-medium truncate">{localGpu.model}</div>
            <RowLine label="Temp" value={localGpu.temperature_c != null ? `${localGpu.temperature_c}°C` : '—'} />
            <RowLine label="Util" value={localGpu.utilization_pct != null ? `${Math.round(localGpu.utilization_pct)}%` : '—'} />
            <RowLine label="VRAM" value={localGpu.memory_total_mb ? `${(localGpu.memory_used_mb / 1024).toFixed(1)} / ${(localGpu.memory_total_mb / 1024).toFixed(1)} GB` : 'Shared'} />
          </div>
        ) : (
          <div className="text-sm text-muted">No GPU detected</div>
        )}
      </CardSection>

      <CardSection title="System">
        <div className="space-y-2">
          <RowLine label="Hostname" value={localSys?.hostname || '—'} />
          <RowLine label="Kernel" value={localSys?.kernel || '—'} />
          <RowLine label="Uptime" value={localSys?.uptime || '—'} />
          <RowLine label="OS" value={localSys?.os_release || '—'} />
        </div>
      </CardSection>

      <CardSection title="Temps">
        <div className="space-y-2">
          <RowLine label="CPU" value={localThermal?.cpu_temp_c ? `${localThermal.cpu_temp_c}°C` : '—'} />
          <RowLine label="GPU" value={localThermal?.gpu_temp_c ? `${localThermal.gpu_temp_c}°C` : '—'} />
          <RowLine label="Fan" value={localThermal?.fan_speed_rpm ? `${localThermal.fan_speed_rpm} RPM` : '—'} />
        </div>
      </CardSection>
    </RowSection>
  );

  const unraidRow = unraidServer && (
    <RowSection title="Unraid">
      <CardSection title="CPU">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={cpuPct} label={`${cpuCores} cores`} color="#2DD4BF" />
        </div>
      </CardSection>

      <CardSection title="Memory">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={memPct} label={`${memUsedGB} / ${memTotalGB} GB`} color="#8B5CF6" />
        </div>
      </CardSection>

      <CardSection title="GPU">
        {gpu ? (
          <div className="space-y-2">
            <div className="text-sm font-medium truncate">{gpu.name}</div>
            <RowLine label="Core" value={gpu.temperature || '—'} />
            <RowLine label="Memory" value={`${gpu.memory_used}/${gpu.memory_total}`} />
          </div>
        ) : (
          <div className="text-sm text-muted">No GPU detected</div>
        )}
      </CardSection>

      <CardSection title="System">
        <div className="space-y-2">
          <RowLine label="Hostname" value={stats?.hostname || unraidServer.hostname} />
          <RowLine label="Uptime" value={uptime || '—'} />
          <RowLine label="Array" value={
            <span className={stats?.array_state === 'Started' ? 'text-green' : 'text-yellow'}>
              {stats?.array_state || '—'}
            </span>
          } />
        </div>
      </CardSection>

      <CardSection title="Temps">
        <div className="space-y-2">
          <RowLine label="CPU avg" value={stats?.temp_avg ? `${stats.temp_avg}°C` : '—'} />
          <RowLine label="Hottest" value={stats?.temp_hottest_value ? `${stats.temp_hottest_value}°C` : '—'} />
          <RowLine label="Sensor" value={stats?.temp_hottest || '—'} />
        </div>
      </CardSection>
    </RowSection>
  );

  const steamdeckRow = steamdeckServer && (
    <RowSection title="Steam Deck">
      <CardSection title="CPU">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={steamdeckStats?.cpu_usage ?? 0} label={steamdeckStats?.cpu_cores ? `${steamdeckStats.cpu_cores} cores` : ''} color="#2DD4BF" />
        </div>
        {steamdeckStats && (
          <div className="mt-2 text-center text-xs text-muted font-mono">
            {steamdeckStats.cpu_usage !== undefined ? `${steamdeckStats.cpu_usage.toFixed(1)}%` : '—'}
          </div>
        )}
      </CardSection>

      <CardSection title="Memory">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={steamdeckStats?.memory_usage_pct ?? 0} label={steamdeckStats ? `${(steamdeckStats.memory_used_mb / 1024).toFixed(1)} / ${(steamdeckStats.memory_total_mb / 1024).toFixed(1)} GB` : ''} color="#8B5CF6" />
        </div>
        {steamdeckStats && (
          <div className="mt-2 text-center text-xs text-muted font-mono">
            {steamdeckStats.memory_usage_pct !== undefined
              ? `${steamdeckStats.memory_usage_pct.toFixed(1)}% (${(steamdeckStats.memory_used_mb / 1024).toFixed(1)} GB)`
              : '—'}
          </div>
        )}
      </CardSection>

      <CardSection title="GPU">
        {steamdeckGpu && steamdeckGpu.model ? (
          <div className="space-y-2">
            <div className="text-sm font-medium truncate">{steamdeckGpu.model}</div>
            <RowLine label="Temp" value={steamdeckGpu.temperature_c != null ? `${steamdeckGpu.temperature_c}°C` : '—'} />
            <RowLine label="Util" value={steamdeckGpu.utilization_pct != null ? `${Math.round(steamdeckGpu.utilization_pct)}%` : '—'} />
            <RowLine label="VRAM" value={steamdeckGpu.memory_total_mb ? `${(steamdeckGpu.memory_used_mb / 1024).toFixed(1)} / ${(steamdeckGpu.memory_total_mb / 1024).toFixed(1)} GB` : 'Shared'} />
          </div>
        ) : (
          <div className="text-sm text-muted">No GPU data</div>
        )}
      </CardSection>

      <CardSection title="System">
        <div className="space-y-2">
          <RowLine label="Hostname" value={steamdeckStats?.hostname || steamdeckServer.hostname} />
          <RowLine label="Uptime" value={steamdeckStats?.uptime || '—'} />
          <RowLine label="Kernel" value={steamdeckStats?.kernel || '—'} />
        </div>
      </CardSection>

      <CardSection title="Temps">
        <div className="space-y-2">
          <RowLine label="CPU" value={steamdeckThermal?.cpu_temp_c ? `${steamdeckThermal.cpu_temp_c}°C` : '—'} />
          <RowLine label="GPU" value={steamdeckThermal?.gpu_temp_c ? `${steamdeckThermal.gpu_temp_c}°C` : '—'} />
          <RowLine label="Fan" value={steamdeckThermal?.fan_speed_rpm ? `${steamdeckThermal.fan_speed_rpm} RPM` : '—'} />
        </div>
      </CardSection>
    </RowSection>
  );

  const phoneRow = phoneServer && (
    <RowSection title="Phone">
      <CardSection title="CPU">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={phoneCpu?.usage_pct ?? 0} label={phoneCpu?.cores ? `${phoneCpu.cores} cores` : ''} color="#2DD4BF" />
        </div>
      </CardSection>

      <CardSection title="Memory">
        <div className="flex items-center justify-center">
          <GaugeRing size="sm" value={phoneMemory?.used_pct ?? 0} label={phoneMemory ? `${(phoneMemory.available_mb / 1024).toFixed(1)} GB free` : ''} color="#8B5CF6" />
        </div>
      </CardSection>

      <CardSection title="GPU">
        <div className="flex flex-col items-center justify-center h-full py-2 opacity-50">
          <div className="text-2xl mb-1">📱</div>
          <div className="text-sm text-muted text-center">No GPU telemetry via ADB</div>
        </div>
      </CardSection>

      <CardSection title="System">
        <div className="space-y-2">
          <RowLine label="Model" value={phoneDeviceInfo?.model || '—'} />
          <RowLine label="Android" value={phoneDeviceInfo?.android_version || '—'} />
          <RowLine label="API" value={phoneDeviceInfo?.api_level || '—'} />
        </div>
      </CardSection>

      <CardSection title="Temps">
        <div className="space-y-2">
          <RowLine label="Battery" value={phoneBattery?.temperature ? `${phoneBattery.temperature}°C` : '—'} />
          <RowLine label="Level" value={phoneBattery ? `${phoneBattery.level}%` : '—'} />
        </div>
      </CardSection>
    </RowSection>
  );

  const arrayCap = arrayInfo?.capacity?.disks;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-bold">Dashboard</h1>
        <button onClick={onRefresh} className="btn btn-ghost btn-sm">↻ Refresh</button>
      </div>

      {/* This System */}
      {localRow}

      {/* Unraid */}
      {unraidRow}

      {/* Steam Deck / Handheld */}
      {steamdeckRow}

      {/* Phone */}
      {phoneRow}

      {/* Services */}
      {unraidServer && (
        <section className="space-y-3">
          <h2 className="kicker mb-0">Services</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Docker */}
            <CardSection title="Docker" className={containers.length > 0 ? '' : 'opacity-60'}>
              {containers.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green" />
                      <span className="text-sm font-mono">{running} running</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red" />
                      <span className="text-sm font-mono">{stopped} stopped</span>
                    </div>
                    <div className="text-sm text-muted">{containers.length} total</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">No containers</div>
              )}
            </CardSection>

            {/* AdGuard */}
            <CardSection title="AdGuard Home">
              {adguardStats ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green" />
                    <span className="text-sm">Protection Active</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted">Queries</div>
                      <div className="font-mono font-bold">{(adguardStats.dns_queries?.total || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted">Blocked</div>
                      <div className="font-mono font-bold text-red">{(adguardStats.blocked?.domains || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-muted">Active clients</div>
                      <div className="font-mono">{adguardStats.clients?.active || 0}</div>
                    </div>
                    <div>
                      <div className="text-muted">Filters</div>
                      <div className="font-mono">{adguardStats.filters?.enabled || 0}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">Loading...</div>
              )}
            </CardSection>

            {/* MySpeed */}
            <CardSection title="Internet Speed">
              {myspeedStats?.stats ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted">↓ Download</div>
                      <div className="font-mono font-bold text-green">{myspeedStats.stats.avg_download?.toFixed(0) || '—'} Mbps</div>
                    </div>
                    <div>
                      <div className="text-muted">↑ Upload</div>
                      <div className="font-mono font-bold text-blue">{myspeedStats.stats.avg_upload?.toFixed(0) || '—'} Mbps</div>
                    </div>
                    <div>
                      <div className="text-muted">⏱ Ping</div>
                      <div className="font-mono">{myspeedStats.stats.avg_ping?.toFixed(1) || '—'} ms</div>
                    </div>
                  </div>
                  <div className="text-xs text-muted">
                    Based on {myspeedStats.stats.total_tests || 0} tests
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">Loading...</div>
              )}
            </CardSection>
          </div>
        </section>
      )}

      {/* Device Insights */}
      <section className="space-y-3">
        <h2 className="kicker mb-0">Device Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          {/* Unraid Array */}
          {unraidServer && (
            <CardSection title="Array">
              <div className="space-y-2">
                <RowLine label="State" value={
                  <span className={arrayInfo?.state?.toLowerCase() === 'started' ? 'text-green' : 'text-yellow'}>
                    {arrayInfo?.state || '—'}
                  </span>
                } />
                {arrayCap && arrayCap.total ? (
                  <>
                    <RowLine label="Used" value={`${(arrayCap.used / (1024 ** 3)).toFixed(1)} TB`} />
                    <RowLine label="Free" value={`${(arrayCap.free / (1024 ** 3)).toFixed(1)} TB`} />
                  </>
                ) : (
                  <RowLine label="Capacity" value={arrayInfo?.state === 'Started' ? '0 B' : '—'} />
                )}
              </div>
            </CardSection>
          )}

          {/* Phone Storage */}
          {phoneServer && (
            <CardSection title="Phone Storage">
              {phoneStorage && phoneStorage.total_gb > 0 ? (
                <div className="space-y-2">
                  <RowLine label="Used" value={`${phoneStorage.used_gb.toFixed(1)} GB`} />
                  <RowLine label="Free" value={`${phoneStorage.free_gb.toFixed(1)} GB`} />
                  <RowLine label="Total" value={`${phoneStorage.total_gb.toFixed(1)} GB`} />
                  <div className="w-full h-1.5 rounded bg-bg-2 overflow-hidden">
                    <div
                      className={`h-full rounded ${phoneStorage.used_pct > 85 ? 'bg-red' : phoneStorage.used_pct > 70 ? 'bg-yellow' : 'bg-teal'}`}
                      style={{ width: `${Math.min(100, phoneStorage.used_pct)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted">No storage data</div>
              )}
            </CardSection>
          )}

          {/* Handheld battery + disk */}
          {steamdeckServer && (
            <CardSection title="Battery & Disk">
              <div className="space-y-2">
                {steamdeckBattery ? (
                  <RowLine label="Battery" value={`${steamdeckBattery.percentage}%${steamdeckBattery.charging ? ' ⚡' : ''}`} />
                ) : (
                  <RowLine label="Battery" value="—" />
                )}
                {steamdeckDisk && steamdeckDisk.usage_pct > 0 ? (
                  <>
                    <RowLine label="Disk" value={`${steamdeckDisk.used_gb?.toFixed(1)} / ${steamdeckDisk.total_gb?.toFixed(1)} GB (${steamdeckDisk.usage_pct?.toFixed(0)}%)`} />
                    <div className="w-full h-1.5 rounded bg-bg-2 overflow-hidden">
                      <div
                        className={`h-full rounded ${steamdeckDisk.usage_pct > 85 ? 'bg-red' : steamdeckDisk.usage_pct > 70 ? 'bg-yellow' : 'bg-teal'}`}
                        style={{ width: `${Math.min(100, steamdeckDisk.usage_pct)}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <RowLine label="Disk" value="—" />
                )}
                <RowLine label="Deskflow" value={
                  <span className={steamdeckDeskflow ? 'text-green' : 'text-red'}>
                    {steamdeckDeskflow ? 'Connected' : 'Disconnected'}
                  </span>
                } />
              </div>
            </CardSection>
          )}

          {/* Notifications */}
          {phoneServer && (
            <CardSection title="Notifications">
              <div className="space-y-2">
                {phoneNotifications.length > 0 ? (
                  <>
                    {phoneNotifications.slice(0, 3).map((n: any) => (
                      <div key={n.id} className="text-sm truncate">
                        <span className="text-muted">{n.app_name}:</span> {n.title}
                      </div>
                    ))}
                    {phoneNotifications.length > 3 && (
                      <div className="text-xs text-muted">
                        +{phoneNotifications.length - 3} more
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted">No notifications</div>
                )}
              </div>
            </CardSection>
          )}

          {/* Now Playing */}
          {phoneServer && (
            <CardSection title="Now Playing">
              <div className="space-y-2">
                {phoneMpris && phoneMpris.title ? (
                  <>
                    <div className="font-medium truncate">{phoneMpris.title}</div>
                    {phoneMpris.artist && (
                      <div className="text-sm text-muted truncate">{phoneMpris.artist}</div>
                    )}
                    <div className="text-xs text-muted">
                      {phoneMpris.is_playing ? '▶ Playing' : '⏸ Paused'}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted">Nothing playing</div>
                )}
              </div>
            </CardSection>
          )}
        </div>
      </section>

      {/* Server Actions */}
      {unraidServer && (
        <CardSection title="Server Actions">
          <div className="flex gap-3">
            <button
              onClick={async () => {
                if (confirm('Reboot server?')) {
                  await meshcentralReboot(unraidServer.id);
                  alert('Reboot command sent');
                }
              }}
              className="btn btn-ghost btn-sm border-red/30 text-red"
            >
              🔄 Reboot
            </button>
            <button
              onClick={async () => {
                if (confirm('Shutdown server?')) {
                  await meshcentralShutdown(unraidServer.id);
                  alert('Shutdown command sent');
                }
              }}
              className="btn btn-ghost btn-sm border-red/30 text-red"
            >
              ⏻ Shutdown
            </button>
          </div>
        </CardSection>
      )}

      {!unraidServer && !phoneServer && !steamdeckServer && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🖥</div>
          <h2 className="text-lg font-heading font-bold mb-2">No Servers</h2>
          <p className="text-sm text-muted">Add a server to get started.</p>
        </div>
      )}
    </div>
  );
}