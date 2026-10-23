import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Input } from '../ui/Input';
import { useAppContext } from '../../context/AppContext';
import {
  meshcentralReboot,
  meshcentralShutdown,
  phoneScreenshot,
  launchRustdesk,
  kdeConnectRingDevice,
} from '../../lib/tauri-commands';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  servers: Array<{ id: string; name: string; device_type: string; hostname: string }>;
  location: { pathname: string };
  navigate: (path: string) => void;
}

type Notify = (type: 'success' | 'error' | 'warning' | 'info', title: string, message?: string) => void;

/** What every command action receives at execution time. */
interface CmdCtx {
  servers: CommandPaletteProps['servers'];
  navigate: (path: string) => void;
  notify: Notify;
  resolvedTheme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light' | 'system') => void;
  density: 'comfortable' | 'compact';
  setDensity: (d: 'comfortable' | 'compact') => void;
}

interface Cmd {
  id: string;
  label: string;
  description: string;
  category: string;
  icon: string;
  shortcut: string;
  /** Requires an explicit second Enter/click before running. */
  danger?: boolean;
  /** Only listed while the user is typing a query (keeps the default list tight). */
  dynamic?: boolean;
  action: (ctx: CmdCtx) => string | void | Promise<string | void>;
}

function findServer(servers: CmdCtx['servers'], deviceType: string, what: string) {
  const s = servers.find((x) => x.device_type === deviceType);
  if (!s) throw new Error(`No ${what} server configured`);
  return s;
}

