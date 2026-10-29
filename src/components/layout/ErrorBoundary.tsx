import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Shell ErrorBoundary — wraps routed page content so the sidebar and top bar
 * stay visible when a page crashes. Renders a flat panel with the error
 * message and a "Reload page" button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(_props: ErrorBoundaryProps, state: ErrorBoundaryState): ErrorBoundaryState {
    return state;
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Shell ErrorBoundary] caught error:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      const fallbackContent = fallback ? fallback(error!, this.reset) : (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-6">
          <div className="w-12 h-12 rounded-[var(--kts-radius-lg)] bg-[var(--kts-status-error-bg)] flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3 className="font-[var(--kts-font-heading)] font-semibold text-[var(--kts-text-primary)] mb-2" style={{ fontSize: 'var(--kts-font-size-xl)' }}>
            Something went wrong on this page
          </h3>
          <p className="text-[var(--kts-text-secondary)] mb-6 max-w-sm" style={{ fontSize: 'var(--kts-font-size-sm)' }}>
            {error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button
            onClick={this.reset}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-[var(--kts-radius-base)] border border-[var(--kts-border-default)] bg-transparent text-[var(--kts-text-primary)] hover:bg-[var(--kts-interactive-hover)] transition-colors font-[var(--kts-font-sans)] text-[var(--kts-font-size-sm)]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 4v6h-6" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
            </svg>
            <span>Reload page</span>
          </button>
        </div>
      );

      return (
        <div className="flex-1 min-w-0 p-6">
          {fallbackContent}
        </div>
      );
    }

    return children;
  }
}
