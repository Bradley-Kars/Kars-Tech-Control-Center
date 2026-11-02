import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SHOT_DIR = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center/audit-loop/cycle-2/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

const CASES = [
  { route: '/meshcentral', vp: { name: 'desktop-1920', width: 1920, height: 1080 } },
  { route: '/meshcentral', vp: { name: 'mobile-320', width: 320, height: 568 } },
  { route: '/dashboard', vp: { name: 'desktop-1440', width: 1440, height: 900 } },
  { route: '/ticketing', vp: { name: 'desktop-1440', width: 1440, height: 900 } },
  { route: '/settings', vp: { name: 'desktop-1440', width: 1440, height: 900 } },
];

test.use({ baseURL: 'http://localhost:5174' });

for (const c of CASES) {
  test(`regression: ${c.route} @ ${c.vp.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => { errors.push(err.message); });

    await page.setViewportSize(c.vp);
    await page.goto(c.route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const safe = c.route.replace(/\//g, '_') || 'root';
    await page.screenshot({ path: `${SHOT_DIR}/reg-${c.vp.name}-${safe}.png`, fullPage: true });
    fs.writeFileSync(`${SHOT_DIR}/reg-${c.vp.name}-${safe}-errors.log`, errors.join('\n'));
    console.log(`${c.vp.name} ${c.route}: errors=${errors.length}`);
  });
}
