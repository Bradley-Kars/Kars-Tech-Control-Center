import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react';

export type InputSize = 'xs' | 'sm' | 'base' | 'lg';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: InputSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const sizeStyles: Record<InputSize, { padding: string; fontSize: string; iconSize: string; gap: string }> = {
  xs: { padding: '6px 10px', fontSize: '12px', iconSize: '14px', gap: '6px' },
  sm: { padding: '8px 12px', fontSize: '13px', iconSize: '15px', gap: '8px' },
  base: { padding: '10px 14px', fontSize: '14px', iconSize: '16px', gap: '8px' },
  lg: { padding: '12px 16px', fontSize: '15px', iconSize: '18px', gap: '10px' },
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, size = 'base', leftIcon, rightIcon, fullWidth = true, className = '', style, id, ...props }, ref) => {
    const s = sizeStyles[size];
    const inputId = id ?? `input-${Math.random().toString(36).slice(2, 9)}`;
    const hintId = hint ? `${inputId}-hint` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className={['flex flex-col gap-1.5', fullWidth && 'w-full'].filter(Boolean).join(' ')}>
        {label && (
          <label
            htmlFor={inputId}
            className="text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] uppercase tracking-[0.08em]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div
              className="absolute top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] pointer-events-none flex items-center justify-center"
              style={{ left: s.gap, width: s.iconSize, height: s.iconSize }}
              aria-hidden="true"
            >
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full',
              'bg-[var(--kts-bg-tertiary)]',
              'text-[var(--kts-text-primary)]',
              'placeholder:text-[var(--kts-text-tertiary)]',
              'border border-[var(--kts-border-default)]',
              'rounded-[var(--kts-radius-base)]',
              'outline-none',
              'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)] focus-visible:border-transparent',
              'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed',
              'read-only:bg-[var(--kts-interactive-hover)]',
              error && 'border-[var(--kts-border-error)] focus-visible:ring-[var(--kts-border-error)]',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              padding: s.padding,
              paddingLeft: leftIcon ? `calc(${s.gap} + ${s.iconSize} + ${s.gap})` : undefined,
              paddingRight: rightIcon ? `calc(${s.gap} + ${s.iconSize} + ${s.gap})` : undefined,
              fontSize: s.fontSize,
              fontFamily: 'var(--kts-font-sans)',
              ...style,
            }}
            aria-describedby={`${hintId ?? ''} ${errorId ?? ''}`.trim() || undefined}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          />
          {rightIcon && (
            <div
              className="absolute top-1/2 -translate-y-1/2 text-[var(--kts-text-tertiary)] pointer-events-none flex items-center justify-center"
              style={{ right: s.gap, width: s.iconSize, height: s.iconSize }}
              aria-hidden="true"
            >
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[var(--kts-font-size-xs)] text-[var(--kts-status-error)] flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea — Multi-line input
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  size?: InputSize;
  fullWidth?: boolean;
  minRows?: number;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, size = 'base', fullWidth = true, minRows = 3, className = '', style, id, ...props }, ref) => {
    const s = sizeStyles[size];
    const textareaId = id ?? `textarea-${Math.random().toString(36).slice(2, 9)}`;
    const hintId = hint ? `${textareaId}-hint` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
      <div className={['flex flex-col gap-1.5', fullWidth && 'w-full'].filter(Boolean).join(' ')}>
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] uppercase tracking-[0.08em]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={[
            'w-full',
            'bg-[var(--kts-bg-tertiary)]',
            'text-[var(--kts-text-primary)]',
            'placeholder:text-[var(--kts-text-tertiary)]',
            'border border-[var(--kts-border-default)]',
            'rounded-[var(--kts-radius-base)]',
            'outline-none',
            'resize-y',
            'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
            'focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)] focus-visible:border-transparent',
            'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed',
            error && 'border-[var(--kts-border-error)] focus-visible:ring-[var(--kts-border-error)]',
            className,
          ]
            .filter(Boolean)
            .join(' ')}
          style={{
            padding: s.padding,
            fontSize: s.fontSize,
            fontFamily: 'var(--kts-font-sans)',
            lineHeight: 'var(--kts-line-height-normal)',
            minHeight: `${minRows * 24 + parseInt(s.padding) * 2}px`,
            ...style,
          }}
          aria-describedby={`${hintId ?? ''} ${errorId ?? ''}`.trim() || undefined}
          aria-invalid={error ? 'true' : 'false'}
          {...props}
        />
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[var(--kts-font-size-xs)] text-[var(--kts-status-error)] flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * Select — Styled select dropdown
 */
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: InputSize;
  fullWidth?: boolean;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, size = 'base', fullWidth = true, options, placeholder, className = '', style, id, ...props }, ref) => {
    const s = sizeStyles[size];
    const selectId = id ?? `select-${Math.random().toString(36).slice(2, 9)}`;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className={['flex flex-col gap-1.5', fullWidth && 'w-full'].filter(Boolean).join(' ')}>
        {label && (
          <label
            htmlFor={selectId}
            className="text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] uppercase tracking-[0.08em]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={[
              'w-full appearance-none',
              'bg-[var(--kts-bg-tertiary)]',
              'text-[var(--kts-text-primary)]',
              'border border-[var(--kts-border-default)]',
              'rounded-[var(--kts-radius-base)]',
              'outline-none',
              'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
              'focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)] focus-visible:border-transparent',
              'disabled:bg-[var(--kts-interactive-disabled)] disabled:text-[var(--kts-text-tertiary)] disabled:cursor-not-allowed',
              'cursor-pointer',
              error && 'border-[var(--kts-border-error)] focus-visible:ring-[var(--kts-border-error)]',
              'pr-10', // Space for custom arrow
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              padding: s.padding,
              fontSize: s.fontSize,
              fontFamily: 'var(--kts-font-sans)',
              ...style,
            }}
            aria-describedby={`${hintId ?? ''} ${errorId ?? ''}`.trim() || undefined}
            aria-invalid={error ? 'true' : 'false'}
            {...props}
          >
            {placeholder && (
              <option value="" disabled selected hidden>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          {/* Custom dropdown arrow */}
          <div
            className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center text-[var(--kts-text-tertiary)]"
            style={{ width: '32px', height: '100%', paddingRight: '8px' }}
            aria-hidden="true"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        {error && (
          <p
            id={errorId}
            role="alert"
            className="text-[var(--kts-font-size-xs)] text-[var(--kts-status-error)] flex items-center gap-1"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-[var(--kts-font-size-xs)] text-[var(--kts-text-tertiary)]">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';