import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import {
  alertList,
  alertAcknowledge,
  alertAcknowledgeAll,
} from '../../lib/tauri-commands';
import type { Alert } from '../../lib/types';
import {
  Menu,
  Search,
  Bell,
  RefreshCw,
  Terminal,
} from 'lucide-react';
import { routeTitle } from '../../config/nav';

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

export function TopBar({
  location,
  onMenuClick,
  onCommandPalette,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Click outside handlers
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
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
        setShowNotifications(false);
        setShowUserMenu(false);
        setShowActionsMenu(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCommandPalette]);

  // Live alerts feed (bell badge + dropdown)
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

  // Page title from route (breadcrumb)
  const pageTitle = useMemo(() => routeTitle(location.pathname), [location.pathname]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log('Search:', searchQuery);
      setSearchQuery('');
    }
  };

  const handleRefresh = () => {
    window.dispatchEvent(new CustomEvent('kts:refresh'));
    toast({ type: 'info', title: 'Refreshing fleet', message: 'Re-querying all devices and services.' });
  };

  const openCommandPalette = () => {
    onCommandPalette();
    searchRef.current?.focus();
  };

  return (
    <header
      className="top-bar flex items-center justify-between gap-2"
      style={{
        height: '48px',
        padding: '0 var(--kts-space-6)',
        background: 'var(--kts-bg-secondary)',
        borderBottom: '1px solid var(--kts-border-default)',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--kts-z-sticky)',
        minWidth: 0, // allow inner flex items to shrink
      }}
    >
      {/* Left: Hamburger + truncated page title (+ mobile search icon button) */}
      <div className="flex items-center gap-2 min-w-0">
        <Tooltip content="Menu" position="bottom">
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            aria-label="Open navigation menu"
          >
            <Menu width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </IconButton>
        </Tooltip>

        <span className="flex-1 min-w-0 truncate font-[var(--kts-font-sans)] font-medium text-[var(--kts-text-primary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
          {pageTitle}
        </span>

        {/* Mobile: search icon button (< 640px) */}
        <div className="sm:hidden flex items-center gap-2">
          <Tooltip content="Search" position="bottom">
            <IconButton
              variant="ghost"
              size="sm"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              aria-label="Search"
              aria-expanded={showActionsMenu}
            >
              <Search width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </IconButton>
          </Tooltip>
          {showActionsMenu && (
            <div className="absolute left-0 top-full mt-1 z-[var(--kts-z-dropdown)] w-[260px]" style={{
              background: 'var(--kts-bg-secondary)',
              border: '1px solid var(--kts-border-default)',
              borderRadius: 'var(--kts-radius-md)',
              boxShadow: 'var(--kts-shadow-lg)',
              overflow: 'hidden',
              animation: 'dropdown-slide-in 0.15s ease-out',
            }}>
              <div className="px-3 py-2 border-b border-[var(--kts-border-default)]">
                <span className="kicker text-[var(--kts-font-size-xs)]">Search</span>
              </div>
              <div className="px-2 py-2">
                <form onSubmit={handleSearch} className="relative">
                  <Input
                    ref={searchRef}
                    type="search"
                    placeholder="Search or jump to…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    size="sm"
                    leftIcon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                      </svg>
                    }
                    rightIcon={
                      <kbd className="font-[var(--kts-font-mono)] text-[10px]">⌘K</kbd>
                    }
                    className="w-full"
                  />
                </form>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Center: Global Search (fixed-width slot, does not move between pages) */}
      <div className="w-[480px] shrink-0 min-w-0 hidden sm:flex">
        <form onSubmit={handleSearch} className="relative w-full">
          <Input
            ref={searchRef}
            type="search"
            placeholder="Search or jump to…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            size="sm"
            leftIcon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            }
            rightIcon={
              <kbd className="font-[var(--kts-font-mono)] text-[10px]">⌘K</kbd>
            }
            className="w-full"
          />
        </form>
      </div>

      {/* Right: Actions dropdown, Notifications, Kiosk Toggle, User */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Actions — single dropdown button, one line, whitespace-nowrap */}
        <div className="relative hidden sm:flex" ref={actionsMenuRef}>
          <Tooltip content="Actions" position="bottom">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowActionsMenu(!showActionsMenu)}
              aria-label="Actions"
              aria-expanded={showActionsMenu}
              className="flex flex-row items-center gap-2 px-2 whitespace-nowrap"
              style={{ gap: '8px' }}
            >
              <Terminal width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <span className="hidden sm:inline-block ml-2 font-[var(--kts-font-sans)] text-[var(--kts-font-size-sm)]">
                Actions
              </span>
            </Button>
          </Tooltip>
          {showActionsMenu && (
            <div className="absolute right-0 top-full mt-2 z-[var(--kts-z-dropdown)] w-48" style={{
              background: 'var(--kts-bg-secondary)',
              border: '1px solid var(--kts-border-default)',
              borderRadius: 'var(--kts-radius-md)',
              boxShadow: 'var(--kts-shadow-lg)',
              overflow: 'hidden',
              animation: 'dropdown-slide-in 0.15s ease-out',
            }}>
              <div className="px-3 py-2 border-b border-[var(--kts-border-default)]">
                <span className="kicker text-[var(--kts-font-size-xs)]">Actions</span>
              </div>
              <div className="py-1">
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => { setShowActionsMenu(false); void handleRefresh(); }}
                  aria-label="Refresh all data"
                  className="justify-start px-3"
                >
                  <RefreshCw width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <span className="ml-2 text-[var(--kts-font-sans)] text-[var(--kts-font-size-sm)]">Refresh</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => { setShowActionsMenu(false); void openCommandPalette(); }}
                  aria-label="Open command palette"
                  className="justify-start px-3"
                >
                  <Menu width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <span className="ml-2 text-[var(--kts-font-sans)] text-[var(--kts-font-size-sm)]">Command palette</span>
                </Button>
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
              <Bell width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

        {/* User Menu */}
        <div className="relative" ref={userMenuRef}>
          <Tooltip content="User Menu" position="bottom">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              aria-label="User Menu"
              aria-expanded={showUserMenu}
              className="inline-flex items-center gap-2 rounded-[var(--kts-radius-base)] px-1.5 min-w-0 transition-colors hover:bg-[var(--kts-interactive-hover)] focus:outline-none overflow-hidden"
              style={{
                height: '36px',
                padding: 0,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                font: 'inherit',
                color: 'inherit',
              }}
            >
              <Avatar
                name="Bradley Kars"
                status="online"
                size="sm"
                fontClass="font-semibold"
                fontSize="14px"
                style={{
                  background: 'var(--kts-brand-primary)',
                  width: '32px',
                  height: '32px',
                }}
              />
              <span className="hidden sm:block font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]" title="Bradley Kars · admin@karstechsolutions.com">Bradley</span>
            </button>
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
                  <Avatar
                    name="Bradley"
                    status="online"
                    size="base"
                    fontClass="font-semibold"
                    fontSize="14px"
                    style={{
                      background: 'var(--kts-brand-primary)',
                      width: '40px',
                      height: '40px',
                    }}
                  />
                  <div>
                    <p className="font-medium text-[var(--kts-text-primary)] text-[var(--kts-font-size-sm)]">Bradley Kars</p>
                    <p className="text-[var(--kts-text-tertiary)] text-[var(--kts-font-size-xs)]">admin@karstechsolutions.com</p>
                  </div>
                </div>
              </div>
              <div className="py-1">
                {[
                  { label: 'Settings', action: 'settings' },
                  { label: 'Alerts', action: 'alerts' },
                ].map((item) => (
                  <Button
                    key={item.action}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      setShowUserMenu(false);
                      navigate(item.action === 'settings' ? '/settings' : '/alerts');
                    }}
                    className="justify-start px-3"
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
