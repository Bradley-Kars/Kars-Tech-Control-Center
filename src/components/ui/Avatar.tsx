import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  name?: string;
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  shape?: 'circle' | 'square';
  status?: 'online' | 'offline' | 'busy' | 'away';
  statusPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  fallback?: ReactNode;
  fontClass?: string;
  fontSize?: string;
}

const sizeStyles = {
  xs: { size: '24px', fontSize: '10px', statusSize: '8px' },
  sm: { size: '32px', fontSize: '12px', statusSize: '9px' },
  base: { size: '40px', fontSize: '14px', statusSize: '10px' },
  lg: { size: '48px', fontSize: '16px', statusSize: '11px' },
  xl: { size: '64px', fontSize: '20px', statusSize: '14px' },
  '2xl': { size: '96px', fontSize: '28px', statusSize: '18px' },
};

const statusColors = {
  online: 'var(--kts-status-running)',
  offline: 'var(--kts-text-tertiary)',
  busy: 'var(--kts-status-error)',
  away: 'var(--kts-status-warning)',
  warning: 'var(--kts-status-warning)',
  error: 'var(--kts-status-error)',
};

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColorFromName(name: string): string {
  const colors = [
    'var(--kts-brand-primary)',
    'var(--kts-brand-secondary)',
    'var(--kts-status-running)',
    'var(--kts-status-pending)',
    'var(--kts-status-warning)',
    'var(--kts-status-error)',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  ({ src, alt, name, size = 'base', shape = 'circle', status, statusPosition = 'bottom-right', fallback, className = '', style, fontClass, fontSize, ...props }, ref) => {
    const s = sizeStyles[size];
    const borderRadius = shape === 'circle' ? '50%' : 'var(--kts-radius-base)';
    const statusColor = status ? statusColors[status] : undefined;

    const statusPositions: Record<string, React.CSSProperties> = {
      'bottom-right': { bottom: '-2px', right: '-2px' },
      'bottom-left': { bottom: '-2px', left: '-2px' },
      'top-right': { top: '-2px', right: '-2px' },
      'top-left': { top: '-2px', left: '-2px' },
    };

    const fallbackContent = fallback ?? (name ? (
      <span
        className={[
          'font-[var(--kts-font-sans)] font-semibold text-white',
          fontClass,
        ].filter(Boolean).join(' ')}
        style={{ fontSize: fontSize ?? s.fontSize, lineHeight: 1 }}
      >
        {getInitials(name)}
      </span>
) : (
      <svg width={parseInt(s.size) * 0.5} height={parseInt(s.size) * 0.5} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ));

    return (
      <div
        ref={ref}
        className={['avatar inline-flex', className].filter(Boolean).join(' ')}
        style={{
          width: s.size,
          height: s.size,
          borderRadius,
          background: src ? 'transparent' : getColorFromName(name || ''),
          overflow: src ? 'hidden' : 'visible',
          position: 'relative',
          flexShrink: 0,
          ...style,
        }}
        {...props}
      >
        {src ? (
          <img
            src={src}
            alt={alt || name || 'Avatar'}
            className="w-full h-full object-cover"
            style={{ borderRadius }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ borderRadius }}>
            {fallbackContent}
          </div>
        )}
        {status && (
          <span
            className="absolute rounded-full border-2 border-[var(--kts-bg-primary)]"
            style={{
              width: s.statusSize,
              height: s.statusSize,
              background: statusColor,
              ...statusPositions[statusPosition],
            }}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    );
  }
);

Avatar.displayName = 'Avatar';

/**
 * AvatarGroup — Stacked avatars with overlap
 */
export interface AvatarGroupProps {
  avatars: Array<{ src?: string; name?: string; alt?: string }>;
  max?: number;
  size?: AvatarProps['size'];
  shape?: AvatarProps['shape'];
  className?: string;
}

export function AvatarGroup({ avatars, max = 5, size = 'base', shape = 'circle', className = '' }: AvatarGroupProps) {
  const s = sizeStyles[size];
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={['avatar-group flex items-center', className].filter(Boolean).join(' ')}>
      <div className="flex -space-x-2" style={{ marginLeft: 0 }}>
        {visible.map((avatar, i) => (
          <Avatar
            key={`${avatar.src}-${avatar.name}-${i}`}
            src={avatar.src}
            name={avatar.name}
            alt={avatar.alt}
            size={size}
            shape={shape}
            style={{ zIndex: visible.length - i, border: '2px solid var(--kts-bg-primary)' }}
          />
        ))}
        {remaining > 0 && (
          <div
            className="flex items-center justify-center font-[var(--kts-font-mono)] font-medium"
            style={{
              width: s.size,
              height: s.size,
              borderRadius: shape === 'circle' ? '50%' : 'var(--kts-radius-base)',
              background: 'var(--kts-bg-tertiary)',
              color: 'var(--kts-text-secondary)',
              fontSize: s.fontSize,
              border: '2px solid var(--kts-bg-primary)',
              zIndex: 0,
            }}
          >
            +{remaining}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * DeviceAvatar — Specialized avatar for device types
 */
export type DeviceType = 'unraid' | 'phone' | 'handheld' | 'laptop' | 'desktop' | 'server' | 'router' | 'nas';

export interface DeviceAvatarProps {
  type: DeviceType;
  name?: string;
  status?: 'online' | 'offline' | 'warning' | 'error';
  size?: AvatarProps['size'];
  className?: string;
}

const deviceIcons: Record<DeviceType, ReactNode> = {
  unraid: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  ),
  phone: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  handheld: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="7" cy="12" r="1" />
      <circle cx="17" cy="12" r="1" />
    </svg>
  ),
  laptop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
    </svg>
  ),
  desktop: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  ),
  server: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="6" y1="17" x2="6.01" y2="17" />
      <line x1="10" y1="17" x2="10.01" y2="17" />
      <line x1="14" y1="17" x2="14.01" y2="17" />
      <line x1="18" y1="17" x2="18.01" y2="17" />
    </svg>
  ),
  router: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  ),
  nas: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M6 17h12" />
      <path d="M10 13v4" />
    </svg>
  ),
};

