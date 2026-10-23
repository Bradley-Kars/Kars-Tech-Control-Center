import { test, expect } from '@playwright/test';
import { AppPage } from '../page-objects/AppPage';
import { DashboardPage } from '../page-objects/DashboardPage';
import { mockAllTauriCommands } from '../utils/mock-backend';

test.describe('Dashboard', () => {
  let app: AppPage;
  let dashboard: DashboardPage;

  test.beforeEach(async ({ page }) => {
    await mockAllTauriCommands(page);
    app = new AppPage(page);
    dashboard = new DashboardPage(page);
    await app.goto();
  });

  test('displays CPU gauge with percentage', async () => {
    await expect(app.mainContent.getByText('CPU', { exact: true }).first()).toBeVisible();
    await expect(app.mainContent.getByText('29%')).toBeVisible();
  });

  test('displays GPU info', async () => {
    await expect(app.mainContent.getByText('NVIDIA GeForce GTX 1080 Ti')).toBeVisible();
  });

  test('displays server info', async () => {
    await expect(app.mainContent.getByText('Hostname')).toBeVisible();
    await expect(app.mainContent.getByText('home-server')).toBeVisible();
  });

  test('displays docker summary', async () => {
    await expect(app.mainContent.getByText('5 running')).toBeVisible();
    await expect(app.mainContent.getByText('1 stopped')).toBeVisible();
  });

  test('displays AdGuard card', async () => {
    await expect(app.mainContent.getByText('AdGuard Home')).toBeVisible();
    await expect(app.mainContent.getByText('Protection Active')).toBeVisible();
  });

  test('displays MySpeed card', async () => {
    await expect(app.mainContent.getByText('Internet Speed')).toBeVisible();
    await expect(app.mainContent.getByText('201 Mbps')).toBeVisible();
  });

  test('displays phone summary', async () => {
    await expect(app.mainContent.getByText('Galaxy S24')).toBeVisible();
    await expect(app.mainContent.getByText('85%')).toBeVisible();
  });

  test('refresh button is clickable', async () => {
    await expect(dashboard.refreshBtn).toBeEnabled();
    await dashboard.clickRefresh();
  });

  test('reboot button is visible', async () => {
    await expect(dashboard.rebootBtn).toBeVisible();
  });

  test('shutdown button is visible', async () => {
    await expect(dashboard.shutdownBtn).toBeVisible();
  });

  test('navigates to phone page via View All', async () => {
    const phoneBtn = app.mainContent.getByRole('button', { name: 'View All →' }).first();
    await expect(phoneBtn).toBeVisible();
    await phoneBtn.click();
    await expect(app.mainContent.getByText('Battery')).toBeVisible();
  });
});
