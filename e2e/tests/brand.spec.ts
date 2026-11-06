import { test, expect } from '@playwright/test';
import { mockFleetBackend } from '../utils/mock-backend';

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
];

function hasDaylightBetween(
  a: { x: number; width: number },
  b: { x: number; width: number },
): boolean {
  return b.x > a.x + a.width || a.x > b.x + b.width;
}

test.describe('Sidebar brand block (U3)', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`at ${vp.name} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      test('expanded header: logo and title boxes do not intersect, nothing clipped', async ({
        page,
      }) => {
        const errors: string[] = [];
        page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
        page.on('pageerror', (e) => errors.push(e.message));

        await mockFleetBackend(page);
        // Ticketing lists tickets on mount; stub it so no 401 noise reaches the console.
        await page.route('**/api/tickets*', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ count: 0, tickets: [] }),
          });
        });
        await page.goto('/');
        if (vp.width < 640) {
          // Mobile: sidebar is a closed drawer; open it to reveal the brand header.
          await page.getByRole('button', { name: 'Open navigation menu' }).click();
        // Let the drawer slide transition (180ms) settle before measuring boxes.
        await page.waitForTimeout(300);
        }

        const aside = page.locator('aside');
        const logo = aside.locator('img[alt="KTS Master Control logo"]');
        const title = aside.getByText('Master Control');
        const toggle = aside.getByRole('button', { name: 'Collapse sidebar' });

        await expect(logo).toBeVisible();
        await expect(title).toBeVisible();
        await expect(toggle).toBeVisible();

        const sidebarBox = await aside.boundingBox();
        const logoBox = await logo.boundingBox();
        const titleBox = await title.boundingBox();
        const toggleBox = await toggle.boundingBox();
        expect(sidebarBox).not.toBeNull();
        expect(logoBox).not.toBeNull();
        expect(titleBox).not.toBeNull();
        expect(toggleBox).not.toBeNull();

        // The logo box and the title box must not intersect — require daylight,
        // not just edge contact.
        expect(hasDaylightBetween(logoBox!, titleBox!)).toBe(true);

        // No header element may be clipped by the sidebar rail.
        const right = sidebarBox!.x + sidebarBox!.width;
        for (const box of [logoBox, titleBox, toggleBox]) {
          expect(box!.x).toBeGreaterThanOrEqual(sidebarBox!.x - 1);
          expect(box!.x + box!.width).toBeLessThanOrEqual(right + 1);
        }

        expect(errors).toEqual([]);
      });

      if (vp.width >= 640) {
        test('collapsed rail: logo and toggle fit without clipping or intersection', async ({
          page,
        }) => {
          const errors: string[] = [];
          page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
          page.on('pageerror', (e) => errors.push(e.message));

          await mockFleetBackend(page);
          await page.route('**/api/tickets*', async (route) => {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ count: 0, tickets: [] }),
            });
          });
          await page.goto('/');

          const aside = page.locator('aside');
          await aside.getByRole('button', { name: 'Collapse sidebar' }).click();
          // Let the rail width transition (180ms) settle before measuring boxes.
          await page.waitForTimeout(300);
          const logo = aside.locator('img[alt="KTS Master Control logo"]');
          const toggle = aside.getByRole('button', { name: 'Expand sidebar' });

          await expect(logo).toBeVisible();
          await expect(toggle).toBeVisible();

          const sidebarBox = await aside.boundingBox();
          const logoBox = await logo.boundingBox();
          const toggleBox = await toggle.boundingBox();
          expect(sidebarBox).not.toBeNull();
          expect(logoBox).not.toBeNull();
          expect(toggleBox).not.toBeNull();

          // Logo and toggle boxes must not intersect.
          expect(hasDaylightBetween(logoBox!, toggleBox!)).toBe(true);

          // Neither may be clipped by the 56px rail.
          const right = sidebarBox!.x + sidebarBox!.width;
          for (const box of [logoBox, toggleBox]) {
            expect(box!.x).toBeGreaterThanOrEqual(sidebarBox!.x - 1);
            expect(box!.x + box!.width).toBeLessThanOrEqual(right + 1);
          }

          expect(errors).toEqual([]);
        });
      }
    });
  }
});
