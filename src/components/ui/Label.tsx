import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export interface LabelProps extends HTMLAttributes<HTMLLabelElement> {
  htmlFor?: string;
  children: ReactNode;
}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ htmlFor, children, className = '', style, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={[
        'text-[var(--kts-font-size-xs)] font-[var(--kts-font-mono)] font-medium text-[var(--kts-text-secondary)] uppercase tracking-[0.08em]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      {...props}
    >
      {children}
    </label>
  ),
);

Label.displayName = 'Label';
