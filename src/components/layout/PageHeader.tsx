import { useState, useRef, useEffect, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '../ui/Button';
import { Tooltip } from '../ui/Tooltip';

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/**
 * Page header used by content pages (Settings in Phase 2).
 * - Title: 22px Space Grotesk
 * - Optional one-line description
 * - Actions slot on the right (desktop)
 * - Secondary actions in a single overflow menu on mobile (< 640px)
 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-4 justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]" style={{ fontSize: '22px', letterSpacing: '-0.02em' }}>
              {title}
            </h1>
            {description && (
              <p className="mb-6 text-[var(--kts-font-size-sm)] text-[var(--kts-text-secondary)] leading-none">{description}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Desktop: actions always visible */}
            <div className="hidden md:flex items-center gap-2">
              {actions}
            </div>

            {/* Mobile: single overflow menu for secondary actions (only when actions are passed) */}
            {actions && (
              <div className="md:hidden flex items-center gap-2">
                <Tooltip content="More actions" position="bottom">
                  <IconButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setOpen((prev) => !prev)}
                    aria-label="More actions"
                    aria-expanded={open}
                  >
                    <MoreHorizontal width="18" height="18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </IconButton>
                </Tooltip>
                {open && actions && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-2 z-[var(--kts-z-dropdown)] w-48" style={{
                    background: 'var(--kts-bg-secondary)',
                    border: '1px solid var(--kts-border-default)',
                    borderRadius: 'var(--kts-radius-md)',
                    boxShadow: 'var(--kts-shadow-lg)',
                    overflow: 'hidden',
                    animation: 'dropdown-slide-in 0.15s ease-out',
                  }}>
                    <div className="py-1">{actions}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
    </div>
  );
}
