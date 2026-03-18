import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration.
 *
 * REQUIREMENTS:
 * - Firebase credentials must be configured in .env or .env.local
 * - OR Firebase Auth emulator must be running (FIREBASE_AUTH_EMULATOR_HOST)
 * - API can be mocked in tests using page.route()
 *
 * See https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  // Run tests in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Use fewer workers on CI
  workers: process.env.CI ? 1 : undefined,

  // Reporter
  reporter: process.env.CI ? 'github' : 'html',

  // Global timeout per test
  timeout: 30000,

  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: process.env.VITE_APP_URL || 'http://localhost:5173',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',

    // Default navigation timeout
    navigationTimeout: 15000,
  },

  // Configure projects for browsers
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers if needed
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  // Run local dev server before starting tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    // Pass environment to dev server
    env: {
      ...process.env,
      // Default to mocked auth + mocked API for deterministic E2E runs.
      VITE_E2E_TEST_MODE: process.env.VITE_E2E_TEST_MODE ?? 'true',
      VITE_AUTH_MODE: process.env.VITE_AUTH_MODE ?? 'mock',
    },
  },
});
