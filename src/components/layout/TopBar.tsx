import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { DeviceAvatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { useKiosk } from '../../hooks/useKiosk';
import {
  getServers,
  meshcentralReboot,
  meshcentralShutdown,
  kdeConnectRingDevice,
  phoneScreenshotSave,
  launchRustdesk,
  alertList,
  alertAcknowledge,
  alertAcknowledgeAll,
} from '../../lib/tauri-commands';
import type { Alert, ServerConfig } from '../../lib/types';

interface TopBarProps {
  location: { pathname: string };
  onMenuClick: () => void;
  onCommandPalette: () => void;
}

// Fire a toast through App's global kts:toast bridge (App.tsx → ToastManager)
interface ToastDetail {
  type: 'success' | 'error' | 'warning' | 'info' | 'default';
  title: string;
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}
const toast = (detail: ToastDetail) =>
  window.dispatchEvent(new CustomEvent('kts:toast', { detail }));

// Relative timestamp for alert rows
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'var(--kts-status-error)',
  warning: 'var(--kts-status-warning)',
  info: 'var(--kts-status-pending)',
};

const QUICK_ACTIONS = [
  { id: 'refresh', label: 'Refresh All', icon: '↻', shortcut: '⌘R', action: 'refresh' },
  { id: 'reboot-unraid', label: 'Reboot Unraid', icon: '🔄', shortcut: '', action: 'reboot-unraid', variant: 'amber' as const },
  { id: 'shutdown-unraid', label: 'Shutdown Unraid', icon: '⏻', shortcut: '', action: 'shutdown-unraid', variant: 'danger' as const },
  { id: 'ring-phone', label: 'Ring Phone', icon: '🔔', shortcut: '', action: 'ring-phone' },
  { id: 'screenshot-phone', label: 'Screenshot Phone', icon: '📱', shortcut: '', action: 'screenshot-phone' },
  { id: 'rustdesk', label: 'Launch RustDesk', icon: '🖥', shortcut: '', action: 'rustdesk' },
];