const STATIC_COMMANDS: Cmd[] = [
  // Navigation
  { id: 'nav-dashboard', label: 'Go to Dashboard', description: 'Fleet overview', category: 'Navigation', icon: '◈', shortcut: '⌘1', action: () => '/dashboard' },
  { id: 'nav-local', label: 'This Machine', description: 'Local Omarchy host', category: 'Navigation', icon: '💻', shortcut: '⌘2', action: () => '/device/local' },
  { id: 'nav-unraid', label: 'Unraid Server', description: 'home-server.tailf6d3b4.ts.net', category: 'Navigation', icon: '🗄', shortcut: '⌘3', action: () => '/device/unraid' },
  { id: 'nav-phone', label: 'Galaxy S24 Ultra', description: 'bradleys-s24-ultra.tailf6d3b4.ts.net', category: 'Navigation', icon: '📱', shortcut: '⌘4', action: () => '/device/phone' },
  { id: 'nav-ally', label: 'ROG Ally', description: 'lgbtally.tailf6d3b4.ts.net', category: 'Navigation', icon: '🎮', shortcut: '⌘5', action: () => '/device/ally' },
  { id: 'nav-laptop', label: 'Senpai Laptop', description: 'senpais-laptop.tailf6d3b4.ts.net', category: 'Navigation', icon: '💻', shortcut: '⌘6', action: () => '/device/laptop' },

  // Services
  { id: 'svc-docker', label: 'Docker', description: 'Container management', category: 'Services', icon: '🐳', shortcut: '⌘D', action: () => '/service/docker' },
  { id: 'svc-storage', label: 'Storage', description: 'Array, disks, shares', category: 'Services', icon: '💾', shortcut: '⌘S', action: () => '/service/storage' },
  { id: 'svc-system', label: 'System', description: 'CPU, memory, processes', category: 'Services', icon: '⚙', shortcut: '⌘Y', action: () => '/service/system' },
  { id: 'svc-network', label: 'Network', description: 'Interfaces, Tailscale', category: 'Services', icon: '🌐', shortcut: '⌘N', action: () => '/service/network' },
  { id: 'svc-lidarr', label: 'Lidarr', description: 'Music', category: 'Services', icon: '🎵', shortcut: '', action: () => '/service/lidarr' },
  { id: 'svc-ha', label: 'Home Assistant', description: 'Home automation', category: 'Services', icon: '🏠', shortcut: '', action: () => '/service/homeassistant' },
  { id: 'svc-nextcloud', label: 'Nextcloud', description: 'File sync & share', category: 'Services', icon: '☁', shortcut: '', action: () => '/service/nextcloud' },
  { id: 'svc-adguard', label: 'AdGuard', description: 'DNS filtering', category: 'Services', icon: '🛡', shortcut: '', action: () => '/service/adguard' },
  { id: 'svc-myspeed', label: 'MySpeed', description: 'Speed tests', category: 'Services', icon: '📊', shortcut: '', action: () => '/service/myspeed' },

  // Actions
  {
    id: 'act-refresh',
    label: 'Refresh All Data',
    description: 'Force refresh all device data',
    category: 'Actions',
    icon: '↻',
    shortcut: '⌘R',
    action: (ctx) => {
      window.dispatchEvent(new CustomEvent('kts:refresh'));
      ctx.notify('info', 'Refreshing…', 'Fleet + local stats reloading');
    },
  },
  {
    id: 'act-reboot-unraid',
    label: 'Reboot Unraid',
    description: 'Reboot the Unraid server',
    category: 'Actions',
    icon: '🔄',
    shortcut: '',
    danger: true,
    action: async (ctx) => {
      const s = findServer(ctx.servers, 'unraid', 'Unraid');
      await meshcentralReboot(s.id);
      ctx.notify('info', 'Rebooting Unraid', s.hostname);
    },
  },
  {
    id: 'act-shutdown-unraid',
    label: 'Shutdown Unraid',
    description: 'Shutdown the Unraid server',
    category: 'Actions',
    icon: '⏻',
    shortcut: '',
    danger: true,
    action: async (ctx) => {
      const s = findServer(ctx.servers, 'unraid', 'Unraid');
      await meshcentralShutdown(s.id);
      ctx.notify('warning', 'Shutting down Unraid', s.hostname);
    },
  },
  {
    id: 'act-ring-phone',
    label: 'Ring Phone',
    description: 'Find phone via KDE Connect',
    category: 'Actions',
    icon: '🔔',
    shortcut: '',
    action: async (ctx) => {
      const s = findServer(ctx.servers, 'phone', 'phone');
      await kdeConnectRingDevice(s.id);
      ctx.notify('success', 'Ringing phone 🔔', 'KDE Connect find-my-phone sent');
    },
  },
  {
    id: 'act-screenshot-phone',
    label: 'Screenshot Phone',
    description: 'Capture phone screen',
    category: 'Actions',
    icon: '📱',
    shortcut: '',
    action: async (ctx) => {
      const s = findServer(ctx.servers, 'phone', 'phone');
      await phoneScreenshot(s.id);
      ctx.notify('success', 'Screenshot saved', 'Phone screen captured');
    },
  },
  {
    id: 'act-rustdesk',
    label: 'Launch RustDesk',
    description: 'Remote desktop to phone',
    category: 'Actions',
    icon: '🖥',
    shortcut: '',
    action: async (ctx) => {
      const s = findServer(ctx.servers, 'phone', 'phone');
      await launchRustdesk(s.id);
      ctx.notify('success', 'RustDesk', 'Connecting to phone…');
    },
  },
  { id: 'act-meshcentral', label: 'MeshCentral Console', description: 'Fleet devices & agents', category: 'Actions', icon: '🛰', shortcut: '', action: () => '/meshcentral' },
  { id: 'act-settings', label: 'Open Settings', description: 'App settings', category: 'Actions', icon: '⚙', shortcut: '', action: () => '/settings' },

  // System
  {
    id: 'sys-theme',
    label: 'Toggle Theme',
    description: 'Switch between dark/light',
    category: 'System',
    icon: '🌓',
    shortcut: '',
    action: (ctx) => {
      ctx.setTheme(ctx.resolvedTheme === 'dark' ? 'light' : 'dark');
    },
  },
  {
    id: 'sys-density',
    label: 'Toggle Density',
    description: 'Compact/comfortable spacing',
    category: 'System',
    icon: '◧',
    shortcut: '',
    action: (ctx) => {
      ctx.setDensity(ctx.density === 'comfortable' ? 'compact' : 'comfortable');
    },
  },
  { id: 'sys-shortcuts', label: 'Show Shortcuts', description: 'Display keyboard shortcuts', category: 'System', icon: '⌨', shortcut: '?', action: () => '/settings' },
];

