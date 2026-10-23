import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';
import { IconButton } from './Button';

export type ModalSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: ModalSize;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  footer?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const sizeStyles: Record<ModalSize, { maxWidth: string; width: string }> = {
  xs: { maxWidth: '320px', width: '100%' },
  sm: { maxWidth: '400px', width: '100%' },
  base: { maxWidth: '560px', width: '100%' },
  lg: { maxWidth: '720px', width: '100%' },
  xl: { maxWidth: '960px', width: '100%' },
  full: { maxWidth: '100%', width: '100%' },
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'base',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  footer,
  className = '',
  style,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    previousActiveElement.current = document.activeElement as HTMLElement;

    // Trap focus
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!closeOnEscape && e.key !== 'Tab') return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && contentRef.current) {
        const focusableElements = contentRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    // Focus first focusable element
    setTimeout(() => {
      const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }, 0);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActiveElement.current?.focus();
    };
  }, [isOpen, onClose, closeOnEscape]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOverlayClick = (e: MouseEvent) => {
      if (closeOnOverlayClick && e.target === overlayRef.current) {
        onClose();
      }
    };

    overlayRef.current?.addEventListener('click', handleOverlayClick);
    return () => overlayRef.current?.removeEventListener('click', handleOverlayClick);
  }, [isOpen, onClose, closeOnOverlayClick]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[var(--kts-z-modal)] flex items-center justify-center p-4"
      style={{
        background: 'var(--kts-color-ink-alpha-25)',
        backdropFilter: 'blur(4px)',
        animation: 'modal-overlay-fade-in 0.2s ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
      aria-describedby={description ? 'modal-description' : undefined}
    >
      <div
        ref={contentRef}
        className={['relative w-full overflow-hidden', className].filter(Boolean).join(' ')}
        style={{
          background: 'var(--kts-bg-secondary)',
          border: '1px solid var(--kts-border-default)',
          borderRadius: 'var(--kts-radius-xl)',
          boxShadow: 'var(--kts-shadow-xl)',
          maxWidth: sizeStyles[size].maxWidth,
          width: sizeStyles[size].width,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modal-content-slide-in 0.25s cubic-bezier(0.25, 1.5, 0.5, 1)',
          ...style,
        }}
      >
        {(title || showCloseButton) && (
          <div
            className="flex items-start justify-between gap-4"
            style={{
              padding: 'var(--kts-space-5) var(--kts-space-6)',
              borderBottom: '1px solid var(--kts-border-default)',
            }}
          >
            <div className="flex-1 min-w-0">
              {title && (
                <h2
                  id="modal-title"
                  className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)]"
                  style={{ fontSize: 'var(--kts-font-size-2xl)', letterSpacing: '-0.02em' }}
                >
                  {title}
                </h2>
              )}
              {description && (
                <p
                  id="modal-description"
                  className="mt-1 text-[var(--kts-text-secondary)]"
                  style={{ fontSize: 'var(--kts-font-size-sm)' }}
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="Close"
                onClick={onClose}
                style={{ marginTop: '-4px', marginRight: '-4px' }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </IconButton>
            )}
          </div>
        )}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: 'var(--kts-space-5) var(--kts-space-6)' }}
        >
          {children}
        </div>
        {footer && (
          <div
            className="flex items-center justify-end gap-3"
            style={{
              padding: 'var(--kts-space-4) var(--kts-space-6)',
              borderTop: '1px solid var(--kts-border-default)',
              background: 'var(--kts-bg-tertiary)',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  // Render to portal target (body by default)
  const portalRoot = document.getElementById('modal-portal') ?? document.body;
  return createPortal(modalContent, portalRoot);
}

// Keyframes for modal animations
if (typeof document !== 'undefined' && !document.getElementById('kts-modal-keyframes')) {
  const style = document.createElement('style');
  style.id = 'kts-modal-keyframes';
  style.textContent = `
    @keyframes modal-overlay-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes modal-content-slide-in {
      from { opacity: 0; transform: scale(0.95) translateY(8px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

/**
 * ConfirmDialog — Pre-built confirmation modal
 */
export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary' | 'amber';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button variant={variant} onClick={handleConfirm} loading={loading}>
          {confirmText}
        </Button>
      </>
    }>
      <p className="text-[var(--kts-text-secondary)]" style={{ fontSize: 'var(--kts-font-size-base)', lineHeight: 'var(--kts-line-height-normal)' }}>
        {message}
      </p>
    </Modal>
  );
}