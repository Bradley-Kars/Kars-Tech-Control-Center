import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'amber'
  | 'subtle'
  | 'subtle-success'
  | 'subtle-warning'
  | 'subtle-danger'
  | 'subtle-info';

export type BadgeSize = 'xs' | 'sm' | 'base';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  pulsing?: boolean;
  children: ReactNode;
}

const sizeStyles: Record<BadgeSize, { padding: string; fontSize: string; gap: string; dotSize: string; borderRadius: string }> = {
  xs: { padding: '2px 6px', fontSize: '10px', gap: '4px', dotSize: '5px', borderRadius: '9999px' },
  sm: { padding: '3px 8px', fontSize: '11px', gap: '5px', dotSize: '6px', borderRadius: '9999px' },
  base: { padding: '4px 10px', fontSize: '12px', gap: '6px', dotSize: '7px', borderRadius: '9999px' },
};

const variantStyles: Record<BadgeVariant, { base: string; dotColor: string }> = {
  default: { base: 'bg-[var(--kts-border-default)] text-[var(--kts-text-secondary)]', dotColor: 'var(--kts-text-secondary)' },
  success: { base: 'bg-[var(--kts-status-running-bg)] text-[var(--kts-status-running)]', dotColor: 'var(--kts-status-running)' },
  warning: { base: 'bg-[var(--kts-status-warning-bg)] text-[var(--kts-status-warning)]', dotColor: 'var(--kts-status-warning)' },
  danger: { base: 'bg-[var(--kts-status-error-bg)] text-[var(--kts-status-error)]', dotColor: 'var(--kts-status-error)' },
  info: { base: 'bg-[var(--kts-status-pending-bg)] text-[var(--kts-status-pending)]', dotColor: 'var(--kts-status-pending)' },
  brand: { base: 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)]', dotColor: 'var(--kts-brand-primary)' },
  amber: { base: 'bg-[var(--kts-brand-secondary-bg)] text-[var(--kts-brand-secondary)]', dotColor: 'var(--kts-brand-secondary)' },
  // Subtle variants — lighter background, no border
  subtle: { base: 'bg-[var(--kts-interactive-hover)] text-[var(--kts-text-secondary)]', dotColor: 'var(--kts-text-secondary)' },
  'subtle-success': { base: 'bg-[var(--kts-status-running-bg)] text-[var(--kts-status-running)]', dotColor: 'var(--kts-status-running)' },
  'subtle-warning': { base: 'bg-[var(--kts-status-warning-bg)] text-[var(--kts-status-warning)]', dotColor: 'var(--kts-status-warning)' },
  'subtle-danger': { base: 'bg-[var(--kts-status-error-bg)] text-[var(--kts-status-error)]', dotColor: 'var(--kts-status-error)' },
  'subtle-info': { base: 'bg-[var(--kts-status-pending-bg)] text-[var(--kts-status-pending)]', dotColor: 'var(--kts-status-pending)' },
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', size = 'sm', dot = false, pulsing = false, children, className = '', style, ...props }, ref) => {
    const s = sizeStyles[size];
    const v = variantStyles[variant];

    return (
      <span
        ref={ref}
        className={[
          'inline-flex items-center font-[var(--kts-font-sans)] font-medium',
          'border-0',
          v.base,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          gap: s.gap,
          borderRadius: s.borderRadius,
          ...style,
        }}
        {...props}
      >
        {dot && (
          <span
            className={['pulse-dot', pulsing && 'animate-pulse'].filter(Boolean).join(' ')}
            style={{
              width: s.dotSize,
              height: s.dotSize,
              borderRadius: '50%',
              backgroundColor: v.dotColor,
              flexShrink: 0,
              animation: pulsing ? 'pulse 2.2s infinite' : 'none',
              boxShadow: pulsing ? `0 0 0 0 ${v.dotColor}80` : 'none',
            }}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

/**
 * StatusBadge — Semantic badge for device/service status
 */
export type StatusBadgeState = 'running' | 'stopped' | 'error' | 'warning' | 'pending' | 'unknown';

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  state: StatusBadgeState;
  size?: BadgeSize;
  showDot?: boolean;
  pulsing?: boolean;
  label?: string;
}

const stateMap: Record<StatusBadgeState, { variant: BadgeVariant; defaultLabel: string }> = {
  running: { variant: 'success', defaultLabel: 'Running' },
  stopped: { variant: 'default', defaultLabel: 'Stopped' },
  error: { variant: 'danger', defaultLabel: 'Error' },
  warning: { variant: 'warning', defaultLabel: 'Warning' },
  pending: { variant: 'info', defaultLabel: 'Pending' },
  unknown: { variant: 'subtle', defaultLabel: 'Unknown' },
};

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ state, size = 'sm', showDot = true, pulsing = false, label, className = '', ...props }, ref) => {
    const { variant, defaultLabel } = stateMap[state];
    const displayLabel = label ?? defaultLabel;
    const shouldPulse = pulsing && state === 'running';

    return (
      <Badge
        ref={ref}
        variant={variant}
        size={size}
        dot={showDot}
        pulsing={shouldPulse}
        className={className}
        {...props}
      >
        {displayLabel}
      </Badge>
    );
  }
);

StatusBadge.displayName = 'StatusBadge';