/** Per-server power commands — built from the live server list, shown while searching. */
function buildPowerCommands(servers: CommandPaletteProps['servers']): Cmd[] {
  return servers.flatMap((s) => [
    {
      id: `power-reboot-${s.id}`,
      label: `Reboot ${s.name}`,
      description: `Send reboot via SSH · ${s.hostname}`,
      category: 'Power',
      icon: '🔄',
      shortcut: '',
      danger: true,
      dynamic: true,
      action: async (ctx: CmdCtx) => {
        const target = ctx.servers.find((x) => x.id === s.id);
        if (!target) throw new Error(`${s.name} is no longer configured`);
        await meshcentralReboot(target.id);
        ctx.notify('info', `Rebooting ${s.name}`, target.hostname);
      },
    },
    {
      id: `power-shutdown-${s.id}`,
      label: `Shutdown ${s.name}`,
      description: `Send poweroff via SSH · ${s.hostname}`,
      category: 'Power',
      icon: '⏻',
      shortcut: '',
      danger: true,
      dynamic: true,
      action: async (ctx: CmdCtx) => {
        const target = ctx.servers.find((x) => x.id === s.id);
        if (!target) throw new Error(`${s.name} is no longer configured`);
        await meshcentralShutdown(target.id);
        ctx.notify('warning', `Shutting down ${s.name}`, target.hostname);
      },
    },
  ]);
}

