import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Badge } from '../ui/Badge';
import { Gauge } from '../ui/Gauge';
import { Button, IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { Card } from '../ui/Card';

interface NavPage {
  id: string;
  path?: string;
  label: string;
  icon?: string;
  deviceType?: string;
  description?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: string;
  pages: NavPage[];
}

export interface SidebarProps {
  location: { pathname: string };
  onNavigate: (path: string) => void;
  servers: Array<{ id: string; name: string; device_type: string; hostname: string }>;
  deviceStatus: Record<string, 'online' | 'offline' | 'warning'>;
  localStats: any;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'fleet',
    label: 'Fleet',
    icon: '◈',
    pages: [
      { id: 'dashboard', path: '/dashboard', label: 'Overview', icon: '◈', description: 'Fleet-wide status' },
      { id: 'alerts', path: '/alerts', label: 'Alerts', icon: '🔔', description: 'Active & acknowledged alerts' },
      { id: 'fleet-command', path: '/fleet-command', label: 'Fleet Command', icon: '⚡', description: 'Batch commands across devices' },
      { id: 'compliance', path: '/compliance', label: 'Patch Compliance', icon: '⬆', description: 'Update status & remote updates' },
      { id: 'chat', path: '/chat', label: 'Hermes Chat', icon: '💬', description: 'AI assistant for fleet ops' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    icon: '🧾',
    pages: [
      { id: 'ticketing', path: '/ticketing', label: 'Ticketing', icon: '🧾', description: 'Tickets & invoices (MC-1 mock)' },
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    icon: '🖥',
    pages: [
      { id: 'local', path: '/device/local', label: 'This Machine', icon: '💻', deviceType: 'desktop', description: 'Local Omarchy host' },
      { id: 'unraid', path: '/device/unraid', label: 'Unraid Server', icon: '🗄', deviceType: 'unraid', description: 'home-server.tailf6d3b4.ts.net' },
      { id: 'phone', path: '/device/phone', label: 'Galaxy S24 Ultra', icon: '📱', deviceType: 'phone', description: 'bradleys-s24-ultra.tailf6d3b4.ts.net' },
      { id: 'ally', path: '/device/ally', label: 'ROG Ally', icon: '🎮', deviceType: 'handheld', description: 'lgbtally.tailf6d3b4.ts.net' },
    ],
  },
  {
    id: 'services',
    label: 'Services',
    icon: '⚙',
    pages: [
      { id: 'docker', path: '/service/docker', label: 'Docker', icon: '🐳', description: 'Container management' },
      { id: 'storage', path: '/service/storage', label: 'Storage', icon: '💾', description: 'Array, disks, shares' },
      { id: 'system', path: '/service/system', label: 'System', icon: '⚙', description: 'CPU, memory, processes' },
      { id: 'network', path: '/service/network', label: 'Network', icon: '🌐', description: 'Interfaces, Tailscale' },
      { id: 'divider', label: '*arr Stack' },
      { id: 'lidarr', path: '/service/lidarr', label: 'Lidarr', icon: '🎵', description: 'Music' },
      { id: 'divider2', label: 'More Services' },
      { id: 'homeassistant', path: '/service/homeassistant', label: 'Home Assistant', icon: '🏠', description: 'Home automation' },
      { id: 'nextcloud', path: '/service/nextcloud', label: 'Nextcloud', icon: '☁', description: 'File sync & share' },
      { id: 'adguard', path: '/service/adguard', label: 'AdGuard', icon: '🛡', description: 'DNS filtering' },
      { id: 'myspeed', path: '/service/myspeed', label: 'MySpeed', icon: '📊', description: 'Speed tests' },
    ],
  },
];

function findServer(servers: SidebarProps['servers'], deviceType: string) {
  if (deviceType === 'local') return { id: 'local', name: 'This Machine', device_type: 'local', hostname: 'localhost' };
  return servers.find((s) => s.device_type === deviceType);
}

export function Sidebar({
  location,
  onNavigate,
  servers,
  deviceStatus,
  localStats,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['fleet', 'devices']);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId]);
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Logo / Brand */}
      <div
        className={[
          'flex items-center gap-3 px-4 py-4 border-b',
          'border-[var(--kts-border-default)]',
          collapsed && 'justify-center',
        ].join(' ')}
        style={{ minHeight: '64px' }}
      >
        {!collapsed && (
          <>
            <div className="flex-shrink-0">
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--kts-brand-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h4l2-7 4 14 2-7h6" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-text-primary)] truncate block" style={{ fontSize: 'var(--kts-font-size-lg)', letterSpacing: '-0.01em' }}>
                KTS Master Control
              </span>
              <span className="text-[var(--kts-text-tertiary)] truncate block" style={{ fontSize: 'var(--kts-font-size-xs)' }}>
                Fleet Operations Hub
              </span>
            </div>
          </>
        )}
        {collapsed && (
          <Tooltip content="KTS Master Control" position="right">
            <div style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'var(--kts-brand-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12h4l2-7 4 14 2-7h6" />
              </svg>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Collapse Toggle */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            fullWidth
            onClick={onToggleCollapse}
            aria-label="Collapse sidebar"
            className="justify-center"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            <span>Collapse</span>
          </Button>
        </div>
      )}

      {/* Navigation Groups */}
      <nav className="flex-1 px-2 py-2 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            expanded={expandedGroups.includes(group.id)}
            onToggle={() => toggleGroup(group.id)}
            isActive={isActive}
            onNavigate={onNavigate}
            servers={servers}
            deviceStatus={deviceStatus}
            collapsed={collapsed}
          />
        ))}
      </nav>

      {/* Bottom: Collapse button when collapsed */}
      {collapsed && (
        <div className="p-3 border-t border-[var(--kts-border-default)]">
          <Tooltip content="Expand sidebar" position="right">
            <IconButton
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </IconButton>
          </Tooltip>
        </div>
      )}

      {/* Footer: Actions + local vitals when expanded */}
      {!collapsed && (
        <div className="p-3 border-t border-[var(--kts-border-default)] flex gap-2">
          <Button
            variant="outline"
            size="sm"
            fullWidth
            leftIcon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>}
            onClick={() => window.dispatchEvent(new CustomEvent('kts:refresh'))}
            aria-label="Refresh all data"
          >
            Refresh
          </Button>
          <IconButton
            variant="outline"
            size="sm"
            aria-label="Open Settings"
            onClick={() => onNavigate('/settings')}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </IconButton>
        </div>
      )}
      {collapsed && (
        <div className="p-2 border-t border-[var(--kts-border-default)] flex flex-col gap-1 items-center">
          <Tooltip content="Refresh all data" position="right">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Refresh all data"
              onClick={() => window.dispatchEvent(new CustomEvent('kts:refresh'))}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
            </IconButton>
          </Tooltip>
          <Tooltip content="Settings" position="right">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Open Settings"
              onClick={() => onNavigate('/settings')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </IconButton>
          </Tooltip>
        </div>
      )}
      {!collapsed && localStats?.system && (
        <div className="p-3 border-t border-[var(--kts-border-default)]">
          <Card variant="subtle" padded>
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="kicker text-[var(--kts-font-size-xs)]">This Machine</span>
                <Badge variant="success" size="xs" dot>Online</Badge>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Gauge size="xs" value={localStats.system.cpu_usage || 0} variant="brand" label="CPU" showValue />
                <Gauge size="xs" value={localStats.system.memory_usage_pct || 0} variant="success" label="RAM" showValue />
                {localStats.gpu?.utilization_pct != null && (
                  <Gauge size="xs" value={localStats.gpu.utilization_pct} variant="info" label="GPU" showValue />
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

interface SidebarGroupProps {
  group: NavGroup;
  expanded: boolean;
  onToggle: () => void;
  isActive: (path: string) => boolean;
  onNavigate: (path: string) => void;
  servers: SidebarProps['servers'];
  deviceStatus: SidebarProps['deviceStatus'];
  collapsed: boolean;
}

function SidebarGroup({ group, expanded, onToggle, isActive, onNavigate, servers, deviceStatus, collapsed }: SidebarGroupProps) {
  const hasPages = group.pages.some((p) => p.path && !p.id.startsWith('divider'));

  return (
    <div className="space-y-1">
      {/* Group Header */}
      {(hasPages || group.id === 'services') && (
        <button
          onClick={onToggle}
          className={[
            'w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kts-radius-base)]',
            'text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)]',
            'transition-colors duration-[var(--kts-motion-fast)]',
            'font-[var(--kts-font-mono)] font-medium uppercase tracking-[0.08em]',
            collapsed && 'justify-center',
          ].join(' ')}
          style={{ fontSize: 'var(--kts-font-size-xs)' }}
          aria-expanded={expanded}
        >
          {!collapsed && <span className="flex-shrink-0" style={{ width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{group.icon}</span>}
          {!collapsed && <span className="flex-1 text-left">{group.label}</span>}
          {!collapsed && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={expanded ? 'rotate-180' : ''} style={{ transition: 'transform var(--kts-motion-fast)' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </button>
      )}

      {/* Group Items */}
      {!collapsed && expanded && hasPages && (
        <div className="space-y-0.5 pl-2" style={{ borderLeft: '1px solid var(--kts-border-default)' }}>
          {group.pages.map((page) => {
            if (page.id.startsWith('divider')) {
              return (
                <div key={page.id} className="px-2 py-1">
                  <span className="kicker-amber text-[var(--kts-font-size-xs)]" style={{ opacity: 0.7 }}>{page.label}</span>
                </div>
              );
            }

            if (!page.path) return null;

            const server = page.deviceType ? findServer(servers, page.deviceType) : null;
            const status = server ? deviceStatus[server.id] : 'online';
            const isCurrentPage = isActive(page.path);

            return (
              <Tooltip key={page.id} content={page.description} position="right" delay={300}>
                <NavLink
                  to={page.path}
                  onClick={() => onNavigate(page.path!)}
                  className={[
                    'nav-item flex items-center gap-3 px-2 py-2 rounded-[var(--kts-radius-base)]',
                    'transition-all duration-[var(--kts-motion-fast)]',
                    'text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)] hover:bg-[var(--kts-interactive-hover)]',
                    isCurrentPage && 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)]',
                    isCurrentPage && 'font-medium',
                  ].join(' ')}
                  style={{ fontSize: 'var(--kts-font-size-sm)' }}
                >
                  <span className="flex-shrink-0" style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}>{page.icon}</span>
                  <span className="flex-1 truncate">{page.label}</span>
                  {server && (
                    <Badge
                      variant={status === 'online' ? 'success' : status === 'warning' ? 'warning' : 'default'}
                      size="xs"
                      dot
                      pulsing={status === 'online'}
                    >
                      <span className="sr-only">{status}</span>
                    </Badge>
                  )}
                </NavLink>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );
}