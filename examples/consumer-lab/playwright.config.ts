import { defineConfig, devices } from "@playwright/test";

const production = process.env.CONSUMER_LAB_PRODUCTION === "1";
const angularCandidate = process.env.CONSUMER_LAB_ANGULAR_CANDIDATE === "1";
const baseURL = production ? "http://127.0.0.1:4176" : "http://127.0.0.1:4175";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: production
    ? {
        command: "npm run preview:web -- --strictPort",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    : [
        {
          command: "npm run dev:vite -- --strictPort",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        },
        {
          command: angularCandidate ? "npm run dev:angular:candidate" : "npm run dev:angular",
          url: "http://127.0.0.1:4177/angular/",
          reuseExistingServer: !process.env.CI,
          timeout: 120_000
        }
      ]
});
