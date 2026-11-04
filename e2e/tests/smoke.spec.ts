import { test, expect } from '@playwright/test';
import { mockFleetBackend } from '../utils/mock-backend';

test.describe('Smoke - every route against stub backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockFleetBackend(page);
  });

  test('Dashboard route loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Dashboard')).toBeVisible();
    await expect(page.getByText('CPU')).toBeVisible();
  });

  test('Network route loads', async ({ page }) => {
    await page.goto('/network');
    await expect(page.getByText('Network')).toBeVisible();
  });

  test('System route loads', async ({ page }) => {
    await page.goto('/system');
    await expect(page.getByText('System')).toBeVisible();
  });

  test('Storage route loads', async ({ page }) => {
    await page.goto('/storage');
    await expect(page.getByText('Storage')).toBeVisible();
  });

  test('Nextcloud route loads', async ({ page }) => {
    await page.goto('/nextcloud');
    await expect(page.getByText('Nextcloud')).toBeVisible();
  });

  test('AdGuard route loads', async ({ page }) => {
    await page.goto('/adguard');
    await expect(page.getByText('AdGuard')).toBeVisible();
  });

  test('Home Assistant route loads', async ({ page }) => {
    await page.goto('/homeassistant');
    await expect(page.getByText('Home Assistant')).toBeVisible();
  });

  test('Docker route loads', async ({ page }) => {
    await page.goto('/docker');
    await expect(page.getByText('Docker')).toBeVisible();
  });

  test('MeshCentral route loads', async ({ page }) => {
    await page.goto('/mesh-central');
    await expect(page.getByText('MeshCentral')).toBeVisible();
  });

  test('Phone route loads', async ({ page }) => {
    await page.goto('/phone');
    await expect(page.getByText('Phone')).toBeVisible();
  });

  test('Settings route loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('Settings route loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Settings')).toBeVisible();
  });

  test('Service page loads', async ({ page }) => {
    await page.goto('/service/docker');
    await expect(page.getByText('Service')).toBeVisible();
  });

  test('Ticketing route loads', async ({ page }) => {
    await page.goto('/ticketing');
    await expect(page.getByText('Ticketing')).toBeVisible();
  });

  test('FleetCommand route loads', async ({ page }) => {
    await page.goto('/fleet-command');
    await expect(page.getByText('Fleet')).toBeVisible();
  });

  test('Compliance route loads', async ({ page }) => {
    await page.goto('/compliance');
    await expect(page.getByText('Compliance')).toBeVisible();
  });

  test('Chat route loads', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('Hermes')).toBeVisible();
  });
});
