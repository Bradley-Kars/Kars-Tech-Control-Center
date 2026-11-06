import { defineConfig, devices } from '@playwright/test';

/**
 * U10 CI smoke config: runs Playwright against `vite preview` (production
 * build) plus the stub backend. The CI job builds first (`npm run build`),
 * starts `vite preview`, then runs this config. In CI the preview server is
 * already started by the workflow, so webServer is skipped there.
 */
const baseConfig = {
  testDir: './e2e/tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
};

if (!process.env.CI) {
  baseConfig.webServer = {
    command: 'npx vite preview --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 30000,
  };
}

export default defineConfig(baseConfig);
