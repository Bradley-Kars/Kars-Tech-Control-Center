import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SHOT_DIR = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center/audit-loop/cycle-3/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:5174' });

test('mobile sidebar drawer at 320px', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/sidebar-mobile-open-320.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/sidebar-mobile-open-errors.log`, errors.join('\n'));
  console.log('mobile open errors:', errors.length);
});
