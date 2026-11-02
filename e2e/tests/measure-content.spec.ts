import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5174' });

test('measure content padding at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const route of ['/ticketing', '/settings']) {
    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);
    const mainLeft = await page.evaluate(() => {
      const el = document.querySelector('main');
      return el ? el.getBoundingClientRect().left : null;
    });
    const h1Left = await page.evaluate(() => {
      const el = document.querySelector('h1');
      return el ? el.getBoundingClientRect().left : null;
    });
    // first card/table content box left edge
    const cardLeft = await page.evaluate(() => {
      const sel = document.querySelector('.card') as HTMLElement | null;
      return sel ? sel.getBoundingClientRect().left : null;
    });
    const tableLeft = await page.evaluate(() => {
      const el = document.querySelector('table') as HTMLElement | null;
      return el ? el.getBoundingClientRect().left : null;
    });
    console.log(`${route} @1440px | mainLeft=${mainLeft} | h1Left=${h1Left} | cardLeft=${cardLeft} | tableLeft=${tableLeft}`);
  }
});
