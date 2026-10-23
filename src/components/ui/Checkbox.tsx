import { forwardRef, type InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  indeterminate?: boolean;
  size?: 'sm' | 'base' | 'lg';
}

const sizeStyles = {
  sm: { box: '16px', icon: '10px', gap: '8px', labelSize: '13px' },
  base: { box: '18px', icon: '12px', gap: '10px', labelSize: '14px' },
  lg: { box: '20px', icon: '14px', gap: '12px', labelSize: '15px' },
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, indeterminate = false, size = 'base', className = '', style, disabled, checked, onChange, id, ...props }, ref) => {
    const s = sizeStyles[size];
    const inputId = id ?? `checkbox-${Math.random().toString(36).slice(2, 9)}`;

    return (
      <label
        className={['inline-flex items-start cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className].filter(Boolean).join(' ')}
        style={{ gap: s.gap, ...style }}
      >
        <div className="relative flex-shrink-0" style={{ width: s.box, height: s.box }}>
          <input
            ref={(node) => {
              if (node) node.indeterminate = indeterminate;
              if (typeof ref === 'function') ref(node);
              else if (ref && typeof ref === 'object') ref.current = node;
            }}
            type="checkbox"
            id={inputId}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
            {...props}
          />
          <div
            className={[
              'absolute inset-0 rounded-[var(--kts-radius-sm)] border-2 flex items-center justify-center',
              'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)]',
              checked && !indeterminate && 'bg-[var(--kts-brand-primary)] border-[var(--kts-brand-primary)]',
              indeterminate && !checked && 'bg-[var(--kts-brand-primary)] border-[var(--kts-brand-primary)]',
              !checked && !indeterminate && 'border-[var(--kts-border-default)] bg-transparent',
              disabled && 'opacity-50 cursor-not-allowed',
            ].filter(Boolean).join(' ')}
            style={{ width: s.box, height: s.box }}
            aria-hidden="true"
          >
            {checked && !indeterminate && (
              <svg width={s.icon} height={s.icon} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {indeterminate && !checked && (
              <div style={{ width: `${parseInt(s.box) * 0.6}px`, height: '2px', background: 'white', borderRadius: '1px' }} />
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            {label && (
              <span
                className="font-medium truncate"
                style={{ fontSize: s.labelSize, color: 'var(--kts-text-primary)', fontFamily: 'var(--kts-font-sans)' }}
              >
                {label}
              </span>
            )}
            {description && (
              <span className="truncate" style={{ fontSize: 'var(--kts-font-size-xs)', color: 'var(--kts-text-tertiary)' }}>
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';

/**
 * CheckboxGroup — Multiple checkboxes with shared state
 */
export interface CheckboxGroupProps {
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>;
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
  description?: string;
  inline?: boolean;
  size?: 'sm' | 'base' | 'lg';
  className?: string;
}

export function CheckboxGroup({
  options,
  value,
  onChange,
  label,
  description,
  inline = false,
  size = 'base',
  className = '',
}: CheckboxGroupProps) {
  const handleChange = (optionValue: string, checked: boolean) => {
    const newValue = checked ? [...value, optionValue] : value.filter((v) => v !== optionValue);
    onChange(newValue);
  };

  return (
    <fieldset
      className={['flex flex-col gap-2', inline && 'flex-row flex-wrap items-center gap-4', className].filter(Boolean).join(' ')}
    >
      {(label || description) && (
        <legend className="font-medium text-[var(--kts-text-primary)]" style={{ fontSize: sizeStyles[size].labelSize }}>
          {label}
          {description && <span className="text-[var(--kts-text-tertiary)] font-normal" style={{ fontSize: 'var(--kts-font-size-xs)', marginLeft: '8px' }}>{description}</span>}
        </legend>
      )}
      <div className={['flex flex-col gap-1.5', inline && 'flex-row flex-wrap gap-4'].filter(Boolean).join(' ')}>
        {options.map((opt) => (
          <Checkbox
            key={opt.value}
            label={opt.label}
            description={opt.description}
            checked={value.includes(opt.value)}
            disabled={opt.disabled}
            size={size}
            onChange={(e) => handleChange(opt.value, e.target.checked)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Radio — Radio button input
 */
export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'base' | 'lg';
}

const radioSizeStyles = {
  sm: { box: '16px', dot: '6px', gap: '8px', labelSize: '13px' },
  base: { box: '18px', dot: '7px', gap: '10px', labelSize: '14px' },
  lg: { box: '20px', dot: '8px', gap: '12px', labelSize: '15px' },
};

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, size = 'base', className = '', style, disabled, checked, onChange, id, ...props }, ref) => {
    const s = radioSizeStyles[size];
    const inputId = id ?? `radio-${Math.random().toString(36).slice(2, 9)}`;

    return (
      <label
        className={['inline-flex items-start cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className].filter(Boolean).join(' ')}
        style={{ gap: s.gap, ...style }}
      >
        <div className="relative flex-shrink-0" style={{ width: s.box, height: s.box }}>
          <input
            ref={ref}
            type="radio"
            id={inputId}
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
            {...props}
          />
          <div
            className={[
              'absolute inset-0 rounded-full border-2 flex items-center justify-center',
              'transition-all duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-ease-out)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)]',
              checked && 'border-[var(--kts-brand-primary)]',
              !checked && 'border-[var(--kts-border-default)]',
              disabled && 'opacity-50 cursor-not-allowed',
            ].filter(Boolean).join(' ')}
            style={{ width: s.box, height: s.box }}
            aria-hidden="true"
          >
            {checked && (
              <div
                className="rounded-full bg-[var(--kts-brand-primary)]"
                style={{ width: s.dot, height: s.dot }}
              />
            )}
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            {label && (
              <span
                className="font-medium truncate"
                style={{ fontSize: s.labelSize, color: 'var(--kts-text-primary)', fontFamily: 'var(--kts-font-sans)' }}
              >
                {label}
              </span>
            )}
            {description && (
              <span className="truncate" style={{ fontSize: 'var(--kts-font-size-xs)', color: 'var(--kts-text-tertiary)' }}>
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Radio.displayName = 'Radio';

/**
 * RadioGroup — Multiple radios with shared state
 */
export interface RadioGroupProps {
  options: Array<{ value: string; label: string; description?: string; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  inline?: boolean;
  size?: 'sm' | 'base' | 'lg';
  className?: string;
}

export function RadioGroup({
  options,
  value,
  onChange,
  label,
  description,
  inline = false,
  size = 'base',
  className = '',
}: RadioGroupProps) {
  return (
    <fieldset
      className={['flex flex-col gap-2', inline && 'flex-row flex-wrap items-center gap-4', className].filter(Boolean).join(' ')}
    >
      {(label || description) && (
        <legend className="font-medium text-[var(--kts-text-primary)]" style={{ fontSize: radioSizeStyles[size].labelSize }}>
          {label}
          {description && <span className="text-[var(--kts-text-tertiary)] font-normal" style={{ fontSize: 'var(--kts-font-size-xs)', marginLeft: '8px' }}>{description}</span>}
        </legend>
      )}
      <div className={['flex flex-col gap-1.5', inline && 'flex-row flex-wrap gap-4'].filter(Boolean).join(' ')}>
        {options.map((opt) => (
          <Radio
            key={opt.value}
            label={opt.label}
            description={opt.description}
            value={opt.value}
            checked={value === opt.value}
            disabled={opt.disabled}
            size={size}
            onChange={() => onChange(opt.value)}
          />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Switch — Toggle switch
 */
export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  description?: string;
  size?: 'sm' | 'base' | 'lg';
}

// Track is the OUTER box; with border-2 + border-box, content = w-4 × h-4.
// Thumb travels by transform alone: translateX = w - 4 - thumb lands it flush
// against the inner right border (left edge = w - 2 - thumb).
const switchSizeStyles = {
  sm: { w: 34, h: 20, thumb: 14, gap: '8px', labelSize: '13px' },
  base: { w: 44, h: 24, thumb: 18, gap: '10px', labelSize: '14px' },
  lg: { w: 52, h: 28, thumb: 22, gap: '12px', labelSize: '15px' },
};

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ label, description, size = 'base', className = '', style, disabled, checked, onChange, id, ...props }, ref) => {
    const s = switchSizeStyles[size];
    const inputId = id ?? `switch-${Math.random().toString(36).slice(2, 9)}`;

    return (
      <label
        className={['inline-flex items-center cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed', className].filter(Boolean).join(' ')}
        style={{ gap: s.gap, ...style }}
      >
        <div className="relative flex-shrink-0" style={{ width: s.w, height: s.h }}>
          <input
            ref={ref}
            type="checkbox"
            id={inputId}
            role="switch"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
            {...props}
          />
          <div
            className={[
              'absolute inset-0 rounded-full border-2 flex items-center',
              'transition-colors duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-brand)]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kts-brand-primary)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--kts-bg-primary)]',
              checked && 'bg-[var(--kts-brand-primary)] border-[var(--kts-brand-primary)]',
              !checked && 'bg-transparent border-[var(--kts-border-default)]',
              disabled && 'opacity-50 cursor-not-allowed',
            ].filter(Boolean).join(' ')}
            style={{ width: s.w, height: s.h }}
            aria-hidden="true"
          >
            <div
              className="rounded-full bg-white shadow-sm transition-transform duration-[var(--kts-motion-fast)] ease-[var(--kts-easing-brand)]"
              style={{
                width: s.thumb,
                height: s.thumb,
                transform: checked ? `translateX(${s.w - 4 - s.thumb}px)` : 'translateX(0)',
              }}
            />
          </div>
        </div>
        {(label || description) && (
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            {label && (
              <span
                className="font-medium truncate"
                style={{ fontSize: s.labelSize, color: 'var(--kts-text-primary)', fontFamily: 'var(--kts-font-sans)' }}
              >
                {label}
              </span>
            )}
            {description && (
              <span className="truncate" style={{ fontSize: 'var(--kts-font-size-xs)', color: 'var(--kts-text-tertiary)' }}>
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Switch.displayName = 'Switch';