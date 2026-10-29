import { type ReactNode } from 'react';

export type GaugeSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl';
export type GaugeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'brand';

export interface GaugeProps {
  value: number; // 0-100
  size?: GaugeSize;
  variant?: GaugeVariant;
  label?: string;
  subLabel?: string;
  showValue?: boolean;
  loading?: boolean;
  valueFormatter?: (value: number) => string;
  thickness?: number;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode; // For center content override
}

const sizeConfig: Record<GaugeSize, { dimension: number; radius: number; strokeWidth: number; fontSize: string; labelSize: string }> = {
  xs: { dimension: 40, radius: 14, strokeWidth: 3, fontSize: '11px', labelSize: '10px' },
  sm: { dimension: 64, radius: 24, strokeWidth: 4, fontSize: '13px', labelSize: '11px' },
  base: { dimension: 80, radius: 32, strokeWidth: 5, fontSize: '16px', labelSize: '12px' },
  lg: { dimension: 100, radius: 40, strokeWidth: 6, fontSize: '20px', labelSize: '13px' },
  xl: { dimension: 128, radius: 52, strokeWidth: 7, fontSize: '24px', labelSize: '14px' },
};

const variantColors: Record<GaugeVariant, { track: string; progress: string; glow: string }> = {
  default: { track: 'var(--kts-border-default)', progress: 'var(--kts-brand-primary)', glow: 'var(--kts-shadow-teal-glow)' },
  success: { track: 'rgba(34, 197, 94, 0.15)', progress: 'var(--kts-status-running)', glow: 'var(--kts-shadow-green-glow)' },
  warning: { track: 'rgba(245, 166, 35, 0.15)', progress: 'var(--kts-status-warning)', glow: 'var(--kts-shadow-amber-glow)' },
  danger: { track: 'rgba(239, 68, 68, 0.15)', progress: 'var(--kts-status-error)', glow: 'var(--kts-shadow-red-glow)' },
  info: { track: 'rgba(59, 130, 246, 0.15)', progress: 'var(--kts-status-pending)', glow: '0 8px 20px -6px rgba(59, 130, 246, 0.5)' },
  brand: { track: 'var(--kts-brand-primary-bg)', progress: 'var(--kts-brand-primary)', glow: 'var(--kts-shadow-teal-glow)' },
};

