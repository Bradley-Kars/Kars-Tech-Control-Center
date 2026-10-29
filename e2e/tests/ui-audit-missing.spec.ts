import { test, expect } from '@playwright/test';

const MISSING_ROUTES = [
  '/settings/notifications',
  '/settings/shortcuts',
  '/settings/meshcentral',
  '/settings/about',
];

test.describe('Missing routes audit', () => {
  test.describe('Viewport: desktop-1440', () => {
    for (const route of MISSING_ROUTES) {
      test(`Screenshot ${route}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', (err) => { errors.push(err.message); });

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const safeName = route.replace(/\//g, '_').replace(/:/g, '_');
        await page.screenshot({
          path: `ui-audit-shots/desktop-1440-${safeName}.png`,
          fullPage: true,
        });

        const fs = require('fs');
        fs.appendFileSync(
          'ui-audit-shots/console-errors.log',
          `\n=== desktop-1440 - ${route} ===\n${errors.join('\n')}\n`
        );
      });
    }
  });

  test.describe('Viewport: desktop-1920', () => {
    const ROUTES = [
      '/', '/dashboard', '/device/local', '/device/unraid', '/device/phone',
      '/device/ally', '/device/laptop', '/device/nonexistent',
      '/service/docker', '/service/storage', '/service/system', '/service/network',
      '/service/lidarr', '/service/homeassistant', '/service/nextcloud', '/service/adguard',
      '/service/myspeed', '/service/nonexistent',
      '/meshcentral', '/fleet-command', '/compliance', '/alerts', '/chat', '/ticketing',
      '/settings', '/settings/appearance', '/settings/notifications',
      '/settings/shortcuts', '/settings/meshcentral', '/settings/about',
    ];
    for (const route of ROUTES) {
      test(`Screenshot ${route}`, async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
        page.on('pageerror', (err) => { errors.push(err.message); });

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForTimeout(2000);

        const safeName = route.replace(/\//g, '_').replace(/:/g, '_') || 'root';
        await page.screenshot({
          path: `ui-audit-shots/desktop-1920-${safeName}.png`,
          fullPage: true,
        });

        const fs = require('fs');
        fs.appendFileSync(
          'ui-audit-shots/console-errors.log',
          `\n=== desktop-1920 - ${route} ===\n${errors.join('\n')}\n`
        );
      });
    }
  });
});
