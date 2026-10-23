import { useState, useEffect, useCallback } from 'react';
import { metricQueryMulti, promQueryRange, prometheusHealth, type MetricPoint } from '../../lib/tauri-commands';
import { useServers } from '../../hooks';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

const TIME_RANGES = [
  { value: '1h', label: '1H', ms: 60 * 60 * 1000 },
  { value: '6h', label: '6H', ms: 6 * 60 * 60 * 1000 },
  { value: '24h', label: '24H', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: '7D', ms: 7 * 24 * 60 * 60 * 1000 },
  { value: '30d', label: '30D', ms: 30 * 24 * 60 * 60 * 1000 },
] as const;

const METRICS = [
  { key: 'cpu_usage', label: 'CPU %', color: '#00d4aa', unit: '%', max: 100 },
  { key: 'memory_usage_pct', label: 'Mem %', color: '#f59e0b', unit: '%', max: 100 },
  { key: 'load_1', label: 'Load 1m', color: '#ef4444', unit: '', max: null },
  { key: 'load_5', label: 'Load 5m', color: '#f97316', unit: '', max: null },
  { key: 'load_15', label: 'Load 15m', color: '#eab308', unit: '', max: null },
  { key: 'cpu_cores', label: 'Cores', color: '#8b5cf6', unit: '', max: null },
] as const;

type TimeRange = typeof TIME_RANGES[number]['value'];
type MetricKey = typeof METRICS[number]['key'];

/* ------------------------------------------------------------------ */
/* Prometheus path (W6c-4): 1y-retention queries on Unraid's           */
/* Prometheus, with automatic fallback to the SQLite MC collector.     */
/* Prometheus regexes are fully anchored, so `ip.*` matches `ip:port`. */
/* ------------------------------------------------------------------ */

const PROMQL: Record<MetricKey, (re: string) => string> = {
  cpu_usage: re =>
    `100 * (1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~"${re}"}[5m])))`,
  memory_usage_pct: re =>
    `100 * (1 - node_memory_MemAvailable_bytes{instance=~"${re}"} / node_memory_MemTotal_bytes{instance=~"${re}"})`,
  load_1: re => `node_load1{instance=~"${re}"}`,
  load_5: re => `node_load5{instance=~"${re}"}`,
  load_15: re => `node_load15{instance=~"${re}"}`,
  cpu_cores: re => `count by (instance) (node_cpu_seconds_total{mode="idle",instance=~"${re}"})`,
};

