import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";
import { MATRIX_DEVICES } from "./e2e/matrix";

loadDotenv();

const PORT = 4173;
const AUTH = "playwright/.auth/user.json";

/**
 * End-to-end tests run against the production build served by `vite preview`.
 * Credentials: QUEST_TEST_EMAIL / QUEST_TEST_PASSWORD.
 *
 * Projects:
 *  - setup / desktop / mobile — original smoke suite
 *  - one project per phone/tablet × portrait/landscape — matrix for no-H-scroll + mobile perfection
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      testIgnore: /mobile-matrix\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, storageState: AUTH },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      testIgnore: /mobile-matrix\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        storageState: AUTH,
      },
    },
    // Full device × orientation matrix — only the matrix spec runs here.
    ...MATRIX_DEVICES.map((d) => ({
      name: d.project,
      dependencies: ["setup"] as string[],
      testMatch: /mobile-matrix\.spec\.ts/,
      use: {
        browserName: "chromium" as const,
        viewport: d.viewport,
        deviceScaleFactor: d.deviceScaleFactor,
        isMobile: d.isMobile,
        hasTouch: d.hasTouch,
        storageState: AUTH,
      },
    })),
  ],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
