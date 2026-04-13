const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'https://d2l9b1xmucsb19.cloudfront.net',
    headless: true,
    screenshot: 'only-on-failure',
  },
  reporter: [['list'], ['json', { outputFile: 'e2e/results.json' }]],
});
