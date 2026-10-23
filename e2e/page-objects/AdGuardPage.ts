import type { Page, Locator } from '@playwright/test';

export class AdGuardPage {
  readonly page: Page;
  readonly statusTab: Locator;
  readonly statsTab: Locator;
  readonly queriesTab: Locator;
  readonly clientsTab: Locator;
  readonly filtersTab: Locator;
  readonly dhcpTab: Locator;
  readonly versionText: Locator;
  readonly protectionStatus: Locator;
  readonly disableProtectionBtn: Locator;
  readonly enableProtectionBtn: Locator;
  readonly queryLogTable: Locator;
  readonly clientsTable: Locator;
  readonly filtersTable: Locator;
  readonly logFilter: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statusTab = page.getByRole('button', { name: 'Status' });
    this.statsTab = page.getByRole('button', { name: 'Stats' });
    this.queriesTab = page.getByRole('button', { name: 'Queries' });
    this.clientsTab = page.getByRole('button', { name: 'Clients' });
    this.filtersTab = page.getByRole('button', { name: 'Filters' });
    this.dhcpTab = page.getByRole('button', { name: 'DHCP' });
    this.versionText = page.getByText('v0.107.79');
    this.protectionStatus = page.getByText('Protection Enabled');
    this.disableProtectionBtn = page.getByText('Disable Protection');
    this.enableProtectionBtn = page.getByText('Enable Protection');
    this.queryLogTable = page.locator('table').filter({ hasText: 'Domain' });
    this.clientsTable = page.locator('table').filter({ hasText: 'Name' });
    this.filtersTable = page.locator('table').filter({ hasText: 'Filter' });
    this.logFilter = page.locator('select');
  }

  async isLoaded() {
    return this.page.getByText('AdGuard Home').isVisible();
  }

  async goToStatsTab() {
    await this.statsTab.click();
    await this.page.waitForTimeout(500);
  }

  async goToQueriesTab() {
    await this.queriesTab.click();
    await this.page.waitForTimeout(500);
  }

  async goToClientsTab() {
    await this.clientsTab.click();
    await this.page.waitForTimeout(500);
  }

  async goToFiltersTab() {
    await this.filtersTab.click();
    await this.page.waitForTimeout(500);
  }

  async filterByBlocked() {
    await this.logFilter.selectOption('blocked');
    await this.page.waitForTimeout(300);
  }

  async filterByAllowed() {
    await this.logFilter.selectOption('allowed');
    await this.page.waitForTimeout(300);
  }
}