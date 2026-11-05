import { test, expect } from '@playwright/test';
import { mockFleetBackend } from '../utils/mock-backend';

test.describe('Smoke - every route against stub backend', () => {
  test.beforeEach(async ({ page }) => {
    await mockFleetBackend(page);
  });

  test('Dashboard route loads', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Fleet Overview' })).toBeVisible();
    await expect(page.getByText('CPU').first()).toBeVisible();
  });

  test('Network route loads', async ({ page }) => {
    await page.goto('/service/network');
    await expect(page.getByRole('heading', { name: 'Network' }).first()).toBeVisible();
  });

  test('System route loads', async ({ page }) => {
    await page.goto('/service/system');
    await expect(page.getByRole('heading', { name: 'System' }).first()).toBeVisible();
  });

  test('Storage route loads', async ({ page }) => {
    await page.goto('/service/storage');
    await expect(page.getByRole('heading', { name: 'Storage' }).first()).toBeVisible();
  });

  test('Nextcloud route loads', async ({ page }) => {
    await page.goto('/service/nextcloud');
    await expect(page.getByRole('heading', { name: 'Nextcloud' })).toBeVisible();
  });

  test('AdGuard route loads', async ({ page }) => {
    await page.goto('/service/adguard');
    await expect(page.getByRole('heading', { name: 'AdGuard Home' })).toBeVisible();
  });

  test('Home Assistant route loads', async ({ page }) => {
    await page.goto('/service/homeassistant');
    await expect(page.getByRole('heading', { name: 'Home Assistant' })).toBeVisible();
  });

  test('Docker route loads', async ({ page }) => {
    await page.goto('/service/docker');
    await expect(page.getByText('Docker Containers')).toBeVisible();
  });

  test('MeshCentral route loads', async ({ page }) => {
    await page.goto('/meshcentral');
    await expect(page.getByRole('heading', { name: 'MeshCentral Fleet' }).first()).toBeVisible();
  });

  test('Phone route loads', async ({ page }) => {
    await page.goto('/device/phone');
    await expect(page.getByRole('heading', { name: 'Galaxy S24' })).toBeVisible();
  });

  test('Settings route loads', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('Ticketing route loads', async ({ page }) => {
    await page.goto('/ticketing');
    await expect(page.getByRole('heading', { name: 'Ticketing' })).toBeVisible();
  });

  test('FleetCommand route loads', async ({ page }) => {
    await page.goto('/fleet-command');
    await expect(page.getByRole('heading', { name: 'Fleet Command' })).toBeVisible();
  });

  test('Compliance route loads', async ({ page }) => {
    await page.goto('/compliance');
    await expect(page.getByRole('heading', { name: 'Patch Compliance' })).toBeVisible();
  });

  test('Chat route loads', async ({ page }) => {
    await page.goto('/chat');
    await expect(page.getByText('Hermes')).toBeVisible();
  });
});
