import { useState, useMemo } from 'react';
import { useServers } from '../hooks';
import { meshcentralShellFleet } from '../lib/tauri-commands';
import type { ShellResult } from '../lib/types';
import { Card, CardSection } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

/**
 * Fleet Command — corporate-style batch command runner.
 * One command, N devices, parallel execution over MeshCentral (HARD RULE),
 * per-device stdout/stderr/exit-code results with copy + re-run.
 */

const PRESETS: { label: string; cmd: string }[] = [
  { label: 'Heartbeat', cmd: 'uptime' },
  { label: 'Distro', cmd: 'cat /etc/os-release 2>/dev/null | head -2 || uname -a' },
  {
    label: 'Pending updates',
    cmd:
      'if command -v pacman >/dev/null 2>&1; then pacman -Qu 2>/dev/null | wc -l; ' +
      'elif command -v dnf >/dev/null 2>&1; then dnf check-update -q 2>/dev/null | grep -cv "^$" ; ' +
      'elif command -v apt >/dev/null 2>&1; then apt list --upgradable 2>/dev/null | grep -c upgradable; ' +
      'elif command -v rpm-ostree >/dev/null 2>&1; then rpm-ostree upgrade --check 2>&1 | head -3; ' +
      'else echo "no-pkg-mgr"; fi',
  },
  { label: 'Disk usage', cmd: 'df -h | head -12' },
  { label: 'Memory', cmd: 'free -h 2>/dev/null || head -3 /proc/meminfo' },
  { label: 'Top CPU', cmd: "ps aux --sort=-%cpu 2>/dev/null | head -6 || top -bn1 | head -12" },
  {
    label: 'Docker',
    cmd: "docker ps --format 'table {{.Names}}\\t{{.Status}}' 2>/dev/null || echo docker-not-available",
  },
  {
    label: 'Listeners',
    cmd: 'ss -tlnp 2>/dev/null | head -15 || netstat -tlnp 2>/dev/null | head -15 || echo no-ss',
  },
];

interface RunRecord {
  id: number;
  command: string;
  startedAt: string;
  results: ShellResult[];
}

const DEVICE_ICON: Record<string, string> = {
  unraid: '🗄',
  phone: '📱',
  desktop: '💻',
  laptop: '💻',
  handheld: '🎮',
  server: '🖥',
};

