import type { Page, Locator } from '@playwright/test';

export class AppPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly statusBar: Locator;
  readonly mainContent: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('aside');
    this.statusBar = page.locator('[class*="StatusBar"], footer');
    this.mainContent = page.locator('main');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async navigateTo(pageName: string) {
    await this.sidebar.getByText(pageName, { exact: false }).click();
    await this.page.waitForTimeout(500);
  }

  async getServerStatus() {
    return this.sidebar.getByText(/Online|Offline/).textContent();
  }

  async switchServer(serverName: string) {
    await this.sidebar.getByText(serverName).click();
    await this.page.waitForTimeout(500);
  }
}