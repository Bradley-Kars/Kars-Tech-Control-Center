import { defineConfig, devices } from '@playwright/test';

/**
 * Primary Playwright config. Runs against `npm run dev` locally; in CI the
 * workflow already starts `vite preview` on port 5173, so webServer is
 * skipped there and Playwright connects to the existing server.
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
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 30000,
  };
}

export default defineConfig(baseConfig);
