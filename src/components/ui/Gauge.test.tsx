import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Gauge } from './Gauge';

describe('Gauge', () => {
  it('renders SVG at 1:1 scale with the circle centered (no half-scale ring)', () => {
    const { container } = render(<Gauge value={45} size="base" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 80 80');
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2);
    for (const c of circles) {
      expect(c.getAttribute('cx')).toBe('40');
      expect(c.getAttribute('cy')).toBe('40');
    }
  });

  it('keeps full font size when two-digit text already fits (lg + 45%)', () => {
    render(<Gauge value={45} size="lg" />);
    const span = screen.getByText('45%');
    expect(span.style.fontSize).toBe('20px');
  });

  it('keeps full font size for short text on the smallest gauge (xs + 0%)', () => {
    render(<Gauge value={0} size="xs" />);
    expect(screen.getByText('0%').style.fontSize).toBe('11px');
  });

  it('auto-shrinks text that would overflow a small ring (xs + 100%)', () => {
    render(<Gauge value={100} size="xs" />);
    const span = screen.getByText('100%');
    const px = parseFloat(span.style.fontSize);
    expect(px).toBeLessThan(11);
    expect(px).toBeGreaterThanOrEqual(8);
  });

  it('shows pulsing placeholder while loading', () => {
    render(<Gauge value={42} loading />);
    expect(screen.getByText('··')).toBeInTheDocument();
  });
});
