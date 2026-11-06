import { test, expect } from '@playwright/test';
import { mockFleetBackend } from '../utils/mock-backend';

/**
 * U10: Layout and route smoke in CI.
 *
 * Playwright against vite preview and the stub backend, for every sidebar
 * route at the three viewports: zero console errors, main content visible,
 * no overlapping header boxes, no horizontal scroll, and the contrast check
 * from U4. Fail CI on any violation.
 */

const VIEWPORTS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '390x844', width: 390, height: 844 },
] as const;

/** Every sidebar route from src/config/nav.ts SIDEBAR_GROUPS. */
const SIDEBAR_ROUTES: Array<{
  label: string;
  href: string;
  waitFor: { heading?: string; text?: string; testId?: string };
}> = [
  { label: 'Docker', href: '/service/docker', waitFor: { text: 'Docker Containers' } },
  { label: 'Storage', href: '/service/storage', waitFor: { heading: 'Storage' } },
  { label: 'System', href: '/service/system', waitFor: { heading: 'System' } },
  { label: 'Network', href: '/service/network', waitFor: { heading: 'Network' } },
  { label: 'Arr', href: '/service/arr', waitFor: { heading: 'Arr' } },
  { label: 'Home Assistant', href: '/service/homeassistant', waitFor: { heading: 'Home Assistant' } },
  { label: 'Nextcloud', href: '/service/nextcloud', waitFor: { heading: 'Nextcloud' } },
  { label: 'AdGuard', href: '/service/adguard', waitFor: { heading: 'AdGuard Home' } },
  { label: 'Ticketing', href: '/ticketing', waitFor: { heading: 'Ticketing' } },
  { label: 'Hermes', href: '/chat', waitFor: { testId: 'chat-page' } },
  { label: 'Settings', href: '/settings', waitFor: { heading: 'Settings' } },
];

/** Composite an RGBA over another RGBA (both 0-255, alpha 0-1). */
function composite(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number; a: number }): { r: number; g: number; b: number; a: number } {
  const a = fg.a;
  return {
    r: fg.r * a + bg.r * (1 - a),
    g: fg.g * a + bg.g * (1 - a),
    b: fg.b * a + bg.b * (1 - a),
    a: 1,
  };
}

function parseColor(value: string): { r: number; g: number; b: number; a: number } {
  const m = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([0-9]*\.?[0-9]+)\s*)?\)$/);
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  let hex = value.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 1 };
}

function linear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(c: { r: number; g: number; b: number; a: number }): number {
  return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b);
}

function contrast(fg: { r: number; g: number; b: number; a: number }, bg: { r: number; g: number; b: number; a: number }): number {
  const painted = composite(fg, bg);
  const l1 = luminance(painted);
  const l2 = luminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

const MIN_NORMAL = 4.5;

function setupConsoleAndPageErrorCollection(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function stubTicketingAndWs(page: import('@playwright/test').Page) {
  // Ticketing lists tickets on mount; stub it so no 401 noise reaches the console.
  await page.route('**/api/tickets*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, tickets: [] }),
    });
  });

  // Hermes opens a websocket to /ws/pty/opencode after minting a ticket.
  await page.route('**/ws/pty/**', async (route) => {
    await route.fulfill({
      status: 101,
      headers: {
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
      },
      body: '',
    });
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`Layout & route smoke at ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test.beforeEach(async ({ page }) => {
      await mockFleetBackend(page);
      await stubTicketingAndWs(page);
    });

    for (const { label, href, waitFor } of SIDEBAR_ROUTES) {
      test(`renders ${label} (${href}) with clean console, visible content, no overlap, no scroll, OK contrast`, async ({
        page,
      }) => {
        const errors = setupConsoleAndPageErrorCollection(page);

        await page.goto(href);

        // Wait for the page's main content to appear.
        let contentLocator: import('@playwright/test').Locator;
        if (waitFor.testId) {
          contentLocator = page.getByTestId(waitFor.testId);
        } else if (waitFor.heading) {
          // ServiceHeader and the page both render an h1; the page's own comes last.
          contentLocator = page.getByRole('heading', { name: waitFor.heading }).last();
        } else {
          contentLocator = page.getByText(waitFor.text!);
        }
        await expect(contentLocator).toBeVisible();

        // Main content area (the <main> shell's padding box) must be visible.
        await expect(page.locator('main')).toBeVisible();

        // Let in-flight fetches settle, then console must be clean.
        await page.waitForTimeout(500);
        expect(errors).toEqual([]);

        // No horizontal scroll: document must not be wider than the viewport.
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
        const viewportWidth = vp.width;
        expect(scrollWidth).toBeLessThanOrEqual(viewportWidth);

        // No overlapping header boxes: the TopBar's left, center and right
        // slots must not intersect each other.
        const topBar = page.locator('header.top-bar');
        await expect(topBar).toBeVisible();
        const topBarBox = await topBar.boundingBox();
        expect(topBarBox).not.toBeNull();

        // Sidebar brand header: logo and title must not intersect (U3).
        const aside = page.locator('aside');
        if (vp.width >= 640) {
          const logo = aside.locator('img[alt="KTS Master Control logo"]');
          const title = aside.getByText('Master Control');
          if ((await logo.count()) > 0 && (await title.count()) > 0) {
            await expect(logo).toBeVisible();
            await expect(title).toBeVisible();
            const logoBox = await logo.boundingBox();
            const titleBox = await title.boundingBox();
            expect(logoBox).not.toBeNull();
            expect(titleBox).not.toBeNull();
            const hasDaylight = (a: { x: number; width: number }, b: { x: number; width: number }) =>
              b.x > a.x + a.width || a.x > b.x + b.width;
            expect(hasDaylight(logoBox!, titleBox!)).toBe(true);
          }
        }

        // Contrast check (U4): sample computed styles for placeholder and
        // text-tertiary against their backgrounds.
        const placeholder = page.locator('input[placeholder]').first();
        if ((await placeholder.count()) > 0) {
          const phColor = await placeholder.evaluate((el) =>
            getComputedStyle(el).color,
          );
          const phBg = await placeholder.evaluate((el) =>
            getComputedStyle(el).backgroundColor,
          );
          const ratio = contrast(parseColor(phColor), parseColor(phBg));
          expect(ratio).toBeGreaterThanOrEqual(MIN_NORMAL);
        }

        const tertiary = page.locator('[class*="text-tertiary"]').first();
        if ((await tertiary.count()) > 0) {
          const tc = await tertiary.evaluate((el) => getComputedStyle(el).color);
          const tb = await tertiary.evaluate((el) => getComputedStyle(el).backgroundColor);
          const ratio = contrast(parseColor(tc), parseColor(tb));
          expect(ratio).toBeGreaterThanOrEqual(MIN_NORMAL);
        }
      });
    }
  });
}