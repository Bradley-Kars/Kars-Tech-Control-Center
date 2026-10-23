import { test, expect } from '@playwright/test';

test.describe('UI Audit Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
  });

  test('Dashboard - loaded state', async ({ page }) => {
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/01-dashboard-loaded.png', fullPage: true });
  });

  test('Dashboard - empty state (mocked)', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [], fleetStats: {} }) }));
    await page.reload();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/02-dashboard-empty.png', fullPage: true });
  });

  test('Dashboard - loading state', async ({ page }) => {
    await page.route('**/api/**', async route => {
      await new Promise(r => setTimeout(r, 5000));
      route.continue();
    });
    await page.reload();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/03-dashboard-loading.png', fullPage: true });
  });

  test('Dashboard - error state', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server error' }) }));
    await page.reload();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/04-dashboard-error.png', fullPage: true });
  });

  test('Device Page - local machine', async ({ page }) => {
    await page.goto('http://localhost:8080/device/local');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/05-device-local.png', fullPage: true });
  });

  test('Device Page - unraid', async ({ page }) => {
    await page.goto('http://localhost:8080/device/unraid');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/06-device-unraid.png', fullPage: true });
  });

  test('Service Page - Docker', async ({ page }) => {
    await page.goto('http://localhost:8080/service/docker');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/07-service-docker.png', fullPage: true });
  });

  test('Service Page - Storage', async ({ page }) => {
    await page.goto('http://localhost:8080/service/storage');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/08-service-storage.png', fullPage: true });
  });

  test('Service Page - System', async ({ page }) => {
    await page.goto('http://localhost:8080/service/system');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/09-service-system.png', fullPage: true });
  });

  test('Settings Page', async ({ page }) => {
    await page.goto('http://localhost:8080/settings');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/10-settings.png', fullPage: true });
  });

  test('Ticketing Page', async ({ page }) => {
    await page.goto('http://localhost:8080/ticketing');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/10-ticketing.png', fullPage: true });
  });

  test('Fleet Command Page', async ({ page }) => {
    await page.goto('http://localhost:8080/fleet-command');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/11-fleet-command.png', fullPage: true });
  });

  test('Mobile view - Dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/12-dashboard-mobile.png', fullPage: true });
  });

  test('Sidebar collapsed state', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.click('button[aria-label="Toggle sidebar"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/13-sidebar-collapsed.png', fullPage: true });
  });

  test('Command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/14-command-palette.png', fullPage: true });
  });

  test('Device page - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080/device/local');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/15-device-local-mobile.png', fullPage: true });
  });

  test('Error boundary - Dashboard with failing API', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/16-dashboard-error-boundary.png', fullPage: true });
  });

  test('Empty state - no servers enrolled', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [], fleetStats: {} }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/17-dashboard-empty.png', fullPage: true });
  });

  test('Mobile sidebar open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.click('button[aria-label="Toggle sidebar"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/18-mobile-sidebar-open.png', fullPage: true });
  });

  test('Command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/14-command-palette.png', fullPage: true });
  });

  test('Device page - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080/device/local');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/15-device-local-mobile.png', fullPage: true });
  });

  test('Error boundary - Dashboard with failing API', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/16-dashboard-error-boundary.png', fullPage: true });
  });

  test('Empty state - no servers enrolled', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [], fleetStats: {} }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/17-dashboard-empty.png', fullPage: true });
  });

  test('Mobile sidebar open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.click('button[aria-label="Toggle sidebar"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/18-mobile-sidebar-open.png', fullPage: true });
  });

  test('Command palette', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/14-command-palette.png', fullPage: true });
  });

  test('Device page - mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080/device/local');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/15-device-local-mobile.png', fullPage: true });
  });

  test('Error boundary - Dashboard with failing API', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Internal server error' }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/16-dashboard-error-boundary.png', fullPage: true });
  });

  test('Empty state - no servers enrolled', async ({ page }) => {
    await page.route('**/api/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ servers: [], fleetStats: {} }) }));
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/17-dashboard-empty.png', fullPage: true });
  });

  test('Mobile sidebar open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    await page.click('button[aria-label="Toggle sidebar"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/home/slayerbrk/Work/mc-ui-audit-screenshots/18-mobile-sidebar-open.png', fullPage: true });
  });
