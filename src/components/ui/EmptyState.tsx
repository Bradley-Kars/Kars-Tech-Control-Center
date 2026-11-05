import { type ReactNode } from 'react';

interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ message, icon, className }: EmptyStateProps) {
  return (
    <div
      className={['pt-6 pr-6 pb-6 pl-6 text-center py-8 text-[var(--kts-text-secondary)]', className].filter(Boolean).join(' ')}
      data-testid="empty-state"
    >
      <div className="flex flex-col items-center gap-3">
        {icon ?? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--kts-text-tertiary)]" opacity={0.5}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <path d="M7 7h10v10H7z" />
          </svg>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
}
