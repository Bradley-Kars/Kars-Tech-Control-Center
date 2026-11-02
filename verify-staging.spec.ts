import { test, expect } from '@playwright/test';
import * as fs from 'fs';

const SHOT_DIR = '/home/slayerbrk/GitHub/Kars-Tech-Control-Center/audit-loop/verify-staging/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

test.use({ baseURL: 'http://localhost:8798', viewport: { width: 1440, height: 900 } });

test('verify MESH-001 fix - meshcentral friendly error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });
  await page.goto('/meshcentral', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/meshcentral-fixed.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/meshcentral-errors.log`, errors.join('\n'));
  console.log('meshcentral errors:', errors.length);
  console.log('page title:', await page.title());
});

test('verify ticketing layout - PageHeader + padding', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });
  await page.goto('/ticketing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT_DIR}/ticketing-fixed.png`, fullPage: true });
  fs.writeFileSync(`${SHOT_DIR}/ticketing-errors.log`, errors.join('\n'));
  
  // Measure padding
  const h1Left = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.getBoundingClientRect().left : null;
  });
  const mainLeft = await page.evaluate(() => {
    const el = document.querySelector('main');
    return el ? el.getBoundingClientRect().left : null;
  });
  console.log(`ticketing @1440px | mainLeft=${mainLeft} | h1Left=${h1Left} | pad=${Math.round((h1Left ?? 0) - (mainLeft ?? 0))}px`);
  console.log('ticketing errors:', errors.length);
});
