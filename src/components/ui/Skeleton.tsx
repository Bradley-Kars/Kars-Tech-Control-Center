/**
 * Skeleton — Loading placeholder with shimmer animation
 */
export interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular' | 'card' | 'gauge' | 'table-row';
  width?: string | number;
  height?: string | number;
  lines?: number; // For text variant
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({
  variant = 'text',
  width = '100%',
  height,
  lines = 3,
  className = '',
  style,
}: SkeletonProps) {
  const baseStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, var(--kts-bg-tertiary) 25%, var(--kts-interactive-hover) 50%, var(--kts-bg-tertiary) 75%)',
    backgroundSize: '200% 100%',
    animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
    borderRadius: 'var(--kts-radius-base)',
    ...style,
  };

  const variants: Record<string, React.CSSProperties> = {
    text: { borderRadius: 'var(--kts-radius-sm)' },
    circular: { borderRadius: '50%' },
    rectangular: { borderRadius: 'var(--kts-radius-md)' },
    card: { borderRadius: 'var(--kts-radius-md)' },
    gauge: { borderRadius: '50%' },
    'table-row': { borderRadius: 0 },
  };

  if (variant === 'text') {
    return (
      <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--kts-space-2)', width, ...style }}>
        {Array.from({ length: lines }, (_, i) => (
          <div
            key={i}
            style={{
              ...baseStyle,
              ...variants.text,
              height: height || '1rem',
              width: i === lines - 1 ? '60%' : '100%',
            }}
          />
        ))}
      </div>
    );
  }

  if (variant === 'card') {
    const cardWidth = typeof width === 'number' ? `${width}px` : width;
    const cardHeight = height || '200px';
    return (
      <div
        className={className}
        style={{
          width: cardWidth,
          height: cardHeight,
          background: 'var(--kts-bg-secondary)',
          border: '1px solid var(--kts-border-default)',
          borderRadius: 'var(--kts-radius-md)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Accent bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, var(--kts-brand-primary), transparent)',
          }}
        />
        <div style={{ padding: 'var(--kts-space-5)', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--kts-space-4)' }}>
          <Skeleton variant="text" lines={1} width="40%" height="1.25rem" />
          <Skeleton variant="rectangular" width="100%" height="100%" />
        </div>
      </div>
    );
  }

  if (variant === 'gauge') {
    const dim = typeof width === 'number' ? width : 80;
    return (
      <div className={className} style={{ width: dim, height: dim, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--kts-space-2)' }}>
        <div
          style={{
            ...baseStyle,
            ...variants.gauge,
            width: dim,
            height: dim,
          }}
        />
        <Skeleton variant="text" lines={1} width="50%" height="0.75rem" />
      </div>
    );
  }

  if (variant === 'table-row') {
    return (
      <div className={className} style={{ display: 'flex', gap: 'var(--kts-space-4)', padding: 'var(--kts-space-3) var(--kts-space-4)', width }}>
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            style={{
              ...baseStyle,
              ...variants['table-row'],
              height: '1rem',
              width: i === 0 ? '30%' : '15%',
              flex: 1,
            }}
          />
        ))}
      </div>
    );
  }

  // Default: rectangular or circular
  return (
    <div
      className={className}
      style={{
        ...baseStyle,
        ...variants[variant],
        width,
        height: height || '1rem',
      }}
    />
  );
}

/**
 * SkeletonCard — Full card skeleton with accent bar
 */
export interface SkeletonCardProps {
  titleLines?: number;
  contentHeight?: string | number;
  className?: string;
}

export function SkeletonCard({ titleLines = 1, contentHeight = '120px', className = '' }: SkeletonCardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--kts-bg-secondary)',
        border: '1px solid var(--kts-border-default)',
        borderRadius: 'var(--kts-radius-md)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'linear-gradient(90deg, var(--kts-brand-primary), transparent)',
        }}
      />
      <div style={{ padding: 'var(--kts-space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--kts-space-4)' }}>
        <Skeleton variant="text" lines={titleLines} width="35%" height="1.25rem" />
        <Skeleton variant="rectangular" width="100%" height={contentHeight} />
      </div>
    </div>
  );
}

/**
 * SkeletonGaugeGroup — Row of gauge skeletons
 */
export function SkeletonGaugeGroup({ count = 4, size = 'base' as const, className = '' }) {
  const sizeMap = { xs: 40, sm: 64, base: 80, lg: 100, xl: 128 };
  const dim = sizeMap[size];

  return (
    <div className={['flex items-start justify-center gap-6 flex-wrap', className].filter(Boolean).join(' ')}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} variant="gauge" width={dim} height={dim} />
      ))}
    </div>
  );
}

/**
 * SkeletonTable — Table skeleton with header and rows
 */
export interface SkeletonTableProps {
  columns?: number;
  rows?: number;
  className?: string;
}

export function SkeletonTable({ columns = 5, rows = 5, className = '' }: SkeletonTableProps) {
  return (
    <div className={className} style={{ width: '100%' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 'var(--kts-space-4)', padding: 'var(--kts-space-3) var(--kts-space-4)', borderBottom: '1px solid var(--kts-border-default)' }}>
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} variant="text" width="60%" height="0.75rem" />
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} variant="table-row" />
        ))}
      </div>
    </div>
  );
}

// Keyframes for shimmer animation (inject once globally)
if (typeof document !== 'undefined' && !document.getElementById('kts-skeleton-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-skeleton-keyframes';
  style.textContent = `
    @keyframes skeleton-shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `;
  document.head.appendChild(style);
}