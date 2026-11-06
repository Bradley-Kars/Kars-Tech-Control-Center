import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, Settings } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';
import { SIDEBAR_GROUPS } from '../../config/nav';

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
  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    SIDEBAR_GROUPS.map((group) => group.id),
  );

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) =>
      prev.includes(groupId) ? prev.filter((g) => g !== groupId) : [...prev, groupId],
    );
  };

  const isActive = (href: string) =>
    location.pathname === href || location.pathname.startsWith(`${href}/`);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Brand header + single collapse/expand toggle.
       gap between the mark, the title and the toggle so the boxes can
       never collide; the title truncates instead of overflowing into
       the mark or the toggle. In the collapsed rail the mark and toggle
       are sized to fit inside 56px without clipping. */}
      <div
        className={[
          'flex items-center gap-3 px-4 py-4 border-b',
          'border-[var(--kts-border-default)]',
          collapsed && 'justify-center',
        ].join(' ')}
        style={{ minHeight: '60px' }}
      >
        {collapsed ? (
          <div className="flex items-center justify-center gap-1">
            <img
              src="/favicon.svg"
              alt="KTS Master Control logo"
              className="shrink-0"
              style={{ width: 20, height: 20, borderRadius: 6 }}
            />
            <Tooltip content="Expand sidebar" position="right">
              <IconButton
                variant="ghost"
                size="xs"
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
            <div className="flex-1 min-w-0 overflow-hidden">
              <span className="truncate font-[var(--kts-font-heading)] font-bold text-[var(--kts-text-primary)] block leading-tight" style={{ fontSize: '15px', letterSpacing: '-0.01em' }}>
                KTS
              </span>
              <span className="truncate font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] text-[11px] block">
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

      {/* Navigation groups — every page in a group is a linkable destination */}
      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto" aria-label="Main navigation">
        {SIDEBAR_GROUPS.map((group) => {
          const isExpanded = expandedGroups.includes(group.id);
          return (
            <div key={group.id} className="space-y-1">
              {/* Collapsible group header */}
              <button
                onClick={() => toggleGroup(group.id)}
                className={[
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-[var(--kts-radius-base)]',
                  'text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)]',
                  'transition-colors duration-[var(--kts-motion-fast)]',
                  collapsed && 'justify-center',
                ].join(' ')}
                style={{ fontSize: 'var(--kts-font-size-xs)' }}
                aria-expanded={isExpanded}
              >
                {!collapsed && (
                  <span aria-hidden="true" className="flex-shrink-0" style={{ width: '16px', textAlign: 'center' }}>
                    {group.label.charAt(0)}
                  </span>
                )}
                {!collapsed && <span className="flex-1 text-left">{group.label}</span>}
                {!collapsed && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={isExpanded ? 'rotate-180' : ''}
                    style={{ transition: 'transform var(--kts-motion-fast)' }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>

              {/* Group items (visible only when the section is expanded) */}
              {!collapsed && isExpanded && (
                <div className="space-y-0.5 pl-2" style={{ borderLeft: '1px solid var(--kts-border-default)' }}>
                  {group.pages.map((page) => {
                    const Icon = page.icon;
                    const isCurrentPage = isActive(page.href);
                    return (
                      <NavLink
                        key={page.id}
                        to={page.href}
                        onClick={() => onNavigate(page.href)}
                        className={[
                          'nav-item flex items-center gap-3 px-3 py-2 rounded-[var(--kts-radius-base)]',
                          'transition-all duration-[var(--kts-motion-fast)]',
                          'text-[var(--kts-text-secondary)] hover:text-[var(--kts-text-primary)] hover:bg-[var(--kts-interactive-hover)]',
                          isCurrentPage && 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)] font-medium',
                        ].join(' ')}
                        style={{ fontSize: 'var(--kts-font-size-sm)' }}
                      >
                        <span className="flex-shrink-0" style={{ width: '20px', textAlign: 'center', fontSize: '16px' }}>
                          <Icon width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </span>
                        <span className="flex-1 truncate">{page.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
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
