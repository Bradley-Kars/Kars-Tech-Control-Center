import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'amber'
  | 'danger'
  | 'ghost'
  | 'outline'
  | 'subtle';
export type ButtonSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
  children: ReactNode;
}

const sizeStyles: Record<ButtonSize, { padding: string; fontSize: string; gap: string; iconSize: string }> = {
  xs: { padding: '4px 10px', fontSize: '11px', gap: '6px', iconSize: '12px' },
  sm: { padding: '6px 12px', fontSize: '12px', gap: '6px', iconSize: '14px' },
  base: { padding: '10px 18px', fontSize: '14px', gap: '8px', iconSize: '16px' },
  lg: { padding: '12px 24px', fontSize: '15px', gap: '8px', iconSize: '18px' },
  xl: { padding: '16px 32px', fontSize: '17px', gap: '10px', iconSize: '20px' },
};

const variantStyles: Record<ButtonVariant, { base: string; hover: string; active: string; disabled: string }> = {
  primary: {
    base: 'bg-[var(--kts-brand-primary)] text-[#082421]',
    hover: 'hover:bg-[var(--kts-brand-primary-hover)] hover:shadow-[var(--kts-shadow-teal-glow)]',
    active: 'active:bg-[var(--kts-brand-primary-hover)] active:shadow-none',
    disabled: 'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed disabled:shadow-none',
  },
  secondary: {
    base: 'bg-[var(--kts-bg-tertiary)] text-[var(--kts-text-primary)] border border-[var(--kts-border-default)]',
    hover: 'hover:bg-[var(--kts-interactive-hover)] hover:border-[var(--kts-border-strong)]',
    active: 'active:bg-[var(--kts-interactive-active)]',
    disabled: 'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:border-transparent disabled:cursor-not-allowed',
  },
  amber: {
    base: 'bg-[var(--kts-brand-secondary)] text-[#241300]',
    hover: 'hover:bg-[var(--kts-brand-secondary-hover)] hover:shadow-[var(--kts-shadow-amber-glow)]',
    active: 'active:bg-[var(--kts-brand-secondary-hover)] active:shadow-none',
    disabled: 'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed disabled:shadow-none',
  },
  danger: {
    base: 'bg-[var(--kts-status-error)] text-white',
    hover: 'hover:bg-[var(--kts-color-red-dim)] hover:shadow-[var(--kts-shadow-red-glow)]',
    active: 'active:bg-[var(--kts-color-red-dim)] active:shadow-none',
    disabled: 'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed disabled:shadow-none',
  },
  ghost: {
    base: 'bg-transparent text-[var(--kts-text-secondary)] border border-transparent',
    hover: 'hover:bg-[var(--kts-interactive-hover)] hover:text-[var(--kts-brand-primary)] hover:border-transparent',
    active: 'active:bg-[var(--kts-interactive-active)]',
    disabled: 'disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed disabled:bg-transparent',
  },
  outline: {
    base: 'bg-transparent text-[var(--kts-text-primary)] border border-[var(--kts-border-default)]',
    hover: 'hover:bg-[var(--kts-interactive-hover)] hover:border-[var(--kts-brand-primary)] hover:text-[var(--kts-brand-primary)]',
    active: 'active:bg-[var(--kts-interactive-active)] hover:border-[var(--kts-brand-primary-hover)]',
    disabled: 'disabled:bg-transparent disabled:text-[var(--kts-text-tertiary)] disabled:border-[var(--kts-interactive-disabled)] disabled:cursor-not-allowed',
  },
  subtle: {
    base: 'bg-[var(--kts-brand-primary-bg)] text-[var(--kts-brand-primary)] border border-transparent',
    hover: 'hover:bg-[var(--kts-brand-primary-bg)] hover:text-[var(--kts-brand-primary-hover)]',
    active: 'active:bg-[var(--kts-color-teal-alpha-20)]',
    disabled: 'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed',
  },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'base',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      className = '',
      style,
      ...props
    },
    ref
  ) => {
    const s = sizeStyles[size];
    const v = variantStyles[variant];
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={[
          'inline-flex items-center justify-center font-[var(--kts-font-sans)] font-semibold',
          'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
          'rounded-[var(--kts-radius-base)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)]',
          'active:scale-[0.98]',
          fullWidth && 'w-full',
          v.base,
          v.hover,
          v.active,
          v.disabled,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          padding: s.padding,
          fontSize: s.fontSize,
          gap: s.gap,
          ...style,
        }}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin"
            width={s.iconSize}
            height={s.iconSize}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeOpacity="0.25"
              strokeLinecap="round"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        )}
        {!loading && leftIcon && <span style={{ width: s.iconSize, height: s.iconSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{leftIcon}</span>}
        <span>{children}</span>
        {!loading && rightIcon && <span style={{ width: s.iconSize, height: s.iconSize, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';

/**
 * IconButton — Square button for icon-only actions
 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  'aria-label': string;
  children: ReactNode; // Should be an icon
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = 'ghost', size = 'base', loading = false, 'aria-label': ariaLabel, children, className = '', style, disabled = false, ...props }, ref) => {
    const s = sizeStyles[size];
    const v = variantStyles[variant];
    const isDisabled = disabled || loading;

    // Icon buttons are square — size determines both dimensions
    const dimension = size === 'xs' ? '28px' : size === 'sm' ? '32px' : size === 'base' ? '36px' : size === 'lg' ? '40px' : '44px';

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        aria-label={ariaLabel}
        className={[
          'inline-flex items-center justify-center',
          'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
          'rounded-[var(--kts-radius-base)]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)]',
          'active:scale-[0.95]',
          v.base,
          v.hover,
          v.active,
          v.disabled,
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: dimension,
          height: dimension,
          padding: 0,
          ...style,
        }}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin"
            width={s.iconSize}
            height={s.iconSize}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" strokeLinecap="round" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          children
        )}
      </button>
    );
  }
);

IconButton.displayName = 'IconButton';