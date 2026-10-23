import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Card, CardSection } from '../components/ui/Card';
import { RadioGroup } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Checkbox';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { meshcentralSyncFleet, meshcentralGetFleetStats } from '../lib/tauri-commands';
import type { SyncResult } from '../lib/types';

const SHORTCUTS: Array<{ keys: string; description: string }> = [
  { keys: '⌘K / Ctrl+K', description: 'Open command palette' },
  { keys: '⌘1', description: 'Dashboard' },
  { keys: '⌘2 … ⌘6', description: 'Devices (local → laptop)' },
  { keys: '⌘D', description: 'Docker' },
  { keys: '⌘S', description: 'Storage' },
  { keys: '⌘Y', description: 'System' },
  { keys: '⌘N', description: 'Network' },
  { keys: 'Esc', description: 'Close dialogs & palette' },
];

/** MeshCentral transport status: agent uptime summary + fleet sync. */
function MeshCentralCard() {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [fleet, setFleet] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      meshcentralGetFleetStats()
        .then((f) => { if (alive) setFleet(f); })
        .catch(() => { if (alive) setFleet(null); });
    };
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const entries = fleet ? Object.values(fleet) : [];
  const connected = fleet ? entries.filter((s) => (s as { connected?: boolean })?.connected).length : null;
  const total = fleet ? entries.length : null;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = await meshcentralSyncFleet();
      setSyncResult(result);
      const fresh = await meshcentralGetFleetStats().catch(() => null);
      if (fresh) setFleet(fresh);
    } catch (e) {
      setSyncResult({
        devices_found: 0,
        devices_matched: 0,
        devices_new: 0,
        devices_updated: 0,
        errors: [e instanceof Error ? e.message : 'Sync failed'],
      });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardSection title="MeshCentral" subtitle="Primary transport — fleet sync & live agent stats">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            <Badge variant={connected != null && connected > 0 ? 'success' : 'default'} size="sm" dot={connected != null && connected > 0}>
              {connected != null && total != null ? `${connected}/${total} agents up` : 'Checking…'}
            </Badge>
            <Link to="/meshcentral" className="text-[var(--kts-brand-primary)] hover:underline" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
              Open MeshCentral console →
            </Link>
          </div>
          <Button variant="primary" size="sm" onClick={handleSync} loading={syncing}>Sync Fleet</Button>
        </div>
        {syncResult && (
          <div className="mt-3 p-3 rounded-[var(--kts-radius-base)]" style={{ background: 'var(--kts-bg-tertiary)', fontSize: 'var(--kts-font-size-xs)' }}>
            {syncResult.errors.length === 0 ? (
              <span className="text-[var(--kts-text-secondary)]">
                Found {syncResult.devices_found} · matched {syncResult.devices_matched} · new {syncResult.devices_new} · updated {syncResult.devices_updated}
              </span>
            ) : (
              <ul className="text-[var(--kts-status-error)] list-disc pl-4">
                {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </CardSection>
    </Card>
  );
}

export function SettingsPage() {
  const {
    theme,
    setTheme,
    density,
    setDensity,
    reducedMotion,
    setReducedMotion,
    notificationsEnabled,
    setNotificationsEnabled,
  } = useAppContext();

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="font-[var(--kts-font-heading)] font-bold" style={{ fontSize: 'var(--kts-font-size-4xl)', letterSpacing: '-0.02em' }}>
        Settings
      </h1>

      {/* Appearance */}
      <Card>
        <CardSection title="Appearance" subtitle="Theme, density & motion">
          <div className="space-y-6">
            <RadioGroup
              label="Theme"
              value={theme}
              onChange={(v) => setTheme(v as 'dark' | 'light' | 'system')}
              options={[
                { value: 'dark', label: 'Dark', description: 'Ink & teal — the KTS look' },
                { value: 'light', label: 'Light', description: 'Bright surfaces, same brand' },
                { value: 'system', label: 'System', description: 'Follow OS preference' },
              ]}
            />
            <RadioGroup
              label="Density"
              value={density}
              onChange={(v) => setDensity(v as 'comfortable' | 'compact')}
              inline
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
            <Switch
              label="Reduce motion"
              description="Disable animations and transitions"
              checked={reducedMotion}
              onChange={(e) => setReducedMotion(e.target.checked)}
            />
          </div>
        </CardSection>
      </Card>

      {/* Notifications */}
      <Card>
        <CardSection title="Notifications" subtitle="Desktop alerts for fleet events">
          <Switch
            label="Enable notifications"
            description="Warn when a device goes offline or a drive fails"
            checked={notificationsEnabled}
            onChange={(e) => setNotificationsEnabled(e.target.checked)}
          />
        </CardSection>
      </Card>

      {/* Shortcuts */}
      <Card>
        <CardSection title="Keyboard Shortcuts" subtitle="Power-user navigation">
          <dl className="divide-y divide-[var(--kts-border-default)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="flex items-center justify-between py-2.5 gap-4">
                <dt className="text-[var(--kts-text-secondary)]">{s.description}</dt>
                <dd>
                  <kbd className="px-2 py-1 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[11px] text-[var(--kts-text-secondary)] bg-[var(--kts-bg-tertiary)] border border-[var(--kts-border-default)]">
                    {s.keys}
                  </kbd>
                </dd>
              </div>
            ))}
          </dl>
        </CardSection>
      </Card>

      {/* MeshCentral (primary transport) */}
      <MeshCentralCard />

      {/* About */}
      <Card>
        <CardSection title="About" subtitle="KTS Master Control">
          <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            <Badge variant="brand" size="sm">v0.1.1</Badge>
            <span className="text-[var(--kts-text-secondary)]">
              Fleet operations hub for the KTS Master Control fleet — Omarchy, Unraid, Galaxy S24 Ultra, ROG Ally & Senpai Laptop.
            </span>
          </div>
        </CardSection>
      </Card>
    </div>
  );
}
