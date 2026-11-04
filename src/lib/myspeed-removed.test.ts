import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import * as fleetApi from './fleet-api';
import { PAGES, pageDef } from './serviceRegistry';
import type { PageId } from './serviceRegistry';

/**
 * A1 removal regression: every MySpeed artifact is gone from the frontend.
 *
 * RED while MySpeed is still present (exports exist, the page is registered,
 * the component files exist). GREEN once A1 is complete.
 */
describe('MySpeed removed (A1)', () => {
  const root = process.cwd();

  it('fleet-api does not export getMySpeedSummary', () => {
    expect((fleetApi as Record<string, unknown>).getMySpeedSummary).toBeUndefined();
  });

  it('fleet-api does not export getMySpeedTests', () => {
    expect((fleetApi as Record<string, unknown>).getMySpeedTests).toBeUndefined();
  });

  it('fleet-api does not export getMySpeedServers', () => {
    expect((fleetApi as Record<string, unknown>).getMySpeedServers).toBeUndefined();
  });

  it('service registry has no myspeed page', () => {
    expect(PAGES.some((p) => p.id === ('myspeed' as string))).toBe(false);
  });

  it('pageDef("myspeed") throws Unknown page', () => {
    expect(() => pageDef('myspeed' as unknown as PageId)).toThrow(/Unknown page/);
  });

  it('MySpeedPage component file is deleted', () => {
    expect(existsSync(join(root, 'src/components/myspeed/MySpeedPage.tsx'))).toBe(false);
  });

  it('MySpeedPage test file is deleted', () => {
    expect(existsSync(join(root, 'src/components/myspeed/MySpeedPage.test.tsx'))).toBe(false);
  });

  it('myspeed directory is deleted', () => {
    expect(existsSync(join(root, 'src/components/myspeed'))).toBe(false);
  });
});
