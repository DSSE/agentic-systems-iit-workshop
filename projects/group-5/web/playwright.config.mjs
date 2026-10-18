import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3105", headless: true, trace: "retain-on-failure",
    launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) } },
  webServer: [
    { command: "node ../server/scripts/browser-fixture.js", url: "http://127.0.0.1:4105", reuseExistingServer: false },
    { command: "npm run dev -- --hostname 127.0.0.1 --port 3105", url: "http://127.0.0.1:3105", reuseExistingServer: false,
      env: { NEXT_PUBLIC_API_URL: "http://127.0.0.1:4105" } },
  ],
});