export function TopBar({
  location,
  onMenuClick,
  onCommandPalette,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [servers, setServers] = useState<ServerConfig[]>([]);
  const [confirmPending, setConfirmPending] = useState<string | null>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<{ action: string; timer: number } | null>(null);
  const { isKiosk, toggleKiosk } = useKiosk();
  const navigate = useNavigate();

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setShowQuickActions(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onCommandPalette();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setShowQuickActions(false);
        setShowNotifications(false);
        setShowUserMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCommandPalette]);

  // Load servers once (MC-first quick actions resolve targets by device_type)
  useEffect(() => {
    getServers().then(setServers).catch(() => {});
  }, []);

  // Live alerts feed (bell badge + dropdown), refreshed on mount, on every
  // fleet refresh (⌘R / sidebar / dashboard), and when the dropdown opens.
  const refreshAlerts = useCallback(async () => {
    try {
      const data = await alertList({ limit: 20 });
      setAlerts(
        [...data].sort((a, b) => {
          if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
      );
    } catch {
      // transient backend error — keep last known alerts
    }
  }, []);

  useEffect(() => {
    void refreshAlerts();
    const onFleetRefresh = () => void refreshAlerts();
    window.addEventListener('kts:refresh', onFleetRefresh);
    return () => window.removeEventListener('kts:refresh', onFleetRefresh);
  }, [refreshAlerts]);

  // Two-click confirm for destructive actions (reboot/shutdown): first click
  // arms for 4s and warns, second click within the window executes.
  const armConfirm = useCallback((id: string, label: string): boolean => {
    if (confirmRef.current?.action === id) {
      window.clearTimeout(confirmRef.current.timer);
      confirmRef.current = null;
      setConfirmPending(null);
      return true;
    }
    if (confirmRef.current) window.clearTimeout(confirmRef.current.timer);
    const timer = window.setTimeout(() => {
      confirmRef.current = null;
      setConfirmPending(null);
    }, 4000);
    confirmRef.current = { action: id, timer };
    setConfirmPending(id);
    toast({
      type: 'warning',
      title: `Confirm: ${label}`,
      message: 'Click again within 4 seconds to proceed.',
      duration: 4000,
    });
    return false;
  }, []);

  useEffect(
    () => () => {
      if (confirmRef.current) window.clearTimeout(confirmRef.current.timer);
    },
    [],
  );

  const unraidServer = servers.find((s) => s.device_type === 'unraid');
  const phoneServer = servers.find((s) => s.device_type === 'phone');

  const noServer = (label: string) =>
    toast({ type: 'error', title: `${label} not configured`, message: 'No matching server in servers.json.' });

  // Quick-action executor — MeshCentral first (HARD RULE), KDE Connect for the
  // ring (phone isn't MC-enrolled), ADB only inside the screenshot command.
  const runAction = useCallback(
    async (action: string) => {
      switch (action) {
        case 'refresh':
          window.dispatchEvent(new CustomEvent('kts:refresh'));
          toast({ type: 'info', title: 'Refreshing fleet', message: 'Re-querying all devices and services.' });
          return;
        case 'reboot-unraid': {
          if (!unraidServer) return noServer('Unraid');
          if (!armConfirm('reboot-unraid', 'Reboot Unraid')) return;
          try {
            await meshcentralReboot(unraidServer.id);
            toast({ type: 'success', title: 'Unraid rebooting', message: 'Command sent via MeshCentral.' });
          } catch (e) {
            toast({ type: 'error', title: 'Reboot failed', message: String(e) });
          }
          return;
        }
        case 'shutdown-unraid': {
          if (!unraidServer) return noServer('Unraid');
          if (!armConfirm('shutdown-unraid', 'Shutdown Unraid')) return;
          try {
            await meshcentralShutdown(unraidServer.id);
            toast({ type: 'success', title: 'Unraid shutting down', message: 'Command sent via MeshCentral.' });
          } catch (e) {
            toast({ type: 'error', title: 'Shutdown failed', message: String(e) });
          }
          return;
        }
        case 'ring-phone': {
          if (!phoneServer) return noServer('Phone');
          try {
            await kdeConnectRingDevice(phoneServer.id);
            toast({ type: 'success', title: 'Phone ringing', message: 'KDE Connect ring sent to the S24.' });
          } catch (e) {
            toast({
              type: 'error',
              title: 'Ring failed',
              message: `${String(e)} — KDE Connect on the phone may be offline.`,
            });
          }
          return;
        }
        case 'screenshot-phone': {
          if (!phoneServer) return noServer('Phone');
          try {
            const path = await phoneScreenshotSave(phoneServer.id);
            toast({
              type: 'success',
              title: 'Screenshot saved',
              message: path,
              duration: 10000,
              action: {
                label: 'Copy path',
                onClick: () => void navigator.clipboard.writeText(path),
              },
            });
          } catch (e) {
            toast({ type: 'error', title: 'Screenshot failed', message: String(e) });
          }
          return;
        }
        case 'rustdesk': {
          if (!phoneServer) return noServer('Phone');
          try {
            await launchRustdesk(phoneServer.id);
            toast({ type: 'success', title: 'RustDesk launching', message: 'Connecting to the S24 Ultra.' });
          } catch (e) {
            toast({ type: 'error', title: 'RustDesk failed', message: String(e) });
          }
          return;
        }
      }
    },
    [unraidServer, phoneServer, armConfirm],
  );

  // Dashboard dispatches these with no listener — execute them here (TopBar is
  // always mounted inside AppLayout).
  useEffect(() => {
    const ring = () => void runAction('ring-phone');
    const shot = () => void runAction('screenshot-phone');
    window.addEventListener('kts:ring-phone', ring);
    window.addEventListener('kts:screenshot-phone', shot);
    return () => {
      window.removeEventListener('kts:ring-phone', ring);
      window.removeEventListener('kts:screenshot-phone', shot);
    };
  }, [runAction]);

  const unackCount = alerts.filter((a) => !a.acknowledged).length;

  const handleAlertClick = async (a: Alert) => {
    if (a.acknowledged || !a.id) return;
    try {
      await alertAcknowledge(a.id, 'user');
      void refreshAlerts();
    } catch (e) {
      toast({ type: 'error', title: 'Acknowledge failed', message: String(e) });
    }
  };

  const handleMarkAll = async () => {
    try {
      const count = await alertAcknowledgeAll();
      toast({ type: 'success', title: 'Alerts acknowledged', message: `${count} alert(s) marked as acknowledged.` });
      void refreshAlerts();
    } catch (e) {
      toast({ type: 'error', title: 'Acknowledge failed', message: String(e) });
    }
  };

  // Page title from route
  const pageTitle = useMemo(() => {
    const path = location.pathname;
    if (path === '/dashboard') return 'Fleet Overview';
    if (path.startsWith('/device/')) {
      const device = path.split('/device/')[1];
      const labels: Record<string, string> = {
        local: 'This Machine',
        unraid: 'Unraid Server',
        phone: 'Galaxy S24 Ultra',
        ally: 'ROG Ally',
        laptop: 'Senpai Laptop',
      };
      return labels[device] || 'Device';
    }
    if (path.startsWith('/service/')) {
      const service = path.split('/service/')[1];
      const labels: Record<string, string> = {
        docker: 'Docker',
        storage: 'Storage',
        system: 'System',
        network: 'Network',
        lidarr: 'Lidarr',
        homeassistant: 'Home Assistant',
        nextcloud: 'Nextcloud',
        adguard: 'AdGuard',
        myspeed: 'MySpeed',
      };
      return labels[service] || 'Service';
    }
    if (path.startsWith('/settings')) return 'Settings';
    return 'KTS Master Control';
  }, [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      // TODO: Implement global search
      console.log('Search:', searchQuery);
      setSearchQuery('');
    }
  };

  return (
    <header
      className="top-bar flex items-center justify-between gap-4"
      style={{
        height: '56px',
        padding: '0 var(--kts-space-6)',
        background: 'var(--kts-bg-secondary)',
        borderBottom: '1px solid var(--kts-border-default)',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--kts-z-sticky)',
      }}
    >
      {/* Left: Menu + Page Title */}
      <div className="flex items-center gap-4 min-w-0">
        <Tooltip content="Menu" position="bottom">
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
            className="md:hidden"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </IconButton>
        </Tooltip>

        <Tooltip content="Command Palette (⌘K)" position="bottom">
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onCommandPalette}
            aria-label="Open Command Palette"
          >
            <kbd className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[10px] text-[var(--kts-text-tertiary)] bg-[var(--kts-bg-tertiary)] border border-[var(--kts-border-default)]">
              ⌘K
            </kbd>
          </IconButton>
        </Tooltip>

        <h1 className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)] truncate" style={{ fontSize: 'var(--kts-font-size-xl)', letterSpacing: '-0.02em' }}>
          {pageTitle}
        </h1>
      </div>

      {/* Center: Global Search */}
      <div className="flex-1 max-w-xl mx-4 hidden md:block">
        <form onSubmit={handleSearch} className="relative w-full">
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search devices, services, actions... (⌘K)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            leftIcon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            className="w-full"
          />
        </form>
      </div>

      {/* Right: Quick Actions, Notifications, Kiosk Toggle, User */}
      <div className="flex items-center gap-2">
        {/* Quick Actions */}
        <div className="relative" ref={quickActionsRef}>
          <Tooltip content="Quick Actions" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>}
              onClick={() => setShowQuickActions(!showQuickActions)}
              aria-label="Quick Actions"
              aria-expanded={showQuickActions}
            >
              Actions
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showQuickActions ? 'rotate-180' : ''} style={{ transition: 'transform var(--kts-motion-fast)' }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </Button>
          </Tooltip>

          {showQuickActions && (
            <div
              className="absolute right-0 top-full mt-2 z-[var(--kts-z-dropdown)]"
              style={{
                minWidth: '220px',
                background: 'var(--kts-bg-secondary)',
                border: '1px solid var(--kts-border-default)',
                borderRadius: 'var(--kts-radius-md)',
                boxShadow: 'var(--kts-shadow-lg)',
                overflow: 'hidden',
                animation: 'dropdown-slide-in 0.15s ease-out',
              }}
            >
              <div className="px-3 py-2 border-b border-[var(--kts-border-default)]">
                <span className="kicker text-[var(--kts-font-size-xs)]">Quick Actions</span>
              </div>
              <div className="py-1">
                {QUICK_ACTIONS.map((action) => (
                  <Button
                    key={action.id}
                    variant={
                      confirmPending === action.action
                        ? 'danger'
                        : action.variant === 'amber'
                          ? 'amber'
                          : action.variant === 'danger'
                            ? 'danger'
                            : 'ghost'
                    }
                    size="sm"
                    fullWidth
                    leftIcon={<span style={{ fontSize: '14px' }}>{action.icon}</span>}
                    onClick={() => {
                      // Keep the menu open while a destructive confirm is only
                      // armed — the second click executes, then it closes.
                      const willArm =
                        (action.action === 'reboot-unraid' || action.action === 'shutdown-unraid') &&
                        confirmPending !== action.action;
                      if (!willArm) setShowQuickActions(false);
                      void runAction(action.action);
                    }}
                    className="justify-start"
                  >
                    <span className="flex-1">
                      {confirmPending === action.action ? `Confirm: ${action.label}` : action.label}
                    </span>
                    {action.shortcut && (
                      <kbd className="px-1.5 py-0.5 rounded-[var(--kts-radius-sm)] font-[var(--kts-font-mono)] text-[10px] text-[var(--kts-text-tertiary)] bg-[var(--kts-bg-tertiary)] border border-[var(--kts-border-default)]">
                        {action.shortcut}
                      </kbd>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notifications (live alerts from the alert DB) */}
        <div className="relative" ref={notificationsRef}>
          <Tooltip content="Notifications" position="bottom">
            <IconButton
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = !showNotifications;
                setShowNotifications(next);
                if (next) void refreshAlerts();
              }}
              aria-label="Notifications"
              aria-expanded={showNotifications}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unackCount > 0 && (
                <Badge
                  variant={alerts.some((a) => !a.acknowledged && a.severity === 'critical') ? 'danger' : 'info'}
                  size="xs"
                  className="absolute -top-1 -right-1"
                >
                  {unackCount > 99 ? '99+' : unackCount}
                </Badge>
              )}
            </IconButton>
          </Tooltip>

          {showNotifications && (
            <div
              className="absolute right-0 top-full mt-2 z-[var(--kts-z-dropdown)] w-80"
              style={{
                background: 'var(--kts-bg-secondary)',
                border: '1px solid var(--kts-border-default)',
                borderRadius: 'var(--kts-radius-md)',
                boxShadow: 'var(--kts-shadow-lg)',
                overflow: 'hidden',
                animation: 'dropdown-slide-in 0.15s ease-out',
              }}
            >
              <div className="px-4 py-3 border-b border-[var(--kts-border-default)] flex items-center justify-between">
                <span className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
                  Notifications
                </span>
                {unackCount > 0 && (
                  <Button variant="ghost" size="xs" onClick={() => void handleMarkAll()}>
                    Mark all read
                  </Button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {alerts.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[var(--kts-text-secondary)] text-[var(--kts-font-size-sm)]">No alerts</p>
                    <p className="text-[var(--kts-text-tertiary)] text-[var(--kts-font-size-xs)] mt-1">Fleet is quiet.</p>
                  </div>
                ) : (
                  alerts.slice(0, 15).map((alert) => (
                    <div
                      key={alert.id ?? `${alert.created_at}-${alert.title}`}
                      onClick={() => void handleAlertClick(alert)}
                      className="px-4 py-3 border-b border-[var(--kts-border-default)] hover:bg-[var(--kts-interactive-hover)] cursor-pointer"
                      style={{ opacity: alert.acknowledged ? 0.55 : 1 }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                          style={{ background: SEVERITY_DOT[alert.severity] ?? 'var(--kts-status-pending)' }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">{alert.title}</p>
                          <p className="text-[var(--kts-text-secondary)] text-[var(--kts-font-size-xs)] mt-0.5">{alert.message}</p>
                          <p className="text-[var(--kts-text-tertiary)] text-[10px] mt-1">
                            {alert.acknowledged ? 'Acknowledged · ' : ''}
                            {timeAgo(alert.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t border-[var(--kts-border-default)] text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => {
                    setShowNotifications(false);
                    navigate('/alerts');
                  }}
                >
                  View all notifications
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Kiosk Toggle */}
        <Tooltip content={isKiosk ? 'Exit Kiosk Mode (F11)' : 'Enter Kiosk Mode (F11)'} position="bottom">
          <IconButton
            variant={isKiosk ? 'primary' : 'ghost'}
            size="sm"
            onClick={toggleKiosk}
            aria-label={isKiosk ? 'Exit Kiosk Mode' : 'Enter Kiosk Mode'}
            aria-pressed={isKiosk}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isKiosk ? (
                <>
                  <path d="M4 4h16v16H4z" />
                  <path d="M9 9h6v6H9z" />
                </>
              ) : (
                <>
                  <path d="M4 4h16v16H4z" />
                  <path d="M9 9h6v6H9z" />
                  <path d="M2 12h20" strokeDasharray="4 4" />
                </>
              )}
            </svg>
          </IconButton>
        </Tooltip>

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <Tooltip content="User Menu" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User Menu"
              aria-expanded={showUserMenu}
              className="gap-2 pl-1.5"
            >
              <span className="flex items-center gap-2">
                <DeviceAvatar type="desktop" name="Bradley" status="online" size="sm" />
                <span className="hidden sm:block font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">Bradley</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={showUserMenu ? 'rotate-180' : ''} style={{ transition: 'transform var(--kts-motion-fast)' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </Button>
          </Tooltip>

          {showUserMenu && (
            <div
              className="absolute right-0 top-full mt-2 z-[var(--kts-z-dropdown)] w-48"
              style={{
                background: 'var(--kts-bg-secondary)',
                border: '1px solid var(--kts-border-default)',
                borderRadius: 'var(--kts-radius-md)',
                boxShadow: 'var(--kts-shadow-lg)',
                overflow: 'hidden',
                animation: 'dropdown-slide-in 0.15s ease-out',
              }}
            >
              <div className="px-4 py-3 border-b border-[var(--kts-border-default)]">
                <div className="flex items-center gap-3">
                  <DeviceAvatar type="desktop" name="Bradley" status="online" size="base" />
                  <div>
                    <p className="font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">Bradley Kars</p>
                    <p className="text-[var(--kts-text-tertiary)] text-[var(--kts-font-size-xs)]">admin@karstechsolutions.com</p>
                  </div>
                </div>
              </div>
              <div className="py-1">
                {[
                  { label: 'Settings', icon: '⚙', action: 'settings' },
                  { label: 'Alerts', icon: '🔔', action: 'alerts' },
                ].map((item) => (
                  <Button
                    key={item.action}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    leftIcon={<span style={{ fontSize: '14px' }}>{item.icon}</span>}
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(item.action === 'settings' ? '/settings' : '/alerts');
                    }}
                    className="justify-start"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// Keyframes for dropdown
if (typeof document !== 'undefined' && !document.getElementById('kts-dropdown-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-dropdown-keyframes';
  style.textContent = `
    @keyframes dropdown-slide-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}