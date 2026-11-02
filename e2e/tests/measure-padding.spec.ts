import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5174' });

test('measure padding on ticketing and settings at 1440px', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const route of ['/ticketing', '/settings']) {
    await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(500);

    const appPadding = await page.evaluate(() => {
      const el = document.querySelector('main > div');
      return el ? window.getComputedStyle(el).paddingLeft : null;
    });

    let ticketingPadding = null;
    let settingsPadding = null;

    if (route === '/ticketing') {
      ticketingPadding = await page.evaluate(() => {
        const el = document.querySelector('main > div > div[data-testid="ticketing-page"]');
        return el ? window.getComputedStyle(el).paddingLeft : null;
      });
    }
    if (route === '/settings') {
      settingsPadding = await page.evaluate(() => {
        const el = document.querySelector(
          'main > div > div.flex-1.min-w-0.overflow-hidden > div.overflow-y-auto.min-w-0',
        );
        return el ? window.getComputedStyle(el).paddingLeft : null;
      });
    }

    console.log(
      `${route} | appWrapper paddingLeft=${appPadding} | pageContent paddingLeft=${route === '/ticketing' ? ticketingPadding : settingsPadding}`,
    );
  }
});

test('measure heading left offset vs main left edge at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
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
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(
      `${route} @375px | mainLeft=${mainLeft} | h1Left=${h1Left} | contentPad=${Math.round((h1Left ?? 0) - (mainLeft ?? 0))}px | scrollWidth=${scrollWidth} innerWidth=375`,
    );
  }
});
