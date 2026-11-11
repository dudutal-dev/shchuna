import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, tapToStart, touchDrag } from './helpers';

const isVisible = (page: Page, id: string) =>
  page.evaluate((prop) => window.__shchuna?.isVisible(prop) ?? false, id);

test.describe('home', () => {
  // Opening straight into the home starts in the kitchen. The full flow 1, through the
  // map, is in map.spec.ts.
  test('start screen opens into the kitchen', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    const fridge = await propCenter(page, 'fridge');
    const width = page.viewportSize()!.width;
    expect(fridge.x).toBeGreaterThan(0);
    expect(fridge.x).toBeLessThan(width);
    await page.screenshot({ path: `docs/screens/m3-kitchen-${testInfo.project.name}.png` });
  });

  // SPEC §16.2 flow 2.
  test('milk taken from the fridge to the table stays there after a refresh', async ({ page }) => {
    await openGame(page, 'home');
    expect(await isVisible(page, 'milk')).toBe(false);
    await tap(page, await propCenter(page, 'fridge'));
    await expect.poll(() => isVisible(page, 'milk')).toBe(true);

    const table = await scrollTo(page, 'kitchen-table');
    const milk = await propCenter(page, 'milk');
    const scale = page.viewportSize()!.height / 600;
    await touchDrag(page, milk, { x: table.x - 40 * scale, y: table.y - 60 * scale });
    await expect.poll(async () => (await propState(page, 'milk')).on).toBe('table');

    await page.evaluate(() => window.__shchuna?.flushSave());
    await page.reload();
    await tapToStart(page);
    expect((await propState(page, 'milk')).on).toBe('table');
    expect(await isVisible(page, 'milk')).toBe(true);
  });

  test('closing the fridge hides what is inside, and undo reopens it', async ({ page }) => {
    await openGame(page, 'home');
    const fridge = await propCenter(page, 'fridge');
    await tap(page, fridge);
    await expect.poll(() => isVisible(page, 'cake')).toBe(true);
    // The middle of the open fridge is its shelves; a child closes it by the open door.
    const scale = page.viewportSize()!.height / 600;
    await tap(page, { x: fridge.x - 80 * scale, y: fridge.y });
    await expect.poll(() => isVisible(page, 'cake')).toBe(false);
    await tap(page, await page.evaluate(() => window.__shchuna!.undoCenter()));
    await expect.poll(() => isVisible(page, 'cake')).toBe(true);
  });

  test('a pot boils on the stove and stops when taken off', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await scrollTo(page, 'stove');
    const scale = page.viewportSize()!.height / 600;
    const stove = await propCenter(page, 'stove');
    await touchDrag(page, await propCenter(page, 'pot'), { x: stove.x, y: stove.y - 90 * scale });
    await expect.poll(async () => (await propState(page, 'pot')).state?.boiling).toBe(true);
    await page.screenshot({ path: `docs/screens/m3-stove-${testInfo.project.name}.png` });

    const pot = await propCenter(page, 'pot');
    await touchDrag(page, pot, { x: pot.x, y: pot.y + 220 * scale });
    await expect.poll(async () => (await propState(page, 'pot')).state?.boiling).toBeUndefined();
  });

  test('the living room TV turns on', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await tap(page, await scrollTo(page, 'tv'));
    await expect.poll(async () => (await propState(page, 'tv')).state?.on).toBe(true);
    await page.screenshot({ path: `docs/screens/m3-living-${testInfo.project.name}.png` });
  });

  test('the kids room wardrobe opens to show the hippo', async ({ page }, testInfo) => {
    // Scrolls across the whole house: slow on software-rendered WebGL.
    test.slow();
    await openGame(page, 'home');
    expect(await isVisible(page, 'hippo')).toBe(false);
    await tap(page, await scrollTo(page, 'wardrobe'));
    await expect.poll(() => isVisible(page, 'hippo')).toBe(true);
    await page.screenshot({ path: `docs/screens/m3-kids-${testInfo.project.name}.png` });
  });
});
