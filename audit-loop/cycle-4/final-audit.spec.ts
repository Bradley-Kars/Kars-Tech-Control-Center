import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

const ROUTES = [
  '/', '/dashboard', '/device/local', '/device/unraid', '/device/phone',
  '/device/ally', '/device/laptop', '/device/nonexistent',
  '/service/docker', '/service/storage', '/service/system', '/service/network',
  '/service/lidarr', '/service/homeassistant', '/service/nextcloud', '/service/adguard',
  '/service/nonexistent',
  '/meshcentral', '/fleet-command', '/compliance', '/alerts', '/chat', '/ticketing',
  '/settings', '/settings/appearance', '/settings/notifications',
  '/settings/shortcuts', '/settings/meshcentral', '/settings/about',
];

test.use({ baseURL: 'http://localhost:5174', viewport: { width: 1024, height: 768 } });

for (const route of ROUTES) {
  test(`Final audit tablet-1024: ${route}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => { errors.push(err.message); });

    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const safe = route.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: `${SHOT_DIR}/final-tablet-1024-${safe}.png`, fullPage: true });
    fs.writeFileSync(`${SHOT_DIR}/final-tablet-1024-${safe}-errors.log`, errors.join('\n'));
    console.log(`tablet-1024 ${route}: errors=${errors.length}`);
  });
}
