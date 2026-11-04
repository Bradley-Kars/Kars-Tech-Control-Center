import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('renders children', () => {
    const { container } = render(
      <ErrorBoundary>
        <div>test content</div>
      </ErrorBoundary>
    );
    expect(container).toBeInTheDocument();
    expect(screen.getByText('test content')).toBeInTheDocument();
  });
});
