import type { Page, Locator } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly hostname: Locator;
  readonly cpuGauge: Locator;
  readonly ramGauge: Locator;
  readonly gpuCard: Locator;
  readonly serverInfo: Locator;
  readonly refreshBtn: Locator;
  readonly rebootBtn: Locator;
  readonly shutdownBtn: Locator;
  readonly runningCount: Locator;
  readonly stoppedCount: Locator;
  readonly totalCount: Locator;
  readonly adguardCard: Locator;
  readonly myspeedCard: Locator;
  readonly phoneCard: Locator;
  readonly dockerSummary: Locator;

  constructor(page: Page) {
    this.page = page;
    this.hostname = page.locator('h1').first();
    this.cpuGauge = page.getByText('CPU');
    this.ramGauge = page.getByText('Memory');
    this.gpuCard = page.getByText('GPU');
    this.serverInfo = page.getByText('System');
    this.refreshBtn = page.getByText('Refresh');
    this.rebootBtn = page.getByText('Reboot');
    this.shutdownBtn = page.getByText('Shutdown');
    this.runningCount = page.getByText('running');
    this.stoppedCount = page.getByText('stopped');
    this.totalCount = page.getByText('total');
    this.adguardCard = page.getByText('AdGuard Home');
    this.myspeedCard = page.getByText('Internet Speed');
    this.phoneCard = page.getByText('Phone');
    this.dockerSummary = page.getByText('Docker');
  }

  async isLoaded() {
    return this.page.getByText('Dashboard').isVisible();
  }

  async getCpuPercentage() {
    return this.cpuGauge.locator('..').locator('span').first().textContent();
  }

  async clickRefresh() {
    await this.refreshBtn.click();
  }
}
