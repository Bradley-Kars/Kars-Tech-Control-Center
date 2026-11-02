import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:8798', viewport: { width: 1440, height: 900 } });

test('compare padding ticketing vs settings', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  
  const sH1Left = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.getBoundingClientRect().left : null;
  });
  const sMainLeft = await page.evaluate(() => {
    const el = document.querySelector('main');
    return el ? el.getBoundingClientRect().left : null;
  });
  
  await page.goto('/ticketing', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(500);
  
  const tH1Left = await page.evaluate(() => {
    const el = document.querySelector('h1');
    return el ? el.getBoundingClientRect().left : null;
  });
  const tMainLeft = await page.evaluate(() => {
    const el = document.querySelector('main');
    return el ? el.getBoundingClientRect().left : null;
  });
  
  console.log(`SETTINGS @1440px | mainLeft=${sMainLeft} | h1Left=${sH1Left} | padding=${Math.round((sH1Left ?? 0) - (sMainLeft ?? 0))}px`);
  console.log(`TICKETING @1440px | mainLeft=${tMainLeft} | h1Left=${tH1Left} | padding=${Math.round((tH1Left ?? 0) - (tMainLeft ?? 0))}px`);
});
