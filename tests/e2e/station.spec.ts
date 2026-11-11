import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, travel } from './helpers';

const found = (page: Page) =>
  page.evaluate(() => window.__shchuna!.state().letters.filter((l) => l.found).map((l) => l.letter));

test.describe('station', () => {
  test('the last place opens from the map: a grandmother waits at the shelter', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    await travel(page, 'station');
    const traveller = await page.evaluate(() =>
      window.__shchuna!.state().characters.find((c) => c.id === 'station-2'),
    );
    expect(traveller).toMatchObject({ on: 'shelter-bench', pose: 'sit' });
    expect(await page.evaluate(() => window.__shchuna!.music())).toBe('audio/music/station.mp3');
    await page.screenshot({ path: `docs/screens/m9-station-${testInfo.project.name}.png` });
  });

  test('the bus opens its doors, the light turns green, and the car hides mem', async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'station');
    await tap(page, await scrollTo(page, 'station-bus'));
    await expect.poll(async () => (await propState(page, 'station-bus')).state?.open).toBe(true);
    await tap(page, await scrollTo(page, 'station-traffic-light'));
    await expect.poll(async () => (await propState(page, 'station-traffic-light')).state?.green).toBe(true);

    await tap(page, await scrollTo(page, 'station-car'));
    await expect.poll(() => found(page)).toEqual(['מ']);
    // Once the letter has flown to the book, a tap switches the headlights on.
    await page.waitForTimeout(3600);
    await tap(page, await propCenter(page, 'station-car'));
    await expect.poll(async () => (await propState(page, 'station-car')).state?.lights).toBe(true);
    await page.screenshot({ path: `docs/screens/m9-road-${testInfo.project.name}.png` });
  });
});
