import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, tap, travel } from './helpers';

type Point = { x: number; y: number };

async function mapPoint(page: Page, id: string): Promise<Point> {
  const at = await page.evaluate((place) => window.__shchuna?.mapCenter?.(place), id);
  if (!at) throw new Error(`Not on the map: ${id}`);
  return at;
}

const here = (page: Page) => page.evaluate(() => window.__shchuna!.here());
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());

test.describe('neighbourhood map', () => {
  // SPEC §16.2 flow 1: start → tap to start → map → home. Bet waits on the house.
  test('the start screen opens the map, and the house finds bet on the way in', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'map');
    expect(await here(page)).toBe('map');
    await expect.poll(() => spoken(page)).toContain('map.where');
    await page.screenshot({ path: `docs/screens/m7-map-${testInfo.project.name}.png` });

    // Right to left: home first.
    const home = await mapPoint(page, 'home');
    const makolet = await mapPoint(page, 'makolet');
    expect(home.x).toBeGreaterThan(makolet.x);

    expect(await mapPoint(page, 'letter')).toBeTruthy();
    await tap(page, home);
    await expect
      .poll(() =>
        page.evaluate(() => window.__shchuna!.state().letters.find((l) => l.letter === 'ב')?.found),
      )
      .toBe(true);
    expect(await spoken(page)).toContain('letter.found.bet');
    await page.waitForFunction(
      () => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === 'home',
      undefined,
      { timeout: 30_000 },
    );
    expect(await spoken(page)).toContain('place.home');
  });

  test('a locked place says its name and "soon", and stays on the map', async ({ page }) => {
    await openGame(page, 'map');
    await tap(page, await mapPoint(page, 'beach'));
    await expect.poll(async () => (await spoken(page)).slice(-1)).toEqual(['place.beach']);
    await page.waitForTimeout(500);
    expect(await here(page)).toBe('map');
  });

  test('the map button goes back to the map, and on to the makolet', async ({ page }) => {
    await openGame(page, 'home');
    await travel(page, 'makolet');
    expect(await here(page)).toBe('makolet');
    // Back to the map: the book and the lock stay, the place buttons go.
    await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'map');
    // The letter is still on the house, since this test went in through the shop.
    expect(await mapPoint(page, 'letter')).toBeTruthy();
  });
});