export function Gauge({
  value,
  size = 'base',
  variant = 'default',
  label,
  subLabel,
  showValue = true,
  loading = false,
  valueFormatter = (v) => `${Math.round(v)}%`,
  thickness,
  animated = true,
  className = '',
  style,
  children,
}: GaugeProps) {
  const config = sizeConfig[size];
  const colors = variantColors[variant];
  const radius = thickness ?? config.radius;
  const strokeWidth = thickness ?? config.strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const clampedValue = Math.max(0, Math.min(100, value));
  const offset = circumference - (clampedValue / 100) * circumference;
  // Fit text inside the ring: JetBrains Mono ≈ 0.62em per char.
  const rawText = loading ? '··' : valueFormatter(clampedValue);
  const innerDiameter = 2 * radius - strokeWidth;
  const maxTextWidth = Math.max(innerDiameter - 8, 8);
  const fittedFontSize = Math.max(
    10,
    Math.min(parseFloat(config.fontSize), maxTextWidth / Math.max(rawText.length * 0.62, 1))
  );

  return (
    <div
      className={['gauge', className].filter(Boolean).join(' ')}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--kts-space-2)',
        ...style,
      }}
    >
      <div className="relative" style={{ width: config.dimension, height: config.dimension }}>
        <svg
          width={config.dimension}
          height={config.dimension}
          className="-rotate-90"
          viewBox={`0 0 ${config.dimension} ${config.dimension}`}
          style={{ transformOrigin: 'center' }}
        >
          {/* Track */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            fill="none"
            stroke={colors.track}
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            cx={config.dimension / 2}
            cy={config.dimension / 2}
            r={radius}
            fill="none"
            stroke={colors.progress}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: animated ? 'stroke-dashoffset 0.8s cubic-bezier(0.25, 1.5, 0.5, 1)' : 'none',
              filter: clampedValue > 0 ? `drop-shadow(0 0 4px ${colors.progress})` : 'none',
            }}
          />
        </svg>
        {children ? (
          <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        ) : showValue && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span
              className={`font-[var(--kts-font-mono)] font-bold tabular-nums ${loading ? 'animate-pulse' : ''}`}
              style={{ fontSize: `${fittedFontSize}px`, color: loading ? 'var(--kts-text-tertiary)' : 'var(--kts-text-primary)' }}
            >
              {rawText}
            </span>
          </div>
        )}
      </div>
      {(label || subLabel) && (
        <div className="flex flex-col items-center gap-0.5 text-center">
          {label && (
            <span
              className="font-[var(--kts-font-mono)] uppercase tracking-[0.12em]"
              style={{ fontSize: config.labelSize, color: 'var(--kts-text-secondary)' }}
            >
              {label}
            </span>
          )}
          {subLabel && (
            <span style={{ fontSize: config.labelSize, color: 'var(--kts-text-tertiary)' }}>{subLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * GaugeGroup — Multiple gauges in a row with consistent spacing
 */
export interface GaugeGroupProps {
  gauges: Array<{
    value: number;
    label?: string;
    subLabel?: string;
    variant?: GaugeVariant;
    size?: GaugeSize;
    valueFormatter?: (value: number) => string;
  }>;
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function GaugeGroup({ gauges, gap = 'md', className = '' }: GaugeGroupProps) {
  const gapMap = { sm: 'var(--kts-space-3)', md: 'var(--kts-space-6)', lg: 'var(--kts-space-8)' };

  return (
    <div
      className={['flex items-start justify-center gap-[var(--kts-space-4)] flex-wrap', className].filter(Boolean).join(' ')}
      style={{ gap: gapMap[gap] }}
    >
      {gauges.map((g, i) => (
        <Gauge key={i} {...g} />
      ))}
    </div>
  );
}

/**
 * ArcGauge — Partial arc gauge (like a speedometer)
 */
export interface ArcGaugeProps {
  value: number; // 0-100
  size?: GaugeSize;
  variant?: GaugeVariant;
  label?: string;
  subLabel?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  minAngle?: number; // Degrees, default -120
  maxAngle?: number; // Degrees, default 120
  thickness?: number;
  animated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ArcGauge({
  value,
  size = 'base',
  variant = 'default',
  label,
  subLabel,
  showValue = true,
  valueFormatter = (v) => `${Math.round(v)}%`,
  minAngle = -120,
  maxAngle = 120,
  thickness,
  animated = true,
  className = '',
  style,
}: ArcGaugeProps) {
  const config = sizeConfig[size];
  const colors = variantColors[variant];
  const radius = thickness ?? config.radius;
  const strokeWidth = thickness ?? config.strokeWidth;
  const angleRange = maxAngle - minAngle;
  const clampedValue = Math.max(0, Math.min(100, value));
  const progressAngle = minAngle + (clampedValue / 100) * angleRange;
  const progressRadians = (progressAngle * Math.PI) / 180;
  const startRadians = (minAngle * Math.PI) / 180;
  const endRadians = (maxAngle * Math.PI) / 180;

  // Track path (full arc)
  const trackPath = `
    M ${config.dimension + radius * Math.cos(startRadians)} ${config.dimension + radius * Math.sin(startRadians)}
    A ${radius} ${radius} 0 0 1 ${config.dimension + radius * Math.cos(endRadians)} ${config.dimension + radius * Math.sin(endRadians)}
  `;

  // Progress path
  const progressPath = clampedValue > 0
    ? `
    M ${config.dimension + radius * Math.cos(startRadians)} ${config.dimension + radius * Math.sin(startRadians)}
    A ${radius} ${radius} 0 0 1 ${config.dimension + radius * Math.cos(progressRadians)} ${config.dimension + radius * Math.sin(progressRadians)}
  `
    : '';

  return (
    <div
      className={['gauge arc-gauge', className].filter(Boolean).join(' ')}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--kts-space-2)',
        ...style,
      }}
    >
      <div className="relative" style={{ width: config.dimension * 2, height: config.dimension * 1.2 }}>
        <svg width={config.dimension * 2} height={config.dimension * 2} viewBox={`0 0 ${config.dimension * 2} ${config.dimension * 2}`}>
          {/* Track */}
          <path
            d={trackPath.trim()}
            fill="none"
            stroke={colors.track}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress */}
          {clampedValue > 0 && (
            <path
              d={progressPath.trim()}
              fill="none"
              stroke={colors.progress}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                transition: animated ? 'stroke-dashoffset 0.8s cubic-bezier(0.25, 1.5, 0.5, 1)' : 'none',
                filter: `drop-shadow(0 0 4px ${colors.progress})`,
              }}
            />
          )}
        </svg>
        {showValue && (
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 pb-2 flex items-center justify-center">
            <span
              className="font-[var(--kts-font-mono)] font-bold tabular-nums"
              style={{ fontSize: config.fontSize, color: 'var(--kts-text-primary)' }}
            >
              {valueFormatter(clampedValue)}
            </span>
          </div>
        )}
      </div>
      {(label || subLabel) && (
        <div className="flex flex-col items-center gap-0.5 text-center">
          {label && (
            <span
              className="font-[var(--kts-font-mono)] uppercase tracking-[0.12em]"
              style={{ fontSize: config.labelSize, color: 'var(--kts-text-secondary)' }}
            >
              {label}
            </span>
          )}
          {subLabel && (
            <span style={{ fontSize: config.labelSize, color: 'var(--kts-text-tertiary)' }}>{subLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}