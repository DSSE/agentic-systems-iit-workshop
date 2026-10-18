import { defineConfig, devices } from "@playwright/test";
import path from "path";
import { DATA_PATH, seedBoard } from "./e2e/fixtures";

// The backend webServer below starts (and Playwright waits for its health
// check) before any globalSetup hook runs, so the fixture file has to
// exist before that point — seed it here, at config load time.
seedBoard();

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // all tests share one backend data file
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run dev",
      cwd: path.resolve(__dirname, "../backend"),
      url: "http://localhost:4100/api/tasks",
      env: { SPRINTBOARD_DATA_PATH: DATA_PATH, PORT: "4100" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "npm run dev -- -p 3100",
      cwd: __dirname,
      url: "http://localhost:3100",
      env: { NEXT_PUBLIC_API_URL: "http://localhost:4100/api" },
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
