import { useState, useEffect } from 'react';
import { getMySpeedSummary } from '../../lib/tauri-commands';
import type { ServerConfig } from '../../lib/types';

interface MySpeedTest {
  id: number;
  timestamp: string;
  download: number;
  upload: number;
  ping: number;
  jitter?: number;
  server_id?: number;
  server_name?: string;
  server_location?: string;
  server_country?: string;
  server_host?: string;
  client_ip?: string;
  client_isp?: string;
  client_country?: string;
  result_id?: string;
  result_url?: string;
}

interface MySpeedStats {
  total_tests: number;
  avg_download: number;
  avg_upload: number;
  avg_ping: number;
  max_download: number;
  max_upload: number;
  min_ping: number;
  latest_test?: MySpeedTest;
}

interface MySpeedSummary {
  stats: MySpeedStats;
  recent_tests: MySpeedTest[];
}

export function MySpeedPage({ server }: { server: ServerConfig }) {
  const [summary, setSummary] = useState<MySpeedSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<Array<{ time: string; download: number; upload: number; ping: number }>>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const summaryRes = await getMySpeedSummary(server.id, 50);
      setSummary(summaryRes);

      const chartPoints = summaryRes.recent_tests
        .slice()
        .reverse()
        .map((t: MySpeedTest) => ({
          time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          download: t.download,
          upload: t.upload,
          ping: t.ping,
        }));
      setChartData(chartPoints);
    } catch (err) {
      console.error('Failed to fetch MySpeed data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [server.id]);

  const formatSpeed = (mbps: number): string => {
    if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)} Gbps`;
    return `${mbps.toFixed(2)} Mbps`;
  };

  const formatPing = (ms: number): string => `${ms.toFixed(1)} ms`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-teal border-t-transparent"></div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="card p-8 text-center text-muted">
        No speed test data found. Make sure MySpeed is running and has performed tests.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-heading font-bold">MySpeed</h1>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted">Total Tests:</span>
          <span className="font-mono">{summary.stats.total_tests}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Avg Download</div>
          <div className="text-2xl font-heading font-bold text-teal">{formatSpeed(summary.stats.avg_download)}</div>
          <div className="text-xs text-muted">Peak: {formatSpeed(summary.stats.max_download)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Avg Upload</div>
          <div className="text-2xl font-heading font-bold text-amber">{formatSpeed(summary.stats.avg_upload)}</div>
          <div className="text-xs text-muted">Peak: {formatSpeed(summary.stats.max_upload)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Avg Ping</div>
          <div className="text-2xl font-heading font-bold">{formatPing(summary.stats.avg_ping)}</div>
          <div className="text-xs text-muted">Best: {formatPing(summary.stats.min_ping)}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-1">Total Tests</div>
          <div className="text-2xl font-heading font-bold">{summary.stats.total_tests}</div>
          <div className="text-xs text-muted">All time</div>
        </div>
      </div>

      {summary.stats.latest_test && (
        <div className="card p-4 border-teal/20">
          <div className="flex items-center justify-between mb-3">
            <div className="font-heading font-semibold">Latest Test</div>
            <div className="text-sm text-muted font-mono">
              {new Date(summary.stats.latest_test.timestamp).toLocaleString()}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-teal-500/10 rounded">
              <div className="text-2xl font-heading font-bold text-teal">{formatSpeed(summary.stats.latest_test.download)}</div>
              <div className="text-xs text-muted">Download</div>
            </div>
            <div className="text-center p-3 bg-amber-500/10 rounded">
              <div className="text-2xl font-heading font-bold text-amber">{formatSpeed(summary.stats.latest_test.upload)}</div>
              <div className="text-xs text-muted">Upload</div>
            </div>
            <div className="text-center p-3 rounded">
              <div className="text-2xl font-heading font-bold">{formatPing(summary.stats.latest_test.ping)}</div>
              <div className="text-xs text-muted">Ping</div>
            </div>
          </div>
          {summary.stats.latest_test.server_name && (
            <div className="mt-3 text-sm text-muted">
              Server: {summary.stats.latest_test.server_name} ({summary.stats.latest_test.server_location}, {summary.stats.latest_test.server_country})
            </div>
          )}
        </div>
      )}

      <div className="card p-4">
        <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-3">Speed History (Last 50 Tests)</div>
        <div className="h-64 relative">
          <svg viewBox="0 0 800 200" className="w-full h-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id="downloadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="uploadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F5A623" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
              </linearGradient>
            </defs>
            {chartData.length > 1 && (
              <>
                <path
                  d={chartData.map((point, i) => {
                    const x = (i / (chartData.length - 1)) * 800;
                    const maxSpeed = Math.max(...chartData.map(p => Math.max(p.download, p.upload)), 1);
                    const y = 180 - (point.download / maxSpeed) * 160;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  stroke="#2DD4BF"
                  strokeWidth="2"
                  fill="url(#downloadGradient)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={chartData.map((point, i) => {
                    const x = (i / (chartData.length - 1)) * 800;
                    const maxSpeed = Math.max(...chartData.map(p => Math.max(p.download, p.upload)), 1);
                    const y = 180 - (point.upload / maxSpeed) * 160;
                    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                  }).join(' ')}
                  stroke="#F5A623"
                  strokeWidth="2"
                  fill="url(#uploadGradient)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </>
            )}
          </svg>
          <div className="absolute bottom-2 left-2 right-2 flex justify-between text-[10px] text-muted font-mono">
            <span>Download</span>
            <span>Upload</span>
          </div>
        </div>
      </div>
    </div>
  );
}