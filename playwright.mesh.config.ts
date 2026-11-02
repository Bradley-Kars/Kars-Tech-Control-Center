import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'audit-loop/final-convergence',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: {
    command: 'node_modules/.bin/vite --port 5174 --host 0.0.0.0',
    url: 'http://localhost:5174/',
    timeout: 60000,
    reuseExistingServer: false,
    cwd: '<cwd>/Kars-Tech-Control-Center',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
