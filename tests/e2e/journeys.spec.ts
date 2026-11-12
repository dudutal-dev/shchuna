import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag } from './helpers';

const person = (page: Page, id: string) =>
  page.evaluate((who) => window.__shchuna!.state().characters.find((c) => c.id === who), id);
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());
const put = (page: Page, id: string, surface: string) =>
  page.evaluate(([who, where]) => window.__shchuna!.put(who!, where!), [id, surface]);

async function choosePlace(page: Page, place: string): Promise<void> {
  await page.waitForFunction(() => window.__shchuna?.stage === 'map', undefined, { timeout: 30_000 });
  const at = await page.evaluate((id) => window.__shchuna!.mapCenter?.(id), place);
  await tap(page, at!);
  await page.waitForFunction(
    (id) => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === id,
    place,
    { timeout: 30_000 },
  );
}

// Plan step 4: journeys, night and day, the weather, small surprises.
test.describe('journeys, night, weather and surprises', () => {
  test('a child carried onto the map button travels to the gan', async ({ page }, testInfo) => {
    test.slow();
    await openGame(page, 'home');
    const kid = await scrollTo(page, 'family-3');
    const mapButton = await page.evaluate(() => window.__shchuna!.hudCenter('map'));
    await touchDrag(page, kid, mapButton);
    await page.waitForFunction(() => window.__shchuna?.stage === 'map', undefined, { timeout: 30_000 });
    expect(await spoken(page)).toContain('journey.where');
    await page.screenshot({ path: `docs/screens/journey-map-${testInfo.project.name}.png` });

    await choosePlace(page, 'gan');
    expect(await person(page, 'family-3')).toMatchObject({ location: 'gan', pose: 'stand' });
    await expect.poll(() => spoken(page)).toContain('react.arrived');
    await page.screenshot({ path: `docs/screens/journey-gan-${testInfo.project.name}.png` });
  });

  test('passengers in the bus ride it to another place', async ({ page }) => {
    test.slow();
    await openGame(page, 'station');
    await tap(page, await scrollTo(page, 'station-bus'));
    await expect.poll(async () => (await propState(page, 'station-bus')).state?.open).toBe(true);
    expect(await put(page, 'station-2', 'bus-seats')).toBe(true);
    // Let her finish walking from the shelter to the bus before tapping her.
    await page.waitForTimeout(1200);
    await tap(page, await propCenter(page, 'station-2'));
    await choosePlace(page, 'beach');
    expect((await person(page, 'station-2'))?.location).toBe('beach');
  });

  test('the balcony door turns day to night', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await tap(page, await scrollTo(page, 'balcony'));
    await expect.poll(async () => (await propState(page, 'balcony')).state?.night).toBe(true);
    await expect.poll(() => spoken(page)).toContain('react.night');
    await page.waitForTimeout(1300);
    await page.screenshot({ path: `docs/screens/night-${testInfo.project.name}.png` });
    await tap(page, await propCenter(page, 'balcony'));
    await expect.poll(async () => (await propState(page, 'balcony')).state?.night).toBe(false);
  });

  test('tapping the sky on the map brings rain, then a rainbow', async ({ page }, testInfo) => {
    await openGame(page, 'map');
    const sky = await page.evaluate(() => window.__shchuna!.skyPoint?.());
    await tap(page, sky!);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.weather?.())).toBe('rain');
    expect(await spoken(page)).toContain('weather.rain');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/screens/rain-${testInfo.project.name}.png` });
    await expect.poll(() => page.evaluate(() => window.__shchuna!.weather?.()), { timeout: 15_000 }).toBe('rainbow');
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/screens/rainbow-${testInfo.project.name}.png` });
  });

  test('surprises: a fish leaps in the aquarium, hearts rise from the cat', async ({ page }) => {
    test.slow();
    await openGame(page, 'home');
    const effect = () => page.evaluate(() => window.__shchuna!.lastEffect());
    const aquarium = await scrollTo(page, 'aquarium');
    // The first tap finds the letter hidden on it; the next ones bring the fish.
    await tap(page, aquarium);
    await page.waitForTimeout(3800);
    await tap(page, await propCenter(page, 'aquarium'));
    await expect.poll(effect).toBe('fish:aquarium');
    await tap(page, await scrollTo(page, 'cat'));
    await expect.poll(effect).toBe('hearts:cat');
  });
});
