import type { Page, Locator } from '@playwright/test';

export class StoragePage {
  readonly page: Page;
  readonly diskTable: Locator;
  readonly shareTable: Locator;
  readonly diskRows: Locator;
  readonly shareRows: Locator;
  readonly smartButtons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.diskTable = page.locator('table').filter({ hasText: 'Device' });
    this.shareTable = page.locator('table').filter({ hasText: 'Allocator' });
    this.diskRows = this.diskTable.locator('tbody tr');
    this.shareRows = this.shareTable.locator('tbody tr');
    this.smartButtons = page.getByRole('button', { name: 'SMART' });
  }

  async isLoaded() {
    return this.page.getByText('Disks').isVisible();
  }

  async getDiskCount() {
    return this.diskRows.count();
  }

  async getShareCount() {
    return this.shareRows.count();
  }
}