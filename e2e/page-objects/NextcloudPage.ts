import type { Page, Locator } from '@playwright/test';

export class NextcloudPage {
  readonly page: Page;
  readonly statusTab: Locator;
  readonly storageTab: Locator;
  readonly usersTab: Locator;
  readonly activityTab: Locator;
  readonly versionText: Locator;
  readonly maintenanceStatus: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statusTab = page.getByRole('button', { name: 'Status' });
    this.storageTab = page.getByRole('button', { name: 'Storage' });
    this.usersTab = page.getByRole('button', { name: 'Users' });
    this.activityTab = page.getByRole('button', { name: 'Activity' });
    this.versionText = page.getByText('34.0.3.2');
    this.maintenanceStatus = page.getByText('Maintenance');
  }

  async isLoaded() {
    return this.page.getByText('Nextcloud').first().isVisible();
  }

  async goToStorageTab() {
    await this.storageTab.click();
    await this.page.waitForTimeout(500);
  }

  async goToUsersTab() {
    await this.usersTab.click();
    await this.page.waitForTimeout(500);
  }

  async goToActivityTab() {
    await this.activityTab.click();
    await this.page.waitForTimeout(500);
  }
}