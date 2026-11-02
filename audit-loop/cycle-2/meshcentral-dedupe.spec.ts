import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SHOT_DIR = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center/audit-loop/cycle-2/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:5174', viewport: { width: 1920, height: 1080 } });

test('meshcentral dedupe at 1920px', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.goto('/meshcentral', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${SHOT_DIR}/meshcentral-dedupe-1920.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/meshcentral-dedupe-errors.log`, errors.join('\n'));
  console.log('ERRORS:', JSON.stringify(errors));
});
