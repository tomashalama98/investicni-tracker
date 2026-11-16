// @ts-check
const { defineConfig } = require('@playwright/test');

// Lokálně lze použít systémový prohlížeč: PW_CHROME=/usr/bin/google-chrome npx playwright test
const executablePath = process.env.PW_CHROME || undefined;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  use: {
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
    trace: 'off',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
