import { test, expect } from '@playwright/test';
import { mockAllTauriCommands } from '../utils/mock-backend';

const BASE = 'http://localhost:5173';
const SHOTS = '/home/slayerbrk/Work/mc-ui-audit-screenshots';

test.describe('Master Control UI Audit Screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllTauriCommands(page);
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('01 - Dashboard - loaded state', async ({ page }) => {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/01-dashboard-loaded.png`, fullPage: true });
  });

  test('02 - Dashboard - empty state (no servers)', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      Object.assign(window.__TAURI_MOCK__, {
        get_servers: [], get_system_stats: {},
        get_docker_containers: [], meshcentralGetFleetStats: {},
      });
    });
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/02-dashboard-empty.png`, fullPage: true });
  });

  test('03 - Dashboard - loading state', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      const orig = window.__TAURI_INTERNALS__.invoke;
      // @ts-ignore
      window.__TAURI_INTERNALS__.invoke = async (cmd, args) => {
        if (['meshcentralGetFleetStats', 'get_servers', 'get_system_stats'].includes(cmd)) {
          await new Promise(r => setTimeout(r, 5000));
        }
        return orig(cmd, args);
      };
    });
    await page.goto(BASE);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/03-dashboard-loading.png`, fullPage: true });
  });

  test('04 - Dashboard - error state', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      window.__TAURI_INTERNALS__.invoke = async () => { throw new Error('Internal server error'); };
    });
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/04-dashboard-error.png`, fullPage: true });
  });

  for (const [n, label, path, file] of [
    ['05', 'Device Page - local machine', '/device/local',   '05-device-local.png'],
    ['06', 'Device Page - unraid',        '/device/unraid',  '06-device-unraid.png'],
    ['07', 'Service Page - Docker',       '/service/docker', '07-service-docker.png'],
    ['08', 'Service Page - Storage',      '/service/storage','08-service-storage.png'],
    ['09', 'Service Page - System',       '/service/system', '09-service-system.png'],
    ['10', 'Settings Page',               '/settings',       '10-settings.png'],
    ['10b','Ticketing Page',              '/ticketing',      '10-ticketing.png'],
    ['11', 'Fleet Command Page',          '/fleet-command',  '11-fleet-command.png'],
  ] as const) {
    test(`${n} - ${label}`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${SHOTS}/${file}`, fullPage: true });
    });
  }

  test('13 - Sidebar collapsed state', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar' });
    const expand   = page.getByRole('button', { name: 'Expand sidebar' });
    await expect(collapse.or(expand).first()).toBeVisible({ timeout: 15000 });
    if (await collapse.count() > 0) {
      await collapse.first().click();
      await page.waitForTimeout(500);
    }
    await expect(expand.first()).toBeVisible({ timeout: 5000 });
    await page.screenshot({ path: `${SHOTS}/13-sidebar-collapsed.png`, fullPage: true });
  });

  test('14 - Command palette', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${SHOTS}/14-command-palette.png`, fullPage: true });
  });

  test('16 - Error boundary - Dashboard with failing API', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      window.__TAURI_INTERNALS__.invoke = async () => { throw new Error('Internal server error'); };
    });
    await page.goto(BASE);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOTS}/16-dashboard-error-boundary.png`, fullPage: true });
  });

  test('17 - Empty state - no servers enrolled', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-ignore
      Object.assign(window.__TAURI_MOCK__, {
        get_servers: [], get_system_stats: {},
        get_docker_containers: [], meshcentralGetFleetStats: {},
      });
    });
    await page.goto(BASE);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SHOTS}/17-dashboard-empty.png`, fullPage: true });
  });
});

test.describe('Mobile viewport', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await mockAllTauriCommands(page);
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('12 - Mobile view - Dashboard', async ({ page }) => {
    await page.screenshot({ path: `${SHOTS}/12-dashboard-mobile.png`, fullPage: true });
  });

  test('15 - Device page - mobile', async ({ page }) => {
    await page.goto(`${BASE}/device/local`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/15-device-local-mobile.png`, fullPage: true });
  });

  test('18 - Mobile sidebar open', async ({ page }) => {
    const menu = page.getByRole('button', { name: 'Open navigation menu' });
    await expect(menu).toBeVisible({ timeout: 15000 });
    await menu.click();
    await page.waitForTimeout(500);
    await expect(page.locator('aside').first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/18-mobile-sidebar-open.png`, fullPage: true });
  });
});
