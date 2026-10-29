import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { SIDEBAR_ITEMS } from '../../config/nav';

export interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (path: string) => void;
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  const location = useLocation();

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(`${href}/`);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Brand header + single collapse/expand toggle */}
      <div
        className={[
          'flex items-center justify-between px-4 py-4 border-b',
          'border-[var(--kts-border-default)]',
          collapsed && 'justify-center',
        ].join(' ')}
        style={{ minHeight: '60px' }}
      >
        {collapsed ? (
          <div className="flex items-center justify-center gap-2">
            <img
              src="/favicon.svg"
              alt="KTS Master Control logo"
              className="shrink-0"
              style={{ width: 24, height: 24, borderRadius: 6 }}
            />
            <Tooltip content="Expand sidebar" position="right">
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
              >
                <ChevronRight width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </IconButton>
            </Tooltip>
          </div>
        ) : (
          <>
            <div className="flex-shrink-0">
              <img
                src="/favicon.svg"
                alt="KTS Master Control logo"
                className="shrink-0"
                style={{ width: 32, height: 32, borderRadius: 8 }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-[var(--kts-font-heading)] font-bold text-[var(--kts-text-primary)] block leading-tight" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>
                KTS
              </span>
              <span className="font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] text-[11px] block">
                Master Control
              </span>
            </div>
            <Tooltip content="Collapse sidebar" position="bottom">
              <IconButton
                variant="ghost"
                size="sm"
                onClick={onToggleCollapse}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </div>

      {/* Navigation — only Ticketing and Settings are linkable */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {SIDEBAR_ITEMS.map((item) => {
          const Icon = item.icon;
          const isCurrentPage = isActive(item.href);
          return (
            <Tooltip key={item.id} content={item.label} position="right" delay={200}>
              <NavLink
                to={item.href}
                onClick={() => onNavigate(item.href)}
                className={[
                  'nav-item flex items-center gap-3 rounded-[var(--kts-radius-md)]',
                  'transition-all duration-[var(--kts-motion-fast)]',
                  collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2.5',
                  'text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)] hover:bg-[var(--kts-interactive-hover)]',
                  isCurrentPage && 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)] font-medium',
                ].join(' ')}
                style={{ fontSize: 'var(--kts-font-size-sm)' }}
              >
                <span className="flex-shrink-0" style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}>
                  <Icon width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </span>
                {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
              </NavLink>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom: icon-only actions when collapsed */}
      {collapsed && (
        <div className="p-3 border-t border-[var(--kts-border-default)] flex flex-col gap-1.5 items-center">
          <Tooltip content="Refresh all data" position="right">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Refresh all data"
              onClick={() => window.dispatchEvent(new CustomEvent('kts:refresh'))}
            >
              <RefreshCw width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </IconButton>
          </Tooltip>
          <Tooltip content="Settings" position="right">
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Open Settings"
              onClick={() => onNavigate('/settings')}
            >
              <Settings width="16" height="16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </IconButton>
          </Tooltip>
        </div>
      )}
    </div>
  );
}
