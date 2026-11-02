import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

// Different lens than cycle 0: extreme viewports 320px and 1920px
const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const ROUTES = [
  '/', '/dashboard', '/device/local', '/device/unraid',
  '/service/docker', '/meshcentral', '/fleet-command',
  '/compliance', '/alerts', '/chat', '/ticketing',
  '/settings', '/settings/appearance',
];

test.use({ baseURL: 'http://localhost:5174' });

for (const vp of VIEWPORTS) {
  test.describe(`Viewport: ${vp.name}`, () => {
    for (const route of ROUTES) {
      test(`Fresh audit: ${route}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', (err) => { errors.push(err.message); });

        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2500);

        const safe = route.replace(/\//g, '_') || 'root';
        await page.screenshot({ path: `${SHOT_DIR}/fresh-${vp.name}-${safe}.png`, fullPage: true });
        fs.writeFileSync(`${SHOT_DIR}/fresh-${vp.name}-${safe}-errors.log`, errors.join('\n'));
        console.log(`${vp.name} ${route}: errors=${errors.length}`);
      });
    }
  });
}
