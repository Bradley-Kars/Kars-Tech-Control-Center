import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Card — Base surface component with accent bar
 * Variants: default, amber, red, dual, subtle (no accent bar)
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'amber' | 'red' | 'dual' | 'subtle';
  padded?: boolean;
  hoverable?: boolean;
  children: ReactNode;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padded = true, hoverable = false, children, className = '', style, ...props }, ref) => {
    const variantClasses = {
      default: 'card',
      amber: 'card card-amber',
      red: 'card card-red',
      dual: 'card card-dual',
      subtle: 'card-subtle',
    };

    const baseClass = [
      variantClasses[variant],
      padded && 'p-5',
      hoverable && 'transition-all duration-[var(--kts-motion-base)] hover:shadow-[var(--kts-shadow-md)] hover:border-[var(--kts-border-focus)] cursor-pointer',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div
        ref={ref}
        className={baseClass}
        style={{
          background: 'var(--kts-bg-secondary)',
          border: '1px solid var(--kts-border-default)',
          borderRadius: 'var(--kts-radius-md)',
          position: 'relative',
          overflow: 'hidden',
          ...style,
        }}
        {...props}
      >
        {variant !== 'subtle' && (
          <div
            className="card-accent"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '3px',
              background:
                variant === 'amber'
                  ? 'linear-gradient(90deg, var(--kts-brand-secondary), transparent)'
                  : variant === 'red'
                  ? 'linear-gradient(90deg, var(--kts-status-error), transparent)'
                  : variant === 'dual'
                  ? 'linear-gradient(90deg, var(--kts-brand-primary), var(--kts-brand-secondary))'
                  : 'linear-gradient(90deg, var(--kts-brand-primary), transparent)',
            }}
          />
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * CardSection — Consistent section within a card
 */
export interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export const CardSection = forwardRef<HTMLDivElement, CardSectionProps>(
  ({ title, subtitle, action, children, className = '', ...props }, ref) => {
    return (
      <div ref={ref} className={`flex flex-col ${className}`} {...props}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="kicker text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] text-[var(--kts-brand-primary)] uppercase tracking-[0.12em] mb-1">
              {title}
            </h3>
            {subtitle && (
              <p className="text-[var(--kts-font-size-sm)] text-[var(--kts-text-secondary)]">{subtitle}</p>
            )}
          </div>
          {action && <div className="flex-shrink-0">{action}</div>}
        </div>
        <div className="flex-1">{children}</div>
      </div>
    );
  }
);

CardSection.displayName = 'CardSection';