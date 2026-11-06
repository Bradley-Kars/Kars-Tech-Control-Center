import { describe, it, expect } from 'vitest';
import { tokens, semanticColors } from './design-tokens';

/**
 * U4: Contrast.
 *
 * WCAG AA: 4.5:1 for normal text, 3:1 for large text.
 *
 * Checks every foreground/background token pair used for body text, muted
 * text, placeholder text, and input text against the background they are
 * actually painted on. Any rgba token is composited over its background
 * before the ratio is computed, so a transparent token on the dark theme
 * (the current bug) fails here loudly.
 *
 * Red before the fix: --kts-text-tertiary (--kts-color-line =
 * rgba(139, 157, 179, 0.16)) paints at roughly 1.3:1 on both the page
 * background and the input background. Green after the fix.
 */

type Rgba = { r: number; g: number; b: number; a: number };

function parseColor(value: string): Rgba {
  const m = value.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/,
  );
  if (m) {
    return {
      r: Number(m[1]),
      g: Number(m[2]),
      b: Number(m[3]),
      a: m[4] === undefined ? 1 : Number(m[4]),
    };
  }
  let hex = value.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
    a: 1,
  };
}

/** Composite `fg` over `bg` (both 0-255, alpha 0-1). */
function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(c: Rgba): number {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

function contrast(fg: Rgba, bg: Rgba): number {
  const painted = composite(fg, bg);
  const l1 = luminance(painted);
  const l2 = luminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

interface Pair {
  name: string;
  fg: string;
  bg: string;
  /** Large text (>= 18.5px bold or >= 24px regular) only needs 3:1. */
  large: boolean;
}

const pairs: Pair[] = [
  { name: 'body text on page background', fg: semanticColors.text.primary, bg: semanticColors.bg.primary, large: false },
  { name: 'muted text on page background', fg: semanticColors.text.secondary, bg: semanticColors.bg.primary, large: false },
  { name: 'tertiary text on page background', fg: semanticColors.text.tertiary, bg: semanticColors.bg.primary, large: false },
  { name: 'input text on input background', fg: semanticColors.text.primary, bg: semanticColors.bg.tertiary, large: false },
  { name: 'placeholder text on input background', fg: semanticColors.text.tertiary, bg: semanticColors.bg.tertiary, large: false },
  { name: 'muted text on input background', fg: semanticColors.text.secondary, bg: semanticColors.bg.tertiary, large: false },
];

const MIN_NORMAL = 4.5;
const MIN_LARGE = 3;

describe('U4 design token contrast (WCAG AA)', () => {
  it.each(pairs)('contrast of %s is at least %s:1', (pair) => {
    const ratio = contrast(parseColor(pair.fg), parseColor(pair.bg));
    const minimum = pair.large ? MIN_LARGE : MIN_NORMAL;
    // eslint-disable-next-line no-console
    console.log(`${pair.name}: ${ratio.toFixed(2)}:1 (min ${minimum}:1)`);
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });
});

/** Sanity: the token file exposes the colors the test resolves. */
it('references real token values', () => {
  expect(tokens.color.line).toBeDefined();
  expect(typeof semanticColors.text.primary).toBe('string');
  expect(typeof semanticColors.bg.primary).toBe('string');
  expect(typeof semanticColors.bg.tertiary).toBe('string');
});
