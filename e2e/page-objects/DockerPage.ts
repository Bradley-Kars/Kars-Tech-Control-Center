import type { Page, Locator } from '@playwright/test';

export class DockerPage {
  readonly page: Page;
  readonly containerTable: Locator;
  readonly containerRows: Locator;
  readonly startBtns: Locator;
  readonly stopBtns: Locator;
  readonly restartBtns: Locator;
  readonly serviceIcons: Locator;

  constructor(page: Page) {
    this.page = page;
    this.containerTable = page.locator('table');
    this.containerRows = page.locator('tbody tr');
    this.startBtns = page.getByRole('button', { name: 'Start' });
    this.stopBtns = page.getByRole('button', { name: 'Stop' });
    this.restartBtns = page.getByRole('button', { name: 'Restart' });
    this.serviceIcons = page.locator('button').filter({ hasText: /[☁♪🏠⚡🛡]/ });
  }

  async isLoaded() {
    return this.page.getByText('Docker Containers').isVisible();
  }

  async getContainerCount() {
    return this.containerRows.count();
  }

  async clickServiceIcon(icon: string) {
    await this.page.getByText(icon).first().click();
  }
}