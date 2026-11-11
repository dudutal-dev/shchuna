import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag } from './helpers';

const person = (page: Page, id: string) =>
  page.evaluate((who) => window.__shchuna!.state().characters.find((c) => c.id === who), id);
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());
const put = (page: Page, id: string, surface: string) =>
  page.evaluate(([who, where]) => window.__shchuna!.put(who!, where!), [id, surface]);

// Plan step 1: places do something with the characters put there.
test.describe('places do things with characters', () => {
  test('put at the top of the slide, a child slides down and lands standing', async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'gan');
    await scrollTo(page, 'gan-slide');
    const scale = page.viewportSize()!.height / 600;
    const top = await page.evaluate(() => window.__shchuna!.surfaceCenter('slide-top'));
    // The child playing in the yard is carried up to the top of the slide by touch.
    await touchDrag(page, await propCenter(page, 'gan-2'), { x: top!.x, y: top!.y - 30 * scale });
    await expect.poll(async () => (await person(page, 'gan-2'))?.pose, { timeout: 10_000 }).toBe('stand');
    expect(await person(page, 'gan-2')).toMatchObject({ x: 330, y: 548 });
    expect(await spoken(page)).toContain('react.wee');
    await page.screenshot({ path: `docs/screens/play-slide-${testInfo.project.name}.png` });
  });

  test('sitting on the swing sets it going', async ({ page }) => {
    await openGame(page, 'gan');
    await scrollTo(page, 'gan-swing');
    expect(await put(page, 'gan-2', 'swing-seat')).toBe(true);
    await expect.poll(async () => (await propState(page, 'gan-swing')).state?.swinging).toBe(true);
    expect(await person(page, 'gan-2')).toMatchObject({ on: 'swing-seat', pose: 'sit' });
  });

  test('asleep in bed, a tap wakes the child up', async ({ page }) => {
    test.slow();
    await openGame(page, 'home');
    expect(await put(page, 'family-4', 'bed')).toBe(true);
    await scrollTo(page, 'bed');
    await page.waitForTimeout(600);
    await tap(page, await propCenter(page, 'family-4'));
    await expect.poll(async () => (await person(page, 'family-4'))?.pose).toBe('stand');
    expect(await spoken(page)).toContain('react.morning');
  });

  test('sat on the kitchen chair, mother eats what is on the table', async ({ page }) => {
    await openGame(page, 'home');
    expect(await put(page, 'family-1', 'chair')).toBe(true);
    await expect.poll(() => spoken(page)).toContain('react.yum');
  });

  test('with the TV on, someone on the sofa laughs', async ({ page }) => {
    test.slow();
    await openGame(page, 'home');
    await tap(page, await scrollTo(page, 'tv'));
    await expect.poll(async () => (await propState(page, 'tv')).state?.on).toBe(true);
    expect(await put(page, 'family-2', 'sofa')).toBe(true);
    await expect.poll(() => spoken(page), { timeout: 15_000 }).toContain('react.laugh');
  });

  test('at the beach: swimming in the sea, sunbathing on the towel', async ({ page }, testInfo) => {
    await openGame(page, 'beach');
    expect(await put(page, 'beach-2', 'towel')).toBe(true);
    await expect.poll(() => spoken(page)).toContain('react.sun');
    await scrollTo(page, 'beach-towel');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screens/play-towel-${testInfo.project.name}.png` });

    expect(await put(page, 'beach-2', 'sea')).toBe(true);
    await expect.poll(() => spoken(page)).toContain('react.splash');
    await scrollTo(page, 'beach-turtle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screens/play-sea-${testInfo.project.name}.png` });
  });

  test('a passenger boards the open bus; closing the doors, off it drives', async ({ page }, testInfo) => {
    await openGame(page, 'station');
    await tap(page, await scrollTo(page, 'station-bus'));
    await expect.poll(async () => (await propState(page, 'station-bus')).state?.open).toBe(true);
    expect(await put(page, 'station-1', 'bus-seats')).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.characterVisible('station-1'))).toBe(true);
    await page.screenshot({ path: `docs/screens/play-bus-${testInfo.project.name}.png` });

    // A tap on the passenger (who covers the middle of the bus) is a tap on the bus: off we go.
    await tap(page, await propCenter(page, 'station-1'));
    await expect.poll(async () => (await propState(page, 'station-bus')).state?.open).toBe(false);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.characterVisible('station-1'))).toBe(false);
    expect(await spoken(page)).toContain('react.byebye');
  });
});
