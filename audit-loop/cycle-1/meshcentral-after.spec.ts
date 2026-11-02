import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:5174' });

test('meshcentral after fix', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/meshcentral', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${SHOT_DIR}/meshcentral-after.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/meshcentral-after-errors.log`, errors.join('\n'));
  console.log('ERRORS:', JSON.stringify(errors));
});
