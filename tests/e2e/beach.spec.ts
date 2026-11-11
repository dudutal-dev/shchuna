import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag, travel } from './helpers';

const isVisible = (page: Page, id: string) =>
  page.evaluate((prop) => window.__shchuna?.isVisible(prop) ?? false, id);
const found = (page: Page) =>
  page.evaluate(() => window.__shchuna!.state().letters.filter((l) => l.found).map((l) => l.letter));

test.describe('beach', () => {
  test('the map opens onto the sand, the lifeguard up on the tower', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await travel(page, 'beach');
    const lifeguard = await page.evaluate(() =>
      window.__shchuna!.state().characters.find((c) => c.id === 'beach-1'),
    );
    expect(lifeguard).toMatchObject({ on: 'tower-seat', pose: 'sit' });
    expect(await page.evaluate(() => window.__shchuna!.music())).toBe('audio/music/beach.mp3');
    await page.screenshot({ path: `docs/screens/m9-beach-${testInfo.project.name}.png` });
  });

  test('the sun hides shin, then puts on its sunglasses', async ({ page }) => {
    await openGame(page, 'beach');
    const sun = await scrollTo(page, 'beach-sun');
    await tap(page, sun);
    await expect.poll(() => found(page)).toEqual(['ש']);
    // Let the letter fly to the book, then the sun is just the sun.
    await page.waitForTimeout(3600);
    await tap(page, await propCenter(page, 'beach-sun'));
    await expect.poll(async () => (await propState(page, 'beach-sun')).state?.glasses).toBe(true);
  });

  test('the bucket turns the sand pile into a castle and goes back to its place', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'beach');
    const scale = page.viewportSize()!.height / 600;
    await scrollTo(page, 'beach-sand-mound');
    const before = await propState(page, 'beach-bucket');
    const mound = await propCenter(page, 'beach-sand-mound');
    await touchDrag(page, await propCenter(page, 'beach-bucket'), { x: mound.x, y: mound.y - 10 * scale });
    await expect.poll(async () => (await propState(page, 'beach-sand-mound')).state?.built).toBe(true);
    expect((await propState(page, 'beach-bucket')).x).toBe(before.x);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screens/m9-beach-castle-${testInfo.project.name}.png` });

    expect(await isVisible(page, 'beach-ice-pop-1')).toBe(false);
    await tap(page, await scrollTo(page, 'beach-cooler'));
    await expect.poll(() => isVisible(page, 'beach-ice-pop-1')).toBe(true);
  });

  test('the turtle at the water hides tsadi', async ({ page }) => {
    await openGame(page, 'beach');
    await tap(page, await scrollTo(page, 'beach-turtle'));
    await expect.poll(() => found(page)).toEqual(['צ']);
  });
});
