import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:5174' });

test('sidebar logo desktop expanded', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/sidebar-expanded-1440.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/sidebar-expanded-errors.log`, errors.join('\n'));
  console.log('desktop expanded errors:', errors.length);
});

test('sidebar logo desktop collapsed', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  // Click collapse (chevron left button in header)
  await page.click('button[aria-label="Collapse sidebar"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/sidebar-collapsed-1440.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/sidebar-collapsed-errors.log`, errors.join('\n'));
  console.log('desktop collapsed errors:', errors.length);
});
