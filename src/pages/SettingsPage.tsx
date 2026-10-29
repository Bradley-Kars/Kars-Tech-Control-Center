import { useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { PageHeader } from '../components/layout/PageHeader';
import { RadioGroup } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Checkbox';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardSection } from '../components/ui/Card';
import { useMediaQuery } from '../hooks';
import { meshcentralSyncFleet, meshcentralGetFleetStats } from '../lib/tauri-commands';
import type { SyncResult } from '../lib/types';
import {
  Layout,
  Bell,
  Keyboard,
  Monitor,
  Info,
  ChevronRight,
} from 'lucide-react';

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

type SectionId = 'appearance' | 'notifications' | 'shortcuts' | 'meshcentral' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: React.ElementType }> = [
  { id: 'appearance', label: 'Appearance', icon: Layout },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { id: 'meshcentral', label: 'MeshCentral', icon: Monitor },
  { id: 'about', label: 'About', icon: Info },
];

/** MeshCentral transport status: agent uptime summary + fleet sync. */
function MeshCentralSection() {
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
        <div className="flex items-center gap-4 flex-wrap">
          <Badge variant={connected != null && connected > 0 ? 'success' : 'default'} size="sm" dot={connected != null && connected > 0}>
            {connected != null && total != null ? `${connected}/${total} agents up` : 'Checking…'}
          </Badge>
          <a
            href="/meshcentral"
            className="text-[var(--kts-brand-primary)] hover:underline font-medium"
            style={{ fontSize: 'var(--kts-font-size-sm)' }}
          >
            Open MeshCentral console <ChevronRight width="14" height="14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }} />
          </a>
        </div>
        <Button variant="primary" size="sm" onClick={handleSync} loading={syncing}>Sync Fleet</Button>
      </div>
      {syncResult && (
        <div className="p-3 rounded-[var(--kts-radius-base)]" style={{ background: 'var(--kts-bg-tertiary)', fontSize: 'var(--kts-font-size-xs)' }}>
          {syncResult.errors.length === 0 ? (
            <span className="text-[var(--kts-text-secondary)]">
              Found {syncResult.devices_found} · matched {syncResult.devices_matched} · new {syncResult.devices_new} · updated {syncResult.devices_updated}
            </span>
          ) : (
            <ul className="text-[var(--kts-status-error)] list-disc pl-4 space-y-1">
              {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
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

  const [activeSection, setActiveSection] = useState<SectionId>('appearance');
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const contentPane = (
    <>
      {activeSection === 'appearance' && (
        <Card variant="subtle">
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
                className="mt-6"
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
      )}

      {activeSection === 'notifications' && (
        <Card variant="subtle">
          <CardSection title="Notifications" subtitle="Desktop alerts for fleet events">
            <Switch
              label="Enable notifications"
              description="Warn when a device goes offline or a drive fails"
              checked={notificationsEnabled}
              onChange={(e) => setNotificationsEnabled(e.target.checked)}
            />
          </CardSection>
        </Card>
      )}

      {activeSection === 'shortcuts' && (
        <Card variant="subtle">
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
      )}

      {activeSection === 'meshcentral' && (
        <Card variant="subtle">
          <CardSection title="MeshCentral" subtitle="Primary transport — fleet sync & live agent stats">
            <MeshCentralSection />
          </CardSection>
        </Card>
      )}

      {activeSection === 'about' && (
        <Card variant="subtle">
          <CardSection title="About" subtitle="KTS Master Control">
            <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
              <Badge variant="brand" size="sm">v0.1.1</Badge>
              <span className="text-[var(--kts-text-secondary)]">
                Fleet operations hub for the KTS Master Control fleet — Omarchy, Unraid, Galaxy S24 Ultra, ROG Ally &amp; Senpai Laptop.
              </span>
            </div>
          </CardSection>
        </Card>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full min-w-0">
      <PageHeader
        title="Settings"
        description="Manage app preferences, transport & account"
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        {isDesktop && (
          <div className="grid gap-[24px] items-start min-w-0" style={{ gridTemplateColumns: '200px minmax(0,1fr)' }}>
            <nav
              className="border-r border-[var(--kts-border-default)] sticky top-[48px] h-[calc(100vh-48px)] overflow-y-auto"
              aria-label="Settings sections"
            >
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={[
                      'flex flex-row items-center gap-3 px-3 py-3 text-left transition-colors duration-[var(--kts-motion-fast)]',
                      'rounded-[var(--kts-radius-md)] border border-transparent whitespace-nowrap',
                      active
                        ? 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)] border-[var(--kts-border-focus)]'
                        : 'text-[var(--kts-text-secondary)] hover:bg-[var(--kts-interactive-hover)] hover:text-[var(--kts-text-primary)]',
                    ].join(' ')}
                    style={{ fontSize: 'var(--kts-font-size-sm)' }}
                    aria-pressed={active}
                  >
                    <Icon width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <span className="font-[var(--kts-font-sans)] font-medium leading-none">{section.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="overflow-y-auto min-h-0 pt-0 pr-6 pb-6 pl-6">{contentPane}</div>
          </div>
        )}
        {!isDesktop && (
          <div className="flex flex-col min-h-0">
            <div className="border-b border-[var(--kts-border-default)] bg-[var(--kts-bg-secondary)]">
              <div className="flex overflow-x-auto px-4 py-3 no-scrollbar gap-2">
                {SECTIONS.map((section) => {
                  const Icon = section.icon;
                  const active = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={[
                        'flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap transition-colors border border-transparent',
                        'shrink-0',
                        active
                          ? 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)] border-[var(--kts-border-focus)]'
                          : 'bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)]',
                      ].join(' ')}
                      aria-pressed={active}
                    >
                      <Icon width="14" height="14" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <span className="font-[var(--kts-font-sans)] font-medium text-[12px]">{section.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="overflow-y-auto min-h-0 px-4 pt-0 pb-6">{contentPane}</div>
          </div>
        )}
      </div>
    </div>
  );
}
