import { forwardRef, type HTMLAttributes } from 'react';

export interface LabelProps extends HTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
}

/**
 * Form label primitive. Shares the design-system label styling already used
 * by `Input`'s built-in `label` prop (mono, small, uppercase, secondary).
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ htmlFor, className = '', style, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        htmlFor={htmlFor}
        className={[
          'text-[var(--kts-font-size-xs)]',
          'font-[var(--kts-font-mono)]',
          'font-medium',
          'text-[var(--kts-text-secondary)]',
          'uppercase',
          'tracking-[0.08em]',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        style={style}
        {...props}
      >
        {children}
      </label>
    );
  },
);
Label.displayName = 'Label';
