import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, tap, tapToStart } from './helpers';

const stage = (page: Page) => page.evaluate(() => window.__shchuna!.stage);
const here = (page: Page) => page.evaluate(() => window.__shchuna!.here());
/** What Android's back button does in a web app. */
const back = (page: Page) => page.evaluate(() => history.back());

test.describe("Android's back button", () => {
  test('goes from a place to the map, and stops there', async ({ page }) => {
    await openGame(page, 'home');
    const url = page.url();
    await back(page);
    // The map loads its art the first time: slow on a busy test machine.
    await expect.poll(() => here(page), { timeout: 20_000 }).toBe('map');
    await page.waitForFunction(() => window.__shchuna?.stage === 'map', undefined, { timeout: 20_000 });

    // On the map it does nothing: the child is still in the game.
    await back(page);
    await page.waitForTimeout(800);
    expect(await here(page)).toBe('map');
    expect(page.url()).toBe(url);
  });

  test('closes the letter book first', async ({ page }) => {
    await openGame(page, 'home');
    await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('book')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'book');
    await back(page);
    await expect.poll(() => stage(page)).toBe('playing');
    expect(await here(page)).toBe('home');
  });
});

test.describe('installing on Android', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  });

  test('Samsung Internet shows parents a note to install through Chrome', async ({ page }, testInfo) => {
    await page.goto('./?e2e&scene=home');
    await page.waitForFunction(() => window.__shchuna?.stage === 'start');
    await expect(page.locator('.install-hint')).toBeVisible();
    await expect(page.locator('.install-hint')).toContainText('כרום');
    await page.screenshot({ path: `docs/screens/android-hint-${testInfo.project.name}.png` });
    await tapToStart(page);
    await expect(page.locator('.install-hint')).toHaveCount(0);
  });
});

test('Chrome shows no install note', async ({ page }) => {
  await page.goto('./?e2e&scene=home');
  await page.waitForFunction(() => window.__shchuna?.stage === 'start');
  await expect(page.locator('.install-hint')).toHaveCount(0);
});
