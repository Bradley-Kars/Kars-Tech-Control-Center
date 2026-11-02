import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SHOT_DIR = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center/audit-loop/verify-staging/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:8798', viewport: { width: 1440, height: 900 } });

test('verify device gauges grey when offline', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.goto('/device/local', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/device-offline-gauges.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/device-gauges-errors.log`, errors.join('\n'));
  
  // Check gauge colors
  const gaugeColors = await page.evaluate(() => {
    const gauges = document.querySelectorAll('.gauge');
    return Array.from(gauges).map(g => {
      const progress = g.querySelector('.gauge svg circle:nth-child(2)') || g.querySelector('.gauge svg path:nth-child(2)');
      return progress ? window.getComputedStyle(progress).stroke : null;
    });
  });
  console.log('gauge colors:', gaugeColors);
  console.log('device errors:', errors.length);
});

test('verify settings user menu shows initials', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });

  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);

  // Click user menu
  await page.click('[aria-label="User Menu"]', { timeout: 5000 });
  await page.waitForTimeout(500);
  
  await page.screenshot({ path: `${SHOT_DIR}/settings-user-menu-fixed.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/settings-menu-errors.log`, errors.join('\n'));
  console.log('settings menu errors:', errors.length);
  
  // Check avatar content
  const avatarInfo = await page.evaluate(() => {
    const avatars = document.querySelectorAll('.avatar');
    return Array.from(avatars).map(a => ({
      text: a.textContent?.trim(),
      hasImg: !!a.querySelector('img'),
      hasSvg: !!a.querySelector('svg'),
    }));
  });
  console.log('avatars:', JSON.stringify(avatarInfo, null, 2));
});
