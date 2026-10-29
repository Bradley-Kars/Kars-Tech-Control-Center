import { useEffect, useRef, type ReactNode, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, IconButton } from './Button';

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'default';

export interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  duration?: number; // ms, 0 = persistent
  onClose: (id: string) => void;
  className?: string;
}

const typeStyles: Record<ToastType, { border: string; iconBg: string; iconColor: string; icon: ReactNode }> = {
  success: {
    border: 'var(--kts-border-success)',
    iconBg: 'var(--kts-status-running-bg)',
    iconColor: 'var(--kts-status-running)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
  error: {
    border: 'var(--kts-border-error)',
    iconBg: 'var(--kts-status-error-bg)',
    iconColor: 'var(--kts-status-error)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="15" y1="9" x2="9" y2="15" />
        <line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
  },
  warning: {
    border: 'var(--kts-border-warning)',
    iconBg: 'var(--kts-status-warning-bg)',
    iconColor: 'var(--kts-status-warning)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  info: {
    border: 'var(--kts-border-default)',
    iconBg: 'var(--kts-status-pending-bg)',
    iconColor: 'var(--kts-status-pending)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
  default: {
    border: 'var(--kts-border-default)',
    iconBg: 'var(--kts-interactive-hover)',
    iconColor: 'var(--kts-text-secondary)',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
};

export function Toast({ id, type, title, message, action, duration = 5000, onClose, className = '' }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);
  const styles = typeStyles[type];
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (duration > 0) {
      timerRef.current = setTimeout(() => {
        setIsExiting(true);
        setTimeout(() => onClose(id), 200);
      }, duration);
    }
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [duration, id, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 200);
  };

  return (
    <div
      className={[
        'toast flex items-start gap-3',
        'min-w-[320px] max-w-[420px]',
        'animate-toast-slide-in',
        isExiting && 'animate-toast-slide-out',
        className,
      ].filter(Boolean).join(' ')}
      style={{
        background: 'var(--kts-bg-secondary)',
        border: `1px solid ${styles.border}`,
        borderRadius: 'var(--kts-radius-md)',
        padding: 'var(--kts-space-4)',
        boxShadow: 'var(--kts-shadow-lg)',
        position: 'relative',
      }}
      role="alert"
      aria-live="polite"
    >
      <div
        className="flex-shrink-0 flex items-center justify-center"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--kts-radius-base)',
          background: styles.iconBg,
          color: styles.iconColor,
          marginTop: '2px',
        }}
        aria-hidden="true"
      >
        {styles.icon}
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
          {title}
        </h4>
        {message && (
          <p className="mt-1 text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-sm)', lineHeight: 'var(--kts-line-height-normal)' }}>
            {message}
          </p>
        )}
        {action && (
          <Button variant="subtle" size="xs" onClick={action.onClick} style={{ marginTop: 'var(--kts-space-2)' }}>
            {action.label}
          </Button>
        )}
      </div>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Dismiss"
        onClick={handleClose}
        style={{ marginTop: '-4px', marginRight: '-4px', color: 'var(--kts-text-tertiary)' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </IconButton>
    </div>
  );
}

// Toast Container & Manager
interface ToastItem extends ToastProps {
  key: string;
}

export interface ToastManagerProps {
  toasts: ToastItem[];
  onClose: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
  maxToasts?: number;
  gap?: number;
}

const positionStyles: Record<NonNullable<ToastManagerProps['position']>, React.CSSProperties> = {
  'top-right': { top: 'var(--kts-space-6)', right: 'var(--kts-space-6)', bottom: 'auto', left: 'auto' },
  'top-left': { top: 'var(--kts-space-6)', left: 'var(--kts-space-6)', bottom: 'auto', right: 'auto' },
  'bottom-right': { bottom: 'var(--kts-space-6)', right: 'var(--kts-space-6)', top: 'auto', left: 'auto' },
  'bottom-left': { bottom: 'var(--kts-space-6)', left: 'var(--kts-space-6)', top: 'auto', right: 'auto' },
  'top-center': { top: 'var(--kts-space-6)', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', right: 'auto' },
  'bottom-center': { bottom: 'var(--kts-space-6)', left: '50%', transform: 'translateX(-50%)', top: 'auto', right: 'auto' },
};

export function ToastManager({ toasts, onClose, position = 'top-right', maxToasts = 5, gap = 8 }: ToastManagerProps) {
  // Dedupe identical toasts (same type + title), keeping the latest.
  const deduped = toasts.reduce<Record<string, ToastItem>>((acc, t) => {
    acc[`${t.type}:${t.title}`] = t;
    return acc;
  }, {});
  const visibleToasts = Object.values(deduped).slice(-maxToasts);

  if (visibleToasts.length === 0) return null;

  const container = (
    <div
      className="toast-container fixed z-[var(--kts-z-toast)] flex flex-col"
      style={{
        ...positionStyles[position],
        gap: `${gap}px`,
        pointerEvents: 'none',
        maxWidth: '480px',
      }}
      aria-live="polite"
      aria-atomic="true"
    >
      {visibleToasts.map((toast) => (
        <div key={toast.key} style={{ pointerEvents: 'auto' }}>
          <Toast {...toast} onClose={onClose} />
        </div>
      ))}
    </div>
  );

  const portalRoot = document.getElementById('toast-portal') ?? document.body;
  return createPortal(container, portalRoot);
}

// Toast Hook for easy usage
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = (toast: Omit<ToastProps, 'id' | 'onClose'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newToast: ToastItem = { ...toast, id, key: id, onClose: removeToast };
    setToasts((prev) => [...prev, newToast]);
    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const success = (title: string, message?: string, options?: Partial<ToastProps>) =>
    addToast({ type: 'success', title, message, ...options });
  const error = (title: string, message?: string, options?: Partial<ToastProps>) =>
    addToast({ type: 'error', title, message, ...options });
  const warning = (title: string, message?: string, options?: Partial<ToastProps>) =>
    addToast({ type: 'warning', title, message, ...options });
  const info = (title: string, message?: string, options?: Partial<ToastProps>) =>
    addToast({ type: 'info', title, message, ...options });

  return { toasts, addToast, removeToast, success, error, warning, info };
}

// Keyframes
if (typeof document !== 'undefined' && !document.getElementById('kts-toast-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-toast-keyframes';
  style.textContent = `
    @keyframes toast-slide-in {
      from { opacity: 0; transform: translateX(100%) scale(0.95); }
      to { opacity: 1; transform: translateX(0) scale(1); }
    }
    @keyframes toast-slide-out {
      from { opacity: 1; transform: translateX(0) scale(1); }
      to { opacity: 0; transform: translateX(100%) scale(0.95); }
    }
    .toast-container * { pointer-events: auto; }
  `;
  document.head.appendChild(style);
}