/** Query step per time range — keeps point counts sane (≈240 pts max). */
const PROM_STEP: Record<TimeRange, string> = {
  '1h': '15s',
  '6h': '1m',
  '24h': '5m',
  '7d': '30m',
  '30d': '6h',
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * PromQL label matchers are Go-quoted string literals, so the regex layer's
 * backslashes must be escaped AGAIN for the query text: a regex `\.` has to
 * appear as `\\.` in the query, which PromQL parses back down to `\.` for
 * RE2 (verified live against Unraid Prometheus 2026-10-09).
 */
function promStr(s: string): string {
  return s.replace(/\\/g, '\\\\');
}

interface DeviceChartData {
  deviceId: string;
  deviceName: string;
  points: Map<MetricKey, MetricPoint[]>;
}

function MiniChart({ data, color, max, height = 120 }: { 
  data: MetricPoint[]; 
  color: string;
  max: number | null;
  height: number;
}) {
  if (!data.length) return <div className="h-full flex items-center justify-center text-[var(--kts-text-tertiary)]">No data</div>;

  const width = 300;
  const padding = { top: 20, right: 30, bottom: 30, left: 40 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const values = data.map(d => d.value);
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const yMax = max ?? Math.ceil(dataMax * 1.1);
  const yMin = Math.min(0, Math.floor(dataMin * 0.9));

  const xScale = (i: number) => padding.left + (i / (data.length - 1 || 1)) * innerWidth;
  const yScale = (val: number) => padding.top + innerHeight - ((val - yMin) / (yMax - yMin)) * innerHeight;

  const pathData = data.map((d, i) => {
    const x = xScale(i);
    const y = yScale(d.value);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} className="w-full h-full">
        <g stroke="var(--kts-border-default)" strokeWidth="0.5" opacity="0.5">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line key={i} x1={padding.left} y1={padding.top + innerHeight * ratio} x2={width - padding.right} y2={padding.top + innerHeight * ratio} />
          ))}
        </g>
        <g fontSize="10" fill="var(--kts-text-tertiary)" fontFamily="var(--kts-font-mono)">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <text key={i} x={padding.left - 8} y={padding.top + innerHeight * ratio + 3} textAnchor="end">
              {Math.round(yMin + (yMax - yMin) * (1 - ratio))}
            </text>
          ))}
        </g>
        <path
          d={data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`).join(' ') + ` L${xScale(data.length - 1)} ${height - padding.bottom} L${padding.left} ${height - padding.bottom} Z`}
          fill={`${color}33`}
        />
        <path
          d={pathData}
          stroke={color}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.length > 0 && (
          <g>
            <circle cx={xScale(data.length - 1)} cy={yScale(data[data.length - 1].value)} r={4} fill={color} stroke="var(--kts-bg-primary)" strokeWidth={2} />
            <text x={width - padding.right + 5} y={padding.top + 15} fill={color} fontSize="11" fontFamily="var(--kts-font-mono)" fontWeight="600" textAnchor="end">
              {data[data.length - 1].value.toFixed(1)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}

interface DeviceChartData {
  deviceId: string;
  deviceName: string;
  points: Map<MetricKey, MetricPoint[]>;
}

export function HistoricalCharts() {
  const { servers } = useServers();
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [selectedMetrics] = useState<MetricKey[]>(['cpu_usage', 'memory_usage_pct']);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [data, setData] = useState<DeviceChartData[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  // Which path actually produced the data on screen:
  // 'prometheus' = Unraid Prometheus (1y), 'collector' = SQLite MC collector (30d)
  const [source, setSource] = useState<'prometheus' | 'collector' | null>(null);

  useEffect(() => {
    const enrolled = servers.filter(s => s.meshcentral_device_id).map(s => s.id);
    if (enrolled.length > 0 && selectedDevices.length === 0) {
      setSelectedDevices(enrolled.slice(0, 3));
    }
  }, [servers]);

  /** Unraid's tailnet IP → Prometheus base URL (from servers.json). */
  const promBase = (() => {
    const unraid = servers.find(s => s.device_type === 'unraid');
    const ip = unraid?.service_keys?.tailscale_ip;
    return ip ? `http://${ip}:9090` : null;
  })();

  /** SQLite metric history (30d) via the MC transport collector. */
  const fetchCollector = useCallback(async () => {
    const from = new Date(Date.now() - TIME_RANGES.find(r => r.value === timeRange)!.ms).toISOString();
    const series = await metricQueryMulti(selectedDevices, selectedMetrics, from);

    const deviceMap = new Map<string, DeviceChartData>();
    for (const s of series) {
      let deviceData = deviceMap.get(s.device_id);
      if (!deviceData) {
        const server = servers.find(srv => srv.id === s.device_id);
        deviceData = {
          deviceId: s.device_id,
          deviceName: server?.name || s.device_id,
          points: new Map(),
        };
        deviceMap.set(s.device_id, deviceData);
      }
      deviceData.points.set(s.metric as MetricKey, s.points);
    }
    setData(Array.from(deviceMap.values()));
  }, [timeRange, selectedMetrics, selectedDevices, servers]);

  /** Range-query Prometheus (1y) for the selected devices & metrics. */
  const fetchPrometheus = useCallback(async (base: string) => {
    // Every selected device must map to a tailnet IP for instance filtering.
    const ips = selectedDevices.map(id => {
      const ip = servers.find(srv => srv.id === id)?.service_keys?.tailscale_ip;
      if (!ip) throw new Error(`device ${id} has no tailscale_ip`);
      return escapeRe(ip);
    });
    // Prometheus regexes anchor to the whole string → `ip.*` covers `ip:9100`.
    const re = promStr(ips.map(ip => `${ip}.*`).join('|'));

    const end = new Date().toISOString();
    const start = new Date(Date.now() - TIME_RANGES.find(r => r.value === timeRange)!.ms).toISOString();

    const deviceMap = new Map<string, DeviceChartData>();
    const ensureDevice = (server: { id: string; name: string }) => {
      let d = deviceMap.get(server.id);
      if (!d) {
        d = { deviceId: server.id, deviceName: server.name, points: new Map() };
        deviceMap.set(server.id, d);
      }
      return d;
    };

    for (const key of selectedMetrics) {
      const series = await promQueryRange(base, PROMQL[key](re), start, end, PROM_STEP[timeRange]);
      for (const s of series) {
        // instance = "ip:port" — match exactly or as "ip:" prefix (never a
        // bare startsWith, which would map 100.1.2.3 → 100.1.2.30).
        const server = servers.find(srv => {
          const ip = srv.service_keys?.tailscale_ip;
          return !!ip && (s.instance === ip || s.instance.startsWith(`${ip}:`));
        });
        if (!server) continue;
        ensureDevice(server).points.set(key, s.points);
      }
    }
    // Emit cards for selected devices that answered with no series (asleep
    // Windows boxes) so the grid doesn't shrink when they drop out.
    for (const id of selectedDevices) {
      const server = servers.find(srv => srv.id === id);
      if (server) ensureDevice(server);
    }
    if (deviceMap.size === 0) throw new Error('prometheus returned no series');
    setData(Array.from(deviceMap.values()));
  }, [timeRange, selectedMetrics, selectedDevices, servers]);

  /** Prometheus first; on any failure fall back to the SQLite collector. */
  const fetchData = useCallback(async () => {
    if (selectedDevices.length === 0 || selectedMetrics.length === 0) return;
    setLoading(true);
    try {
      if (promBase) {
        try {
          const ready = await prometheusHealth(promBase);
          if (!ready) throw new Error('prometheus not ready');
          await fetchPrometheus(promBase);
          setSource('prometheus');
          return;
        } catch (e) {
          console.warn('Prometheus path failed, falling back to collector:', e);
        }
      }
      await fetchCollector();
      setSource('collector');
    } catch (e) {
      console.error('Failed to fetch metrics:', e);
    } finally {
      setLoading(false);
    }
  }, [fetchCollector, fetchPrometheus, promBase]);

  useEffect(() => {
    fetchData();
    if (autoRefresh) {
      const timer = setInterval(fetchData, 60000);
      return () => clearInterval(timer);
    }
  }, [fetchData, autoRefresh]);

  const availableDevices = servers.filter(s => s.meshcentral_device_id);

  if (availableDevices.length === 0) {
    return (
      <Card padded>
        <div className="text-center py-12">
          <span className="text-4xl">📊</span>
          <p className="text-[var(--kts-text-secondary)] mt-2">No MeshCentral-enrolled devices</p>
          <p className="text-[var(--kts-text-tertiary)] text-sm mt-1">Enroll devices in MeshCentral to see historical charts</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-font-size-2xl)]">Historical Charts</h2>
          <p className="text-[var(--kts-text-secondary)] text-sm">
            Real-time fleet metrics ·{' '}
            <span className="font-mono text-[var(--kts-text-tertiary)]">
              {source === 'prometheus'
                ? 'source: Prometheus (1y)'
                : source === 'collector'
                  ? 'source: MC collector (SQLite 30d)'
                  : 'connecting…'}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-[var(--kts-bg-tertiary)] rounded-lg p-1">
            {TIME_RANGES.map(r => (
              <Tooltip key={r.value} content={r.label} position="top">
                <Button variant={timeRange === r.value ? 'primary' : 'ghost'} size="sm" onClick={() => setTimeRange(r.value)}>
                  {r.label}
                </Button>
              </Tooltip>
            ))}
          </div>

          <Tooltip content="Select metrics to display" position="top">
            <Button variant="outline" size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>}>
              {selectedMetrics.length} Metrics
            </Button>
          </Tooltip>

          <Tooltip content="Select devices" position="top">
            <Button variant="outline" size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>}>
              {selectedDevices.length} Devices
            </Button>
          </Tooltip>

          <Tooltip content="Toggle auto-refresh (60s)" position="top">
            <Button variant={autoRefresh ? 'primary' : 'outline'} size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>} onClick={() => setAutoRefresh(!autoRefresh)}>
              {autoRefresh ? '🔄 Live' : '⏸ Paused'}
            </Button>
          </Tooltip>

          <Tooltip content="Refresh now" position="top">
            <Button variant="outline" size="sm" leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>} onClick={fetchData} loading={loading}>
              Refresh
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.map(d => (
          <Card key={d.deviceId} className="min-h-[380px]">
            <div className="p-3 pb-0 border-b border-[var(--kts-border-default)]">
              <h3 className="font-semibold text-[var(--kts-text-primary)]">{d.deviceName}</h3>
            </div>
            <div className="p-3 space-y-3">
              {selectedMetrics.map(m => {
                const metricDef = METRICS.find(md => md.key === m)!;
                const points = d.points.get(m) || [];
                return (
                  <div key={m} className="h-32">
                    <MiniChart
                      data={points}
                      color={metricDef.color}
                      max={metricDef.max}
                      height={100}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        {data.length === 0 && !loading && (
          <Card padded className="col-span-full text-center py-12">
            <span className="text-4xl">📈</span>
            <p className="text-[var(--kts-text-secondary)] mt-2">No data available</p>
            <p className="text-[var(--kts-text-tertiary)] text-sm mt-1">Select devices and metrics, then wait for data collection</p>
          </Card>
        )}

        {loading && data.length === 0 && (
          <div className="col-span-full">
            <Card padded><div className="h-48 bg-[var(--kts-bg-tertiary)] rounded animate-pulse" /></Card>
            <Card padded><div className="h-48 bg-[var(--kts-bg-tertiary)] rounded animate-pulse" /></Card>
            <Card padded><div className="h-48 bg-[var(--kts-bg-tertiary)] rounded animate-pulse" /></Card>
          </div>
        )}
      </div>
    </div>
  );
}