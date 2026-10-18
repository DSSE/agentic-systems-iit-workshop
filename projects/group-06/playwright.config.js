import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  testMatch: '**/*.spec.js',
  timeout: 30000,
  fullyParallel: false, // Run sequentially to maintain clean fixture state across edge cases
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:3099',
    trace: 'on-first-retry',
    headless: true,
  },
  webServer: {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:3099',
    reuseExistingServer: false,
    env: {
      PORT: '3099'
    },
    timeout: 10000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
