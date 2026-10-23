import { useState, useMemo, useRef, useEffect } from 'react';
import { useServers } from '../hooks';
import { meshcentralShellFleet } from '../lib/tauri-commands';
import type { ShellResult, ServerConfig } from '../lib/types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

/**
 * Patch Compliance — fleet update status at a glance.
 * One adaptive check command (pacman/dnf/apt/rpm-ostree) fans out over
 * MeshCentral; per-device pending counts + one-click update with confirm.
 */

const CHECK_CMD =
  'if command -v pacman >/dev/null 2>&1; then pacman -Qu 2>/dev/null | wc -l; ' +
  'elif command -v dnf >/dev/null 2>&1; then dnf check-update -q 2>/dev/null | grep -cv "^$"; ' +
  'elif command -v apt-get >/dev/null 2>&1; then apt list --upgradable 2>/dev/null | grep -c upgradable; ' +
  'elif command -v rpm-ostree >/dev/null 2>&1; then rpm-ostree upgrade --check 2>&1 | grep -q "No updates available" && echo 0 || echo 1; ' +
  'else echo 0; fi';

const UPDATE_CMD =
  'if command -v pacman >/dev/null 2>&1; then pacman -Syu --noconfirm; ' +
  'elif command -v dnf >/dev/null 2>&1; then dnf upgrade -y; ' +
  'elif command -v apt-get >/dev/null 2>&1; then DEBIAN_FRONTEND=noninteractive apt-get upgrade -y; ' +
  'elif command -v rpm-ostree >/dev/null 2>&1; then rpm-ostree upgrade; ' +
  'else echo no-pkg-manager; fi';

interface DeviceCompliance {
  pending: number | null; // null = never checked / unknown
  checkedAt: string | null;
  updating: boolean;
  lastUpdateOk: boolean | null;
}

const emptyCompliance = (): DeviceCompliance => ({
  pending: null,
  checkedAt: null,
  updating: false,
  lastUpdateOk: null,
});