export function CommandPalette({ isOpen, onClose, navigate, servers }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmArmed, setConfirmArmed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { addToast, resolvedTheme, setTheme, density, setDensity } = useAppContext();

  const notify = useCallback<Notify>(
    (type, title, message) => addToast({ type, title, message }),
    [addToast],
  );

  const powerCommands = useMemo(() => buildPowerCommands(servers), [servers]);

  const ctx = useMemo<CmdCtx>(
    () => ({ servers, navigate, notify, resolvedTheme, setTheme, density, setDensity }),
    [servers, navigate, notify, resolvedTheme, setTheme, density, setDensity],
  );

  // Filter commands. Dynamic (per-server power) commands only appear while searching,
  // so the default list stays a curated set.
  const filteredCommands = useMemo(() => {
    const pool = query.trim()
      ? [...STATIC_COMMANDS, ...powerCommands]
      : STATIC_COMMANDS.filter((c) => !c.dynamic);

    if (!query.trim()) return pool;

    return pool
      .map((cmd) => ({
        ...cmd,
        score: fuzzyScore(query, `${cmd.label} ${cmd.description} ${cmd.category} ${cmd.shortcut}`),
      }))
      .filter((cmd) => cmd.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [query, powerCommands]);

  const selectedCommand = filteredCommands[selectedIndex];

  // Group commands by category (must be declared before any early return)
  const grouped = useMemo(() => {
    const groups: Record<string, Cmd[]> = {};
    for (const cmd of filteredCommands) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filteredCommands]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setConfirmArmed(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const executeCommand = useCallback(
    async (cmd: Cmd) => {
      // Danger commands need an explicit second confirm while the palette stays open.
      if (cmd.danger && confirmArmed !== cmd.id) {
        setConfirmArmed(cmd.id);
        return;
      }
      setConfirmArmed(null);
      try {
        const result = await cmd.action(ctx);
        if (typeof result === 'string' && result.startsWith('/')) {
          navigate(result);
        }
      } catch (e) {
        notify('error', `${cmd.label} failed`, e instanceof Error ? e.message : String(e));
      } finally {
        onClose();
      }
    },
    [confirmArmed, ctx, navigate, notify, onClose],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // First Escape disarms a pending destructive confirm; second closes.
        if (confirmArmed) {
          setConfirmArmed(null);
          return;
        }
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && selectedCommand) {
        e.preventDefault();
        void executeCommand(selectedCommand);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredCommands, selectedCommand, executeCommand, confirmArmed, onClose]);

  // Scroll selected into view
  useEffect(() => {
    if (selectedCommand && listRef.current) {
      const item = listRef.current.querySelector(`[data-id="${selectedCommand.id}"]`);
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedCommand, selectedIndex]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(0);
    setConfirmArmed(null);
  };

  if (!isOpen) return null;

  const armedLabel = confirmArmed
    ? filteredCommands.find((c) => c.id === confirmArmed)?.label
    : undefined;

  const content = (
    <div
      className="command-palette-overlay fixed inset-0 z-[var(--kts-z-command-palette)] flex items-start justify-center pt-16"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="command-palette w-full max-w-2xl"
        style={{
          background: 'var(--kts-bg-secondary)',
          border: '1px solid var(--kts-border-focus)',
          borderRadius: 'var(--kts-radius-xl)',
          boxShadow: 'var(--kts-shadow-xl)',
          overflow: 'hidden',
          animation: 'palette-slide-in 0.2s cubic-bezier(0.25, 1.5, 0.5, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div className="p-4 border-b border-[var(--kts-border-default)]">
          <div className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)]">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[10px] text-[var(--kts-text-tertiary)] bg-[var(--kts-bg-tertiary)] border border-[var(--kts-border-default)]">
              Esc
            </kbd>
            <Input
              ref={inputRef}
              type="search"
              placeholder="Type a command or search..."
              value={query}
              onChange={handleInputChange}
              size="base"
              className="pl-10 pr-16"
              autoFocus
            />
          </div>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-[var(--kts-text-tertiary)]">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3" style={{ opacity: 0.5 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <p>No commands match "{query}"</p>
            </div>
          ) : (
            <>
              {Object.entries(grouped).map(([category, cmds]) => (
                <div key={category}>
                  <div className="px-4 py-2 border-b border-[var(--kts-border-default)] bg-[var(--kts-bg-tertiary)]">
                    <span className="kicker text-[var(--kts-font-size-xs)]">{category}</span>
                  </div>
                  <div className="divide-y divide-[var(--kts-border-default)]">
                    {cmds.map((cmd) => {
                      const isSelected = cmd.id === selectedCommand?.id;
                      const isArmed = cmd.id === confirmArmed;
                      const globalIndex = filteredCommands.indexOf(cmd);
                      return (
                        <button
                          key={cmd.id}
                          data-id={cmd.id}
                          onClick={() => void executeCommand(cmd)}
                          onMouseEnter={() => setSelectedIndex(globalIndex)}
                          className={[
                            'w-full px-4 py-3 flex items-center gap-3 text-left',
                            'transition-colors duration-[var(--kts-motion-fast)]',
                            isArmed
                              ? 'bg-red-500/15'
                              : isSelected
                                ? 'bg-[var(--kts-brand-primary-bg)]'
                                : 'hover:bg-[var(--kts-interactive-hover)]',
                          ].join(' ')}
                          style={{ outline: 'none' }}
                        >
                          <span className="flex-shrink-0" style={{ width: '24px', textAlign: 'center', fontSize: '18px' }}>{cmd.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className={['font-medium truncate', isArmed ? 'text-red-400' : isSelected ? 'text-[var(--kts-brand-primary)]' : 'text-[var(--kts-text-primary)]'].join(' ')} style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                              {cmd.label}
                            </p>
                            <p className="truncate text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>{cmd.description}</p>
                          </div>
                          {isArmed ? (
                            <kbd className="px-2 py-0.5 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[10px] text-red-400 bg-red-500/15 border border-red-500/40 flex-shrink-0 ml-2">
                              Enter ×2
                            </kbd>
                          ) : cmd.shortcut ? (
                            <kbd className="px-2 py-0.5 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[10px] text-[var(--kts-text-tertiary)] bg-[var(--kts-bg-tertiary)] border border-[var(--kts-border-default)] flex-shrink-0 ml-2">
                              {cmd.shortcut}
                            </kbd>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-[var(--kts-border-default)] bg-[var(--kts-bg-tertiary)]">
          {armedLabel ? (
            <p className="text-center text-red-400 font-medium" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
              ⚠ Press Enter again to confirm — {armedLabel} · Esc cancels
            </p>
          ) : (
            <p className="text-center text-[var(--kts-text-tertiary)]" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
              ↑↓ Navigate • Enter Execute • Esc Close
            </p>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 1;

  let score = 0;
  let qi = 0;
  let lastMatch = -2;

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      // Bonus for consecutive matches
      if (i === lastMatch + 1) score += 3;
      else score += 1;
      // Bonus for start of word
      if (i === 0 || t[i - 1] === ' ') score += 5;
      lastMatch = i;
      qi++;
    }
  }

  if (qi === q.length) {
    // Bonus for shorter text (more precise match)
    score += Math.max(0, 20 - t.length);
    return score;
  }
  return 0;
}

// Keyframes
if (typeof document !== 'undefined' && !document.getElementById('kts-palette-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-palette-keyframes';
  style.textContent = `
    @keyframes palette-slide-in {
      from { opacity: 0; transform: scale(0.95) translateY(-20px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
