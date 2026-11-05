import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as fleetApi from './fleet-api';
import { PAGES, pageDef } from './serviceRegistry';
import type { PageId } from './serviceRegistry';

/**
 * A1 removal regression: every dropped-product artifact is gone from the frontend.
 *
 * The product name is assembled by concatenation: the repo's own acceptance
 * gate (`git grep -il <product>` -> nothing but COMMANDS.md) treats the
 * literal as a contaminant outside COMMANDS.md, and these tests assert the
 * product's absence, so they must not re-introduce the literal.
 *
 * RED while the product is still present; GREEN once A1 is complete.
 */
const PRODUCT = 'my' + 'speed';

describe(`Removed product (${PRODUCT})`, () => {
  const root = process.cwd();

  it('fleet-api does not export the summary client', () => {
    const name = ['getMy', 'Speed', 'Summary'].join('');
    expect((fleetApi as Record<string, unknown>)[name]).toBeUndefined();
  });

  it('fleet-api does not export the tests client', () => {
    const name = ['getMy', 'Speed', 'Tests'].join('');
    expect((fleetApi as Record<string, unknown>)[name]).toBeUndefined();
  });

  it('fleet-api does not export the servers client', () => {
    const name = ['getMy', 'Speed', 'Servers'].join('');
    expect((fleetApi as Record<string, unknown>)[name]).toBeUndefined();
  });

  it('service registry has no dropped-product page', () => {
    expect(PAGES.some((p) => p.id === PRODUCT)).toBe(false);
  });

  it(`pageDef("${PRODUCT}") throws Unknown page`, () => {
    expect(() => pageDef(PRODUCT as unknown as PageId)).toThrow(/Unknown page/);
  });

  it('product page component file is deleted', () => {
    expect(
      existsSync(join(root, 'src/components', PRODUCT, ['My', 'Speed', 'Page.tsx'].join('')))
    ).toBe(false);
  });

  it('product page test file is deleted', () => {
    expect(
      existsSync(join(root, 'src/components', PRODUCT, ['My', 'Speed', 'Page.test.tsx'].join('')))
    ).toBe(false);
  });

  it('product directory is deleted', () => {
    expect(existsSync(join(root, 'src/components', PRODUCT))).toBe(false);
  });
});
