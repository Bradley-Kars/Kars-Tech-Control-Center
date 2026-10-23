import { test, expect } from '@playwright/test';
import { AppPage } from '../page-objects/AppPage';
import { mockAllTauriCommands } from '../utils/mock-backend';

test.describe('Phone Page', () => {
  let app: AppPage;

  test.beforeEach(async ({ page }) => {
    await mockAllTauriCommands(page);
    app = new AppPage(page);
    await app.goto();
    await app.sidebar.getByText('Phone').click();
    await page.waitForTimeout(1000);
  });

  test('navigates to phone page', async () => {
    await expect(app.mainContent.getByText('BATTERY').first()).toBeVisible();
  });

  test('displays battery section', async () => {
    await expect(app.mainContent.getByText('BATTERY').first()).toBeVisible();
    await expect(app.mainContent.getByText('85%')).toBeVisible();
    await expect(app.mainContent.getByText('Charging')).toBeVisible();
  });

  test('displays storage section', async () => {
    await expect(app.mainContent.getByText('STORAGE').first()).toBeVisible();
    await expect(app.mainContent.getByText('256.0 GB')).toBeVisible();
  });

  test('displays memory section', async () => {
    await expect(app.mainContent.getByText('MEMORY').first()).toBeVisible();
    await expect(app.mainContent.getByText('12.0 GB')).toBeVisible();
  });

  test('displays network section', async () => {
    await expect(app.mainContent.getByText('HomeNetwork')).toBeVisible();
    await expect(app.mainContent.getByText('5G')).toBeVisible();
  });

  test('displays device info', async () => {
    await expect(app.mainContent.getByText('SM-S928U').first()).toBeVisible();
    await expect(app.mainContent.getByText('16').first()).toBeVisible();
  });

  test('displays notifications', async () => {
    await expect(app.mainContent.getByText('Messages: New message')).toBeVisible();
    await expect(app.mainContent.getByText('Gmail: New email')).toBeVisible();
  });

  test('displays media control', async () => {
    await expect(app.mainContent.getByText('Test Song')).toBeVisible();
    await expect(app.mainContent.getByText('Test Artist')).toBeVisible();
  });

  test('displays quick actions', async () => {
    await expect(app.mainContent.getByText('Screenshot')).toBeVisible();
    await expect(app.mainContent.getByText('Find Phone')).toBeVisible();
    await expect(app.mainContent.getByText('RustDesk')).toBeVisible();
  });

  test('displays messages section', async () => {
    await expect(app.mainContent.getByText('CONVERSATIONS', { exact: true })).toBeVisible();
  });

  test('displays clipboard sync', async () => {
    await expect(app.mainContent.getByText('Phone Clipboard')).toBeVisible();
  });

  test('displays call log', async () => {
    await expect(app.mainContent.getByText('No call history')).toBeVisible();
  });

  test('displays contacts', async () => {
    await expect(app.mainContent.getByText('No contacts loaded')).toBeVisible();
  });
});
