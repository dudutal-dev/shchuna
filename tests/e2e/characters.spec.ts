import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, scrollTo, tap, tapToStart, touchDrag } from './helpers';

type Point = { x: number; y: number };

const character = (page: Page, id: string) =>
  page.evaluate((who) => window.__shchuna?.state().characters.find((c) => c.id === who), id);

async function creatorControl(page: Page, id: string): Promise<Point> {
  const point = await page.evaluate((control) => window.__shchuna?.creatorCenter?.(control), id);
  if (!point) throw new Error(`No creator control ${id}`);
  return point;
}

async function openCreator(page: Page): Promise<void> {
  const family = await page.evaluate(() => window.__shchuna!.hudCenter('family'));
  await tap(page, family);
  await page.waitForFunction(() => window.__shchuna?.stage === 'creator');
}

test.describe('characters', () => {
  test('a new game has a family of four in the living room', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    const family = await page.evaluate(() => window.__shchuna!.state().characters);
    expect(family).toHaveLength(4);
    await scrollTo(page, 'family-2');
    await page.screenshot({ path: `docs/screens/m4-family-${testInfo.project.name}.png` });
  });

  test('the creator changes a character and it shows in the room', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await openCreator(page);
    await tap(page, await creatorControl(page, 'slot:family-3'));
    const before = (await character(page, 'family-3'))!.appearance;

    for (const category of ['clothes', 'hair', 'accessory', 'skin']) {
      await tap(page, await creatorControl(page, category));
    }
    await expect.poll(async () => (await character(page, 'family-3'))!.appearance).not.toEqual(before);
    const after = (await character(page, 'family-3'))!.appearance;
    expect(after.outfit).not.toBe(before.outfit);
    expect(after.skinTone).not.toBe(before.skinTone);
    await page.screenshot({ path: `docs/screens/m4-creator-${testInfo.project.name}.png` });

    await tap(page, await creatorControl(page, 'done'));
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
    // Only family-3 changed.
    expect((await character(page, 'family-1'))!.appearance.outfit).toBe('shutters');
  });

  // SPEC M4 acceptance: create a character, put them in bed, and it survives a refresh.
  test('a character put to bed lies down, darkens the room and stays after a refresh', async ({
    page,
  }, testInfo) => {
    // Carries a character across rooms: slow on software-rendered WebGL.
    test.slow();
    await openGame(page, 'home');
    await openCreator(page);
    await tap(page, await creatorControl(page, 'slot:family-4'));
    await tap(page, await creatorControl(page, 'clothes'));
    const outfit = (await character(page, 'family-4'))!.appearance.outfit;
    await tap(page, await creatorControl(page, 'done'));
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');

    // Carry the toddler into the kids' room: held at the left edge, the room scrolls along.
    const scale = page.viewportSize()!.height / 600;
    const start = await scrollTo(page, 'family-4');
    // About 700 world units of travel, at the edge-scroll speed of 0.7 px/ms.
    await touchDrag(page, start, { x: 20, y: start.y }, (700 * scale) / 0.7);
    // It ends up at the screen edge, under the HUD; bring it to the middle with the bed in view.
    const kid = await scrollTo(page, 'family-4');
    const bed = await propCenter(page, 'bed');
    await touchDrag(page, kid, { x: bed.x - 30 * scale, y: bed.y - 40 * scale });
    await expect.poll(async () => (await character(page, 'family-4'))?.pose).toBe('lie');
    expect((await character(page, 'family-4'))?.on).toBe('bed');
    await expect.poll(() => page.evaluate(() => window.__shchuna!.darkness())).toBeGreaterThan(0.3);
    await page.screenshot({ path: `docs/screens/m4-bed-${testInfo.project.name}.png` });

    await page.evaluate(() => window.__shchuna?.flushSave());
    await page.reload();
    await tapToStart(page);
    const reloaded = await character(page, 'family-4');
    expect(reloaded).toMatchObject({ pose: 'lie', on: 'bed' });
    expect(reloaded?.appearance.outfit).toBe(outfit);
  });

  test('food given to a character is eaten and goes back to the fridge', async ({ page }) => {
    // Carries a character across rooms: slow on software-rendered WebGL.
    test.slow();
    await openGame(page, 'home');
    const size = page.viewportSize()!;
    const scale = size.height / 600;
    // Carry the mother into the kitchen by holding her at the screen edge, which scrolls the room.
    const mother = await scrollTo(page, 'family-1');
    await touchDrag(page, mother, { x: size.width - 20, y: mother.y }, 2500);
    await scrollTo(page, 'fridge');
    await tap(page, await propCenter(page, 'fridge'));
    const start = await page.evaluate(() =>
      window.__shchuna!.state().props.find((p) => p.id === 'cake'),
    );
    const person = await propCenter(page, 'family-1');
    await touchDrag(page, await propCenter(page, 'cake'), { x: person.x, y: person.y - 20 * scale });
    await expect
      .poll(() => page.evaluate(() => window.__shchuna!.state().props.find((p) => p.id === 'cake')))
      .toMatchObject({ x: start!.x, y: start!.y, on: 'fridge-1' });
    expect((await character(page, 'family-1'))?.holding).toBeUndefined();
  });

  test('a toy given to a character is held, and moves with them', async ({ page }) => {
    await openGame(page, 'home');
    const scale = page.viewportSize()!.height / 600;
    // The TV stands between the plant and the toddler, so both are on screen.
    await scrollTo(page, 'tv');
    const kid = await propCenter(page, 'family-4');
    await touchDrag(page, await propCenter(page, 'plant'), { x: kid.x, y: kid.y - 10 * scale });
    await expect.poll(async () => (await character(page, 'family-4'))?.holding).toBe('plant');

    const before = await propCenter(page, 'plant');
    const moved = await propCenter(page, 'family-4');
    await touchDrag(page, moved, { x: moved.x - 150 * scale, y: moved.y });
    await expect
      .poll(async () => (await propCenter(page, 'plant')).x)
      .toBeLessThan(before.x - 80 * scale);
  });
});