export function CompliancePage() {
  const { servers } = useServers();
  const [state, setState] = useState<Record<string, DeviceCompliance>>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState<string | null>(null);
  const confirmTimer = useRef<number | null>(null);

  const shellServers = useMemo(
    () => servers.filter((s) => s.device_type !== 'phone'),
    [servers],
  );

  useEffect(
    () => () => {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    },
    [],
  );

  const toast = (detail: Record<string, unknown>) =>
    window.dispatchEvent(new CustomEvent('kts:toast', { detail }));

  const patch = (id: string, next: Partial<DeviceCompliance>) =>
    setState((s) => ({ ...s, [id]: { ...(s[id] ?? emptyCompliance()), ...next } }));

  const parseCount = (r: ShellResult): number | null => {
    if (!r.success) return null;
    const n = parseInt(r.stdout.trim().split('\n').pop() ?? '', 10);
    return Number.isNaN(n) ? null : Math.max(0, n);
  };

  const runFanout = async (
    ids: string[],
    cmd: string,
    timeoutSecs: number,
  ): Promise<ShellResult[]> => {
    const results = await meshcentralShellFleet(ids, cmd, timeoutSecs);
    return results;
  };

  const checkAll = async () => {
    if (shellServers.length === 0 || checkingAll) return;
    setCheckingAll(true);
    try {
      const ids = shellServers.map((s) => s.id);
      const results = await runFanout(ids, CHECK_CMD, 90);
      const now = new Date().toLocaleTimeString();
      for (const r of results) {
        patch(r.device_id, { pending: parseCount(r), checkedAt: now });
      }
      const total = results.reduce((acc, r) => acc + (parseCount(r) ?? 0), 0);
      const failed = results.filter((r) => !r.success).length;
      toast({
        type: failed > 0 ? 'warning' : 'success',
        title: 'Update check complete',
        message: `${total} pending update(s) across ${results.length - failed} device(s)` +
          (failed > 0 ? `, ${failed} unreachable` : ''),
      });
    } catch (e) {
      toast({ type: 'error', title: 'Update check failed', message: String(e) });
    } finally {
      setCheckingAll(false);
    }
  };

  const updateDevice = async (server: ServerConfig) => {
    patch(server.id, { updating: true, lastUpdateOk: null });
    try {
      const results = await runFanout([server.id], UPDATE_CMD, 600);
      const ok = results[0]?.success ?? false;
      const next: Partial<DeviceCompliance> = { updating: false, lastUpdateOk: ok };
      if (ok) {
        next.pending = 0;
        next.checkedAt = new Date().toLocaleTimeString();
      }
      patch(server.id, next);
      toast({
        type: ok ? 'success' : 'error',
        title: ok ? `${server.name}: updated` : `${server.name}: update failed`,
        message: ok ? 'Packages upgraded via MeshCentral.' : (results[0]?.stderr || 'See device logs.'),
      });
      if (ok) void checkAll(); // refresh this device's count
    } catch (e) {
      patch(server.id, { updating: false, lastUpdateOk: false });
      toast({ type: 'error', title: `${server.name}: update failed`, message: String(e) });
    }
  };

  const onUpdateClick = (server: ServerConfig) => {
    if (confirmUpdate === server.id) {
      if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
      setConfirmUpdate(null);
      void updateDevice(server);
      return;
    }
    setConfirmUpdate(server.id);
    if (confirmTimer.current) window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setConfirmUpdate(null), 4000);
    toast({
      type: 'warning',
      title: `Confirm update: ${server.name}`,
      message: 'Click the Update button again within 4 seconds.',
      duration: 4000,
    });
  };

  const statusBadge = (c: DeviceCompliance | undefined) => {
    if (!c || c.pending === null || c.pending === undefined) return <Badge variant="subtle" size="sm">Not checked</Badge>;
    if (c.pending === 0) return <Badge variant="success" size="sm">Compliant</Badge>;
    if (c.pending > 0 && c.pending < 10) return <Badge variant="warning" size="sm">{c.pending} pending</Badge>;
    return <Badge variant="danger" size="sm">{c.pending} pending</Badge>;
  };

  const totalPending = shellServers.reduce(
    (acc, s) => acc + (state[s.id]?.pending ?? 0),
    0,
  );
  const checkedCount = shellServers.filter((s) => state[s.id]?.pending !== null && state[s.id]?.pending !== undefined).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-text-primary)]"
            style={{ fontSize: 'var(--kts-font-size-3xl)', letterSpacing: '-0.02em' }}
          >
            Patch Compliance
          </h1>
          <p className="text-[var(--kts-text-secondary)] text-[var(--kts-font-size-sm)] mt-1">
            {checkedCount > 0
              ? `${totalPending} pending update(s) fleet-wide · ${checkedCount}/${shellServers.length} devices checked`
              : 'Check every device for pending OS/package updates, then apply them remotely.'}
          </p>
        </div>
        <Button variant="primary" size="sm" loading={checkingAll} disabled={checkingAll} onClick={() => void checkAll()}>
          {checkingAll ? 'Checking fleet…' : 'Check all devices'}
        </Button>
      </div>

      {/* Coverage table */}
      <Card>
        <div
          className="grid items-center px-4 py-2.5 border-b border-[var(--kts-border-default)] text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] uppercase tracking-wider text-[var(--kts-text-tertiary)]"
          style={{ gridTemplateColumns: 'minmax(160px,1.4fr) 1fr 1fr auto auto', gap: '12px' }}
        >
          <span>Device</span>
          <span>Status</span>
          <span>Last checked</span>
          <span>Agent</span>
          <span className="text-right">Action</span>
        </div>
        <div className="divide-y divide-[var(--kts-border-default)]">
          {shellServers.map((s) => {
            const c = state[s.id];
            const enrolled = s.meshcentral_status === 'enrolled';
            return (
              <div
                key={s.id}
                className="grid items-center px-4 py-3"
                style={{ gridTemplateColumns: 'minmax(160px,1.4fr) 1fr 1fr auto auto', gap: '12px' }}
              >
                <div className="min-w-0">
                  <span className="text-[var(--kts-font-size-sm)] font-medium text-[var(--kts-text-primary)]">
                    {s.name}
                  </span>
                  <span className="block text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)] truncate">
                    {s.hostname}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(c)}
                  {c?.lastUpdateOk === true && <Badge variant="info" size="xs">updated</Badge>}
                  {c?.lastUpdateOk === false && <Badge variant="danger" size="xs">update failed</Badge>}
                </div>
                <span className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-secondary)]">
                  {c?.checkedAt ?? '—'}
                </span>
                <span title={enrolled ? 'MeshCentral enrolled' : 'Not enrolled — SSH fallback'}>
                  {enrolled ? '🟢 MC' : '⚪ direct'}
                </span>
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => void checkAll()} disabled={checkingAll}>
                    Check
                  </Button>
                  <Button
                    size="xs"
                    variant={confirmUpdate === s.id ? 'danger' : 'secondary'}
                    loading={c?.updating}
                    disabled={c?.updating || checkingAll}
                    onClick={() => onUpdateClick(s)}
                  >
                    {confirmUpdate === s.id ? 'Confirm?' : 'Update'}
                  </Button>
                </div>
              </div>
            );
          })}
          {servers
            .filter((s) => s.device_type === 'phone')
            .map((s) => (
              <div
                key={s.id}
                className="grid items-center px-4 py-3 opacity-60"
                style={{ gridTemplateColumns: 'minmax(160px,1.4fr) 1fr 1fr auto auto', gap: '12px' }}
              >
                <div className="min-w-0">
                  <span className="text-[var(--kts-font-size-sm)] font-medium text-[var(--kts-text-primary)]">{s.name}</span>
                  <span className="block text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)] truncate">{s.hostname}</span>
                </div>
                <Badge variant="subtle" size="sm">OS-managed (Play Store)</Badge>
                <span className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-secondary)]">—</span>
                <span>📲 ADB</span>
                <span className="text-right" />
              </div>
            ))}
        </div>
      </Card>
    </div>
  );
}