export function FleetCommandPage() {
  const { servers } = useServers();
  const [targets, setTargets] = useState<string[]>([]);
  const [command, setCommand] = useState('uptime');
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [runSeq, setRunSeq] = useState(1);

  // Phone has no shell transport (ADB-only) — excluded from batch shell.
  const shellServers = useMemo(
    () => servers.filter((s) => s.device_type !== 'phone'),
    [servers],
  );

  const toggleTarget = (id: string) =>
    setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const allSelected = shellServers.length > 0 && targets.length === shellServers.length;

  const run = async () => {
    if (!command.trim() || targets.length === 0 || running) return;
    setRunning(true);
    try {
      const results = await meshcentralShellFleet(targets, command.trim(), 60);
      const record: RunRecord = {
        id: runSeq,
        command: command.trim(),
        startedAt: new Date().toLocaleTimeString(),
        results,
      };
      setRuns((r) => [record, ...r].slice(0, 20));
      setRunSeq((n) => n + 1);
      const ok = results.filter((r) => r.success).length;
      window.dispatchEvent(
        new CustomEvent('kts:toast', {
          detail: {
            type: ok === results.length ? 'success' : ok > 0 ? 'warning' : 'error',
            title: `Ran on ${results.length} device(s)`,
            message: `${ok} succeeded, ${results.length - ok} failed — via MeshCentral.`,
          },
        }),
      );
    } catch (e) {
      window.dispatchEvent(
        new CustomEvent('kts:toast', {
          detail: { type: 'error', title: 'Fleet command failed', message: String(e) },
        }),
      );
    } finally {
      setRunning(false);
    }
  };

  const nameOf = (serverId: string) =>
    shellServers.find((s) => s.id === serverId)?.name ?? serverId;

  const copyText = (text: string) => void navigator.clipboard.writeText(text);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-text-primary)]"
            style={{ fontSize: 'var(--kts-font-size-3xl)', letterSpacing: '-0.02em' }}
          >
            Fleet Command
          </h1>
          <p className="text-[var(--kts-text-secondary)] text-[var(--kts-font-size-sm)] mt-1">
            Run one command across every device in parallel — MeshCentral transport, per-device results.
          </p>
        </div>
        <Badge variant="brand" size="sm">
          MC-first transport
        </Badge>
      </div>

      {/* Targets + command */}
      <Card>
        <CardSection
          title="Targets"
          subtitle={
            allSelected
              ? `All ${shellServers.length} shell-capable devices selected`
              : `${targets.length} of ${shellServers.length} selected`
          }
          action={
            <Button size="xs" variant="ghost" onClick={() => setTargets(allSelected ? [] : shellServers.map((s) => s.id))}>
              {allSelected ? 'Clear all' : 'Select all'}
            </Button>
          }
        >
          <div className="flex flex-wrap gap-2">
            {shellServers.map((s) => {
              const selected = targets.includes(s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => toggleTarget(s.id)}
                  className="flex items-center gap-2 px-3 py-2 text-[var(--kts-font-size-sm)] transition-colors"
                  style={{
                    borderRadius: 'var(--kts-radius-md)',
                    border: `1px solid ${selected ? 'var(--kts-brand-primary)' : 'var(--kts-border-default)'}`,
                    background: selected ? 'var(--kts-brand-primary-alpha, rgba(45,190,213,0.12))' : 'var(--kts-bg-tertiary)',
                    color: 'var(--kts-text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <span>{DEVICE_ICON[s.device_type] ?? '🖥'}</span>
                  <span>{s.name}</span>
                  {s.meshcentral_status === 'enrolled' && <span title="MeshCentral enrolled">🟢</span>}
                </button>
              );
            })}
            {servers
              .filter((s) => s.device_type === 'phone')
              .map((s) => (
                <span
                  key={s.id}
                  className="flex items-center gap-2 px-3 py-2 text-[var(--kts-font-size-sm)] opacity-50"
                  style={{
                    borderRadius: 'var(--kts-radius-md)',
                    border: '1px dashed var(--kts-border-default)',
                    background: 'var(--kts-bg-tertiary)',
                    color: 'var(--kts-text-tertiary)',
                  }}
                  title="ADB-only device — no shell transport"
                >
                  <span>📱</span>
                  <span>{s.name}</span>
                  <Badge variant="subtle" size="xs">ADB-only</Badge>
                </span>
              ))}
          </div>
        </CardSection>

        <CardSection title="Command" subtitle="Shell command — runs in parallel on every selected target">
          <div className="flex flex-wrap gap-2 mb-3">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                size="xs"
                variant={command === p.cmd ? 'primary' : 'ghost'}
                onClick={() => setCommand(p.cmd)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void run();
            }}
            spellCheck={false}
            rows={3}
            className="w-full font-[var(--kts-font-mono)] text-[var(--kts-font-size-sm)] px-3 py-2 resize-y focus:outline-none"
            style={{
              background: 'var(--kts-bg-tertiary)',
              border: '1px solid var(--kts-border-default)',
              borderRadius: 'var(--kts-radius-md)',
              color: 'var(--kts-text-primary)',
            }}
            placeholder="e.g. systemctl restart docker"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
              ⌘/Ctrl + Enter to run
            </span>
            <Button
              variant="primary"
              size="sm"
              onClick={() => void run()}
              loading={running}
              disabled={running || targets.length === 0 || !command.trim()}
            >
              {running ? `Running on ${targets.length}…` : `Run on ${targets.length} device(s)`}
            </Button>
          </div>
        </CardSection>
      </Card>

      {/* Results */}
      {runs.length > 0 && (
        <div className="space-y-4">
          <h2
            className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]"
            style={{ fontSize: 'var(--kts-font-size-xl)' }}
          >
            Results
          </h2>
          {runs.map((record) => (
            <Card key={record.id}>
              <div className="px-4 py-3 border-b border-[var(--kts-border-default)] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="info" size="sm">#{record.id}</Badge>
                  <code className="font-[var(--kts-font-mono)] text-[var(--kts-font-size-sm)] text-[var(--kts-text-secondary)] truncate">
                    {record.command}
                  </code>
                </div>
                <div className="flex items-center gap-2 text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
                  <span>{record.startedAt}</span>
                  <Badge variant="success" size="xs">
                    {record.results.filter((r) => r.success).length}/{record.results.length} ok
                  </Badge>
                  <Button size="xs" variant="ghost" onClick={() => copyText(record.results.map((r) => `## ${nameOf(r.device_id)}\n${r.stdout}${r.stderr}`).join('\n'))}>
                    Copy all
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-[var(--kts-border-default)]">
                {record.results.map((r) => {
                  const key = `${record.id}:${r.device_id}`;
                  const isOpen = expanded[key] ?? r.success === false;
                  const hasOutput = r.stdout.trim().length > 0 || r.stderr.trim().length > 0;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [key]: !isOpen }))}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--kts-interactive-hover)]"
                        style={{ cursor: 'pointer', background: 'transparent', border: 'none' }}
                      >
                        <Badge variant={r.success ? 'success' : 'danger'} size="xs">
                          {r.success ? 'exit 0' : `exit ${r.exit_code}`}
                        </Badge>
                        <span className="text-[var(--kts-font-size-sm)] text-[var(--kts-text-primary)]">
                          {nameOf(r.device_id)}
                        </span>
                        {!hasOutput && (
                          <span className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">no output</span>
                        )}
                        <span className="flex-1" />
                        <span className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
                          {hasOutput ? (isOpen ? '▾' : '▸') : ''}
                        </span>
                      </button>
                      {isOpen && hasOutput && (
                        <div
                          className="px-4 pb-3"
                          style={{ background: 'var(--kts-bg-primary)' }}
                        >
                          <pre
                            className="font-[var(--kts-font-mono)] text-[var(--kts-font-size-xs)] p-3 overflow-x-auto whitespace-pre-wrap"
                            style={{
                              background: 'var(--kts-bg-tertiary)',
                              border: '1px solid var(--kts-border-default)',
                              borderRadius: 'var(--kts-radius-sm)',
                              color: 'var(--kts-text-primary)',
                              maxHeight: '240px',
                            }}
                          >
                            {r.stdout}
                            {r.stderr && (
                              <span style={{ color: 'var(--kts-status-error)' }}>{r.stderr}</span>
                            )}
                          </pre>
                          <div className="mt-1 text-right">
                            <Button size="xs" variant="ghost" onClick={() => copyText(r.stdout + r.stderr)}>
                              Copy output
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
