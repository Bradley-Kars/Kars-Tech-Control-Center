import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.join(__dirname, 'shots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:8798', viewport: { width: 1440, height: 900 } });

test('verify all UI fixes', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  // 1. Dashboard - check Avatar shows "BK" initials
  await page.goto('/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/dashboard-fixed.png`, fullPage: true });
  
  const avatarText = await page.evaluate(() => {
    const avatars = document.querySelectorAll('.avatar');
    return Array.from(avatars).map(a => a.textContent?.trim());
  });
  console.log('Dashboard avatars:', JSON.stringify(avatarText));

  // 2. Device page - check gauges are grey (not green) when offline
  await page.goto('/device/local', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/device-offline-fixed.png`, fullPage: true });

  const gaugeColors = await page.evaluate(() => {
    const gauges = document.querySelectorAll('.gauge');
    return Array.from(gauges).map(g => {
      const progress = g.querySelector('.gauge svg circle:nth-child(2)') || g.querySelector('.gauge svg path:nth-child(2)') || g.querySelector('.gauge svg path');
      return progress ? window.getComputedStyle(progress).stroke : null;
    });
  });
  console.log('Gauge colors:', gaugeColors);

  // 3. Ticketing - check dropdown carets
  await page.goto('/ticketing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${SHOT_DIR}/ticketing-fixed.png`, fullPage: true });

  const hasCarets = await page.evaluate(() => {
    const chevrons = document.querySelectorAll('.absolute.right-2');
    return chevrons.length;
  });
  console.log('Dropdown carets found:', hasCarets);

  // 4. Settings - check user menu shows "Bradley Kars" with email tooltip
  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  await page.click('[aria-label="User Menu"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT_DIR}/settings-user-menu-fixed.png`, fullPage: true });

  const userMenuText = await page.evaluate(() => {
    const menu = document.querySelector('[role="menu"]');
    return menu?.textContent?.trim() || '';
  });
  console.log('User menu text:', userMenuText);

  console.log('All errors:', errors.length);
});
