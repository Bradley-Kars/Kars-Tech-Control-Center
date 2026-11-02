import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ROUTES = [
  '/', '/dashboard', '/device/local', '/device/unraid',
  '/service/docker', '/meshcentral', '/fleet-command',
  '/compliance', '/alerts', '/chat', '/ticketing',
  '/settings', '/settings/appearance',
];

test.use({ baseURL: 'http://localhost:5174', viewport: { width: 768, height: 1024 } });

for (const route of ROUTES) {
  test(`Fresh audit: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => { errors.push(err.message); });

    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);

    const safe = route.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: `${SHOT_DIR}/fresh-tablet-768-${safe}.png`, fullPage: true });
    fs.writeFileSync(`${SHOT_DIR}/fresh-tablet-768-${safe}-errors.log`, errors.join('\n'));
    console.log(`tablet-768 ${route}: errors=${errors.length}`);
  });
}