const deviceColors: Record<DeviceType, string> = {
  unraid: 'var(--kts-brand-primary)',
  phone: 'var(--kts-brand-secondary)',
  handheld: '#8B5CF6',
  laptop: '#06B6D4',
  desktop: 'var(--kts-brand-primary)',
  server: '#22C55E',
  router: '#F97316',
  nas: '#84CC16',
};

export function DeviceAvatar({ type, name, status, size = 'base', className = '' }: DeviceAvatarProps) {
  const s = sizeStyles[size];
  const statusColor = status ? statusColors[status] : undefined;

  return (
    <div
      className={['device-avatar inline-flex', className].filter(Boolean).join(' ')}
      style={{
        width: s.size,
        height: s.size,
        borderRadius: 'var(--kts-radius-base)',
        background: deviceColors[type],
        overflow: 'visible',
        position: 'relative',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span style={{ color: 'white', opacity: 0.9 }}>{deviceIcons[type]}</span>
      {status && (
        <span
          className="absolute bottom-0 right-0 rounded-full border-2 border-[var(--kts-bg-primary)]"
          style={{
            width: s.statusSize,
            height: s.statusSize,
            background: statusColor,
            bottom: '-2px',
            right: '-2px',
          }}
          aria-label={`Status: ${status}`}
        />
      )}
      {name && (
        <span
          className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[10px] rounded-[var(--kts-radius-sm)] opacity-0 transition-opacity duration-[var(--kts-motion-fast)] pointer-events-none"
          style={{
            background: 'var(--kts-bg-tertiary)',
            color: 'var(--kts-text-primary)',
            border: '1px solid var(--kts-border-default)',
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}

