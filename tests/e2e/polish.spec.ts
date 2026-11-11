import { expect, test } from './fixtures';
import { tap, tapToStart, travel } from './helpers';

const hook = <T>(page: import('@playwright/test').Page, read: () => T) => page.evaluate(read);

test.describe('polish', () => {
  // SPEC §5.2. The wait is shortened from 20 seconds for the test.
  test('a quiet moment brings a gentle hint, and a touch puts it off', async ({ page }, testInfo) => {
    await page.goto('./?e2e&scene=home&hintMs=5000');
    await tapToStart(page);
    // Keep touching (on the wall, which does nothing): no hint yet.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(1000);
      await tap(page, { x: page.viewportSize()!.width / 2, y: 30 });
    }
    expect(await hook(page, () => window.__shchuna!.lastHint())).toBeNull();
    await expect.poll(() => hook(page, () => window.__shchuna!.lastHint()), { timeout: 20_000 }).not.toBeNull();
    const hinted = (await hook(page, () => window.__shchuna!.lastHint()))!;
    expect(await page.evaluate((id) => window.__shchuna!.isVisible(id), hinted)).toBe(true);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `docs/screens/m8-hint-${testInfo.project.name}.png` });
  });

  test('each place has its own music, and the map has a tune too', async ({ page }) => {
    await page.goto('./?e2e');
    await tapToStart(page);
    await expect.poll(() => hook(page, () => window.__shchuna!.music())).toBe('audio/music/map.mp3');
    const makolet = await hook(page, () => window.__shchuna!.mapCenter?.('makolet'));
    await tap(page, makolet!);
    await page.waitForFunction(() => window.__shchuna?.here() === 'makolet' && window.__shchuna.stage === 'playing');
    expect(await hook(page, () => window.__shchuna!.music())).toBe('audio/music/makolet.mp3');
    await travel(page, 'home');
    expect(await hook(page, () => window.__shchuna!.music())).toBe('audio/music/home.mp3');
    const response = await page.request.get('./audio/music/home.mp3');
    expect(response.status()).toBe(200);
  });

  // M8: ready to be added to a home screen (Lighthouse no longer scores PWAs).
  test('installs as an app: manifest, icons and an offline worker', async ({ page }) => {
    // The worker is ready once the whole offline copy, music included, is downloaded.
    test.slow();
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const manifest = await (await page.request.get(new URL(href!, page.url()).href)).json();
    expect(manifest).toMatchObject({ lang: 'he', dir: 'rtl', display: 'standalone', orientation: 'landscape' });
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      expect((await page.request.get(new URL(icon.src, page.url()).href)).status()).toBe(200);
    }
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await page.request.get(new URL(apple!, page.url()).href)).status()).toBe(200);
    expect(await page.evaluate(async () => Boolean(await navigator.serviceWorker.ready))).toBe(true);
  });

  // SPEC §15: a phone held upright is asked to turn, with a picture and no words.
  test('a phone held upright is asked to turn sideways', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('#rotate')).toBeHidden();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('#rotate')).toBeVisible();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#rotate')).toBeHidden();
  });
});
