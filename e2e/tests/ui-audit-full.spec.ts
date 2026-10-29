import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568 },
  { name: 'mobile-375', width: 375, height: 667 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 },
];

const ROUTES = [
  '/',
  '/dashboard',
  '/device/local',
  '/device/unraid',
  '/device/phone',
  '/device/ally',
  '/device/laptop',
  '/device/nonexistent',
  '/service/docker',
  '/service/storage',
  '/service/system',
  '/service/network',
  '/service/lidarr',
  '/service/homeassistant',
  '/service/nextcloud',
  '/service/adguard',
  '/service/myspeed',
  '/service/nonexistent',
  '/meshcentral',
  '/fleet-command',
  '/compliance',
  '/alerts',
  '/chat',
  '/ticketing',
  '/settings',
  '/settings/appearance',
  '/settings/notifications',
  '/settings/shortcuts',
  '/settings/meshcentral',
  '/settings/about',
];

test.describe('UI Audit Screenshots', () => {
  for (const vp of VIEWPORTS) {
    test.describe(`Viewport: ${vp.name} (${vp.width}x${vp.height})`, () => {
      for (const route of ROUTES) {
        test(`Screenshot ${route}`, async ({ page }) => {
          // Capture console errors
          const errors: string[] = [];
          page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
          });
          page.on('pageerror', (err) => {
            errors.push(err.message);
          });

          await page.setViewportSize({ width: vp.width, height: vp.height });
          await page.goto(route, { waitUntil: 'networkidle', timeout: 30000 });

          // Wait a bit for any async data loading
          await page.waitForTimeout(2000);

          const safeName = route.replace(/\//g, '_').replace(/:/g, '_') || 'root';
          await page.screenshot({
            path: `ui-audit-shots/${vp.name}-${safeName}.png`,
            fullPage: true,
          });

          // Log errors to a file
          const fs = require('fs');
          fs.appendFileSync(
            'ui-audit-shots/console-errors.log',
            `\n=== ${vp.name} - ${route} ===\n${errors.join('\n')}\n`
          );
        });
      }
    });
  }
});
