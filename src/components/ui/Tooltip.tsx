import { useEffect, useRef, useState, isValidElement, cloneElement, type ReactNode, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end' | 'left-start' | 'left-end' | 'right-start' | 'right-end';

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode; // Must be a single element
  position?: TooltipPosition;
  delay?: number; // ms before show
  hideDelay?: number; // ms before hide
  offset?: number; // px from target
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}

const positionMap: Record<TooltipPosition, { origin: string; target: string; transform: string }> = {
  top: { origin: 'bottom', target: 'top', transform: 'translateX(-50%) translateY(-8px)' },
  bottom: { origin: 'top', target: 'bottom', transform: 'translateX(-50%) translateY(8px)' },
  left: { origin: 'right', target: 'left', transform: 'translateX(-8px) translateY(-50%)' },
  right: { origin: 'left', target: 'right', transform: 'translateX(8px) translateY(-50%)' },
  'top-start': { origin: 'bottom', target: 'top', transform: 'translateX(0) translateY(-8px)' },
  'top-end': { origin: 'bottom', target: 'top', transform: 'translateX(-100%) translateY(-8px)' },
  'bottom-start': { origin: 'top', target: 'bottom', transform: 'translateX(0) translateY(8px)' },
  'bottom-end': { origin: 'top', target: 'bottom', transform: 'translateX(-100%) translateY(8px)' },
  'left-start': { origin: 'right', target: 'left', transform: 'translateX(-8px) translateY(0)' },
  'left-end': { origin: 'right', target: 'left', transform: 'translateX(-8px) translateY(-100%)' },
  'right-start': { origin: 'left', target: 'right', transform: 'translateX(8px) translateY(0)' },
  'right-end': { origin: 'left', target: 'right', transform: 'translateX(8px) translateY(-100%)' },
};

export function Tooltip({
  content,
  children,
  position = 'top',
  delay = 200,
  hideDelay = 100,
  offset = 8,
  className = '',
  style,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isHoveringTooltip = useRef(false);

  const childElement = Array.isArray(children) ? children[0] : children;

  const show = () => {
    if (disabled) return;
    clearTimeout(hideTimer.current);
    showTimer.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  };

  const hide = () => {
    clearTimeout(showTimer.current);
    if (!isHoveringTooltip.current) {
      hideTimer.current = setTimeout(() => {
        setIsVisible(false);
      }, hideDelay);
    }
  };

  const handleMouseEnter = () => {
    isHoveringTooltip.current = true;
    clearTimeout(hideTimer.current);
    show();
  };

  const handleMouseLeave = () => {
    isHoveringTooltip.current = false;
    hide();
  };

  useEffect(() => {
    return () => {
      clearTimeout(showTimer.current);
      clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!isVisible || !triggerRef.current || !tooltipRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    let top = 0, left = 0;
    const pos = positionMap[position];

    // Calculate position
    switch (pos.origin) {
      case 'bottom':
        top = trigger.top - tooltip.height - offset;
        break;
      case 'top':
        top = trigger.bottom + offset;
        break;
      case 'right':
        left = trigger.left - tooltip.width - offset;
        break;
      case 'left':
        left = trigger.right + offset;
        break;
    }

    switch (pos.target) {
      case 'top':
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
        break;
      case 'bottom':
        left = trigger.left + trigger.width / 2 - tooltip.width / 2;
        break;
      case 'left':
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        break;
      case 'right':
        top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        break;
    }

    // Handle start/end variants
    if (position.includes('start')) {
      if (position.startsWith('top') || position.startsWith('bottom')) {
        left = trigger.left;
      } else {
        top = trigger.top;
      }
    } else if (position.includes('end')) {
      if (position.startsWith('top') || position.startsWith('bottom')) {
        left = trigger.right - tooltip.width;
      } else {
        top = trigger.bottom - tooltip.height;
      }
    }

    // Clamp to viewport
    const padding = 8;
    left = Math.max(padding, Math.min(left, viewport.width - tooltip.width - padding));
    top = Math.max(padding, Math.min(top, viewport.height - tooltip.height - padding));

    tooltipRef.current.style.top = `${top}px`;
    tooltipRef.current.style.left = `${left}px`;
  }, [isVisible, position, offset]);

  const tooltipContent = isVisible ? (
    <div
      ref={tooltipRef}
      className={['tooltip', className].filter(Boolean).join(' ')}
      style={{
        position: 'fixed',
        zIndex: 'var(--kts-z-tooltip)',
        pointerEvents: 'none',
        background: 'var(--kts-bg-tertiary)',
        border: '1px solid var(--kts-border-default)',
        borderRadius: 'var(--kts-radius-base)',
        padding: 'var(--kts-space-2) var(--kts-space-3)',
        fontSize: 'var(--kts-font-size-xs)',
        color: 'var(--kts-text-primary)',
        fontFamily: 'var(--kts-font-sans)',
        lineHeight: 'var(--kts-line-height-snug)',
        boxShadow: 'var(--kts-shadow-md)',
        maxWidth: '280px',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        animation: 'tooltip-fade-in 0.15s ease-out',
        ...style,
      }}
      onMouseEnter={() => { isHoveringTooltip.current = true; clearTimeout(hideTimer.current); }}
      onMouseLeave={() => { isHoveringTooltip.current = false; hide(); }}
      role="tooltip"
    >
      {content}
    </div>
  ) : null;

  const portalRoot = document.getElementById('tooltip-portal') ?? document.body;

  return (
    <>
      {isValidElement(childElement)
        ? cloneElement(childElement as ReactElement<any>, {
            onMouseEnter: handleMouseEnter,
            onMouseLeave: handleMouseLeave,
            onFocus: handleMouseEnter,
            onBlur: handleMouseLeave,
            ref: triggerRef,
          })
        : childElement}
      {createPortal(tooltipContent, portalRoot)}
    </>
  );
}

// Keyframes
if (typeof document !== 'undefined' && !document.getElementById('kts-tooltip-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-tooltip-keyframes';
  style.textContent = `
    @keyframes tooltip-fade-in {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}