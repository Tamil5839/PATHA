// End-to-end tests in real browsers. Chromium runs everywhere (desktop and a
// phone profile). Set PW_ALL_BROWSERS=1 to add Firefox and WebKit (Safari's
// engine) where those browsers are installed (`npx playwright install`).
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    // Tests control the service worker explicitly (see offline.spec.js).
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-phone', use: { ...devices['Pixel 7'] } },
    ...(process.env.PW_ALL_BROWSERS
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
          { name: 'webkit-phone', use: { ...devices['iPhone 14'] } },
        ]
      : []),
  ],
});
