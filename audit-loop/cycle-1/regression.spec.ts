import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ROUTES = ['/', '/dashboard', '/ticketing', '/device/local', '/meshcentral', '/settings'];

test.use({ baseURL: 'http://localhost:5174' });

for (const route of ROUTES) {
  test(`regression: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => { errors.push(err.message); });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const safe = route.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: `${SHOT_DIR}/regression-${safe}.png`, fullPage: true });
    fs.writeFileSync(`${SHOT_DIR}/regression-${safe}-errors.log`, errors.join('\n'));
    console.log(`${route}: errors=${errors.length}`);
  });
}
