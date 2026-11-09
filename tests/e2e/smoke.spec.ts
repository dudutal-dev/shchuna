import { test, expect } from './fixtures';

test('boots an RTL Hebrew page with a canvas', async ({ page }, testInfo) => {
  await page.goto('./');
  await expect(page.locator('canvas')).toBeVisible();
  expect(await page.evaluate(() => document.dir)).toBe('rtl');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('he');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `docs/screens/m0-${testInfo.project.name}.png` });
});

test('ships a strict CSP and a web app manifest', async ({ page }) => {
  await page.goto('./');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).not.toContain('unsafe-eval');
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
});
