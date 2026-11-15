import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from './Label';

describe('Label', () => {
  it('renders its children as a label element bound to htmlFor', () => {
    render(<Label htmlFor="ticket-title">Title</Label>);
    const label = screen.getByText('Title');
    expect(label.tagName).toBe('LABEL');
    expect((label as HTMLLabelElement).htmlFor).toBe('ticket-title');
  });

  it('forwards className and extra props to the label element', () => {
    render(<Label htmlFor="x" className="custom-label" data-testid="my-label">X</Label>);
    const label = screen.getByTestId('my-label');
    expect(label).toHaveClass('custom-label');
    expect(label.tagName).toBe('LABEL');
  });
});
