import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Shell theme token consistency (audit item 13).
 *
 * `src/styles/globals.css` declares the `--kts-*` design tokens and its header
 * states they are generated from `src/styles/design-tokens.ts` (the single
 * source of truth). Every semantic token (`--kts-bg-*`, `--kts-text-*`,
 * `--kts-border-*`, `--kts-status-*`, `--kts-brand-*`, `--kts-interactive-*`)
 * must reference another `--kts-*` token via `var(--kts-...)`, never a hardcoded
 * color value (hex / rgb / rgba). Hardcoded values drift out of sync with
 * `design-tokens.ts` and break the shell's theme consistency.
 */
const css = readFileSync('src/styles/globals.css', { encoding: 'utf8' });

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Returns the declared value of a `--kts-*` custom property, or null. */
function declaration(token: string): string | null {
  const match = css.match(
    new RegExp(`${escapeRegExp(token)}\\s*:\\s*([^;]+);`)
  );
  return match ? match[1].trim() : null;
}

/** Semantic tokens that must always be `var(--kts-...)` references. */
const semanticTokens = [
  // Backgrounds
  '--kts-bg-primary',
  '--kts-bg-secondary',
  '--kts-bg-tertiary',
  '--kts-bg-inverse',
  // Text
  '--kts-text-primary',
  '--kts-text-secondary',
  '--kts-text-tertiary',
  '--kts-text-inverse',
  '--kts-text-link',
  '--kts-text-link-hover',
  // Borders
  '--kts-border-default',
  '--kts-border-strong',
  '--kts-border-focus',
  '--kts-border-error',
  '--kts-border-warning',
  '--kts-border-success',
  // Status
  '--kts-status-running',
  '--kts-status-running-bg',
  '--kts-status-stopped',
  '--kts-status-stopped-bg',
  '--kts-status-error',
  '--kts-status-error-bg',
  '--kts-status-warning',
  '--kts-status-warning-bg',
  '--kts-status-pending',
  '--kts-status-pending-bg',
  // Brand
  '--kts-brand-primary',
  '--kts-brand-primary-hover',
  '--kts-brand-primary-bg',
  '--kts-brand-secondary',
  '--kts-brand-secondary-hover',
  '--kts-brand-secondary-bg',
  // Interactive
  '--kts-interactive-hover',
  '--kts-interactive-active',
  '--kts-interactive-focus',
  '--kts-interactive-disabled',
];

describe('shell theme token consistency (globals.css)', () => {
  it.each(semanticTokens)(
    'declares %s as a var(--kts-...) token reference',
    (token) => {
      const value = declaration(token);
      expect(value, `${token} must be declared in globals.css`).not.toBeNull();
      expect(value).toMatch(/^var\(--kts-/);
    }
  );

  it('contains no hardcoded color values (hex / rgb / rgba) in semantic token declarations', () => {
    for (const token of semanticTokens) {
      const value = declaration(token);
      expect(value, `${token} must be declared`).not.toBeNull();
      expect(value).not.toMatch(/#/);
      expect(value).not.toMatch(/rgba?\s*\(/);
    }
  });
});
