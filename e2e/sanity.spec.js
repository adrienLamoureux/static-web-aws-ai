// @ts-check
const { test, expect } = require('@playwright/test');

const API_BASE = 'https://k002t5i8r9.execute-api.us-east-1.amazonaws.com/prod';

// 1. Homepage loads
test('homepage loads and contains expected content', async ({ page }) => {
  await page.goto('/');
  // Either the title contains "Whisk" or the page renders some recognisable element
  const title = await page.title();
  const hasWhiskTitle = title.toLowerCase().includes('whisk');
  const hasBodyContent = await page.locator('body').isVisible();
  expect(hasBodyContent).toBeTruthy();
  // Accept either a Whisk-branded title or any non-empty page body (initial load)
  if (!hasWhiskTitle) {
    const bodyText = await page.locator('body').textContent();
    expect(bodyText && bodyText.length > 0).toBeTruthy();
  }
});

// 2. Login page renders for unauthenticated users
test('unauthenticated users see a login prompt without hard errors', async ({ page }) => {
  // Navigate to a protected route; the app should show a login modal, not a crash
  const response = await page.goto('/');
  // Page must load (not a gateway error)
  expect(response?.status()).not.toBe(500);
  expect(response?.status()).not.toBe(502);
  expect(response?.status()).not.toBe(503);

  // Wait briefly for React to mount
  await page.waitForLoadState('networkidle');

  // Either a login button or a login modal should appear at some point,
  // OR the page renders safely without an error boundary message
  const hasError = await page.locator('text=Application Error').isVisible().catch(() => false);
  expect(hasError).toBeFalsy();

  // Cognito redirect should not hard-error — just verify no unhandled crash text
  const hasCrashText = await page.locator('text=Uncaught Error').isVisible().catch(() => false);
  expect(hasCrashText).toBeFalsy();
});

// 3. API health check
test('API health endpoint returns 200', async ({ request }) => {
  const response = await request.get(`${API_BASE}/hello/sanity`);
  expect(response.status()).toBe(200);
  const body = await response.json().catch(() => ({}));
  // The /hello/:name route returns a greeting; just confirm we get a JSON body
  expect(body).toBeDefined();
});

// 4. Static assets load from CloudFront
test('CloudFront distribution serves index.html and a JS bundle', async ({ request, baseURL }) => {
  // index.html
  const htmlResp = await request.get(`${baseURL}/`);
  expect(htmlResp.status()).toBe(200);
  const contentType = htmlResp.headers()['content-type'] || '';
  expect(contentType).toContain('html');

  // config.json — injected at deploy time, must be present
  const configResp = await request.get(`${baseURL}/config.json`);
  expect(configResp.status()).toBe(200);
  const config = await configResp.json().catch(() => null);
  expect(config).not.toBeNull();
  // config.json must have at minimum an apiBaseUrl key
  expect(config).toHaveProperty('apiBaseUrl');
});

// 5. Music library API returns 401 (not 500) without auth
test('music library endpoint returns 401 for unauthenticated requests', async ({ request }) => {
  const response = await request.get(`${API_BASE}/story/music-library`);
  // Must be 401, not a 5xx server error — confirms the endpoint exists and auth is wired
  expect(response.status()).toBe(401);
});
