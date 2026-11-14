import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, scrollTo, tap, stripReady, tapToStart, touchDrag, travel, type Point } from './helpers';

const PITA = 'falafel-falafel-pita';
const GRANDPA = 'falafel-2';

const story = (page: Page) => page.evaluate(() => window.__shchuna!.story());
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());
const lastLine = (page: Page) => page.evaluate(() => window.__shchuna!.lastLine());

/** Drags a bowl from the counter onto the pita. */
async function into(page: Page, bowl: string): Promise<void> {
  await scrollTo(page, PITA);
  const scale = page.viewportSize()!.height / 600;
  const pita = await propCenter(page, PITA);
  await touchDrag(page, await propCenter(page, bowl), { x: pita.x + 20 * scale, y: pita.y });
}

/**
 * Carries something from the kitchen to grandpa on the terrace, as a child does: held at the
 * left edge of the screen until the room has slid over, then on to him.
 */
async function carryToGrandpa(page: Page, id: string): Promise<void> {
  await scrollTo(page, id);
  const from = await propCenter(page, id);
  const scale = page.viewportSize()!.height / 600;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: Point) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: point ? [{ x: point.x, y: point.y }] : [] });
  const glide = async (a: Point, b: Point) => {
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', { x: a.x + ((b.x - a.x) * i) / 12, y: a.y + ((b.y - a.y) * i) / 12 });
    }
  };
  const edge = { x: 30, y: from.y };
  await touch('touchStart', from);
  await glide(from, edge);
  // The room stops by itself at its left end, where the terrace is.
  const grandpaX = async () => (await page.evaluate((who) => window.__shchuna!.center(who), GRANDPA))?.x ?? -1;
  let before = -2;
  await expect
    .poll(
      async () => {
        const now = await grandpaX();
        const settled = now > 200 && Math.abs(now - before) < 1;
        before = now;
        return settled;
      },
      { timeout: 20_000, intervals: [300] },
    )
    .toBe(true);
  const grandpa = await propCenter(page, GRANDPA);
  const to = { x: grandpa.x, y: grandpa.y - 20 * scale };
  await glide(edge, to);
  await touch('touchEnd');
  await cdp.detach();
}

test.describe('stories', () => {
  test('level 1 runs from the opening line to the celebration', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 1 });
    expect(await story(page)).toEqual({ id: 'pita', step: 0, steps: ['fill', 'serve'] });
    // The first step is said once the opening line has finished.
    await expect.poll(async () => (await spoken(page)).includes('story.pita.fill'), { timeout: 15_000 }).toBe(true);
    const opening = await spoken(page);
    expect(opening.indexOf('story.pita.open')).toBeGreaterThanOrEqual(0);
    expect(opening.indexOf('story.pita.fill')).toBeGreaterThan(opening.indexOf('story.pita.open'));

    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    expect(await lastLine(page)).toBe('story.pita.serve');

    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
    const state = await page.evaluate(() => window.__shchuna!.state());
    expect(state.stories.done.map((entry) => entry.id)).toEqual(['pita']);
    expect(await spoken(page)).toContain('story.pita.done');
  });

  test('level 2 has three steps, and the salad counts only after the falafel', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 2 });
    expect((await story(page))?.steps).toEqual(['falafel', 'salad', 'serve']);

    await into(page, 'falafel-salad-bowl');
    await page.waitForTimeout(500);
    expect((await story(page))?.step).toBe(0);

    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await into(page, 'falafel-salad-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(2);
    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
  });

  test('an empty pita served to grandpa does not finish the story', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 1 });
    await carryToGrandpa(page, PITA);
    // Eaten and back on the counter, and the story is where it was.
    await expect.poll(async () => (await spoken(page)).includes('react.yum')).toBe(true);
    await page.waitForTimeout(500);
    expect(await story(page)).toMatchObject({ id: 'pita', step: 0 });
  });

  test('the story goes on after a reload', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 1 });
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await page.evaluate(() => window.__shchuna!.flushSave());
    await page.reload();
    await tapToStart(page);
    expect(await story(page)).toMatchObject({ id: 'pita', step: 1 });
  });

  test('the strip shows the guide and the steps from right to left', async ({ page }, testInfo) => {
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await stripReady(page);
    const xs = await page.evaluate(() => [0, 1, 2].map((i) => window.__shchuna!.storyStepCenter(i)?.x ?? null));
    const guide = await page.evaluate(() => window.__shchuna!.storyGuideCenter());
    expect(xs.every((x) => x !== null)).toBe(true);
    expect(guide!.x).toBeGreaterThan(xs[0]!);
    expect(xs[0]!).toBeGreaterThan(xs[1]!);
    expect(xs[1]!).toBeGreaterThan(xs[2]!);
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `docs/screens/story-strip-${testInfo.project.name}.png` });
  });

  test('tapping the current step says it again and shows the hand', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await stripReady(page);
    await scrollTo(page, PITA);
    await expect.poll(async () => (await spoken(page)).includes('story.pita.fill'), { timeout: 15_000 }).toBe(true);
    // A touch elsewhere first: any touch sends the hand away.
    await tap(page, { x: page.viewportSize()!.width / 2, y: page.viewportSize()!.height - 20 });
    await expect.poll(() => page.evaluate(() => window.__shchuna!.ghostShowing())).toBe(false);
    const before = (await spoken(page)).filter((line) => line === 'story.pita.fill').length;
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyStepCenter(0)))!);
    await expect
      .poll(async () => (await spoken(page)).filter((line) => line === 'story.pita.fill').length)
      .toBe(before + 1);
    expect(await page.evaluate(() => window.__shchuna!.ghostShowing())).toBe(true);
  });

  test('tapping the guide puts the story away for this session', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await stripReady(page);
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyGuideCenter()))!);
    await expect.poll(() => story(page)).toBeNull();
    expect(await lastLine(page)).toBe('story.later');
    expect(await page.evaluate(() => window.__shchuna!.storyStepCenter(0))).toBeNull();
    await travel(page, 'home');
    await travel(page, 'falafel');
    expect(await story(page)).toBeNull();
  });

  test('leaving in the middle keeps the strip, and coming back carries on', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    const strip = () => page.evaluate(() => window.__shchuna!.storyStepCenter(1));
    await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'map');
    expect(await strip()).not.toBeNull();
    const home = await page.evaluate(() => window.__shchuna!.mapCenter?.('home'));
    await tap(page, home!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === 'home', undefined, { timeout: 30_000 });
    expect(await strip()).not.toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.hudPulsing('map'))).toBe(true);
    await travel(page, 'falafel');
    expect(await story(page)).toMatchObject({ id: 'pita', step: 1 });
    expect(await page.evaluate(() => window.__shchuna!.hudPulsing('map'))).toBe(false);
  });

  test('at level 1 the hand shows the step as it starts', async ({ page }) => {
    await page.goto('./?e2e&scene=falafel&stories&level=1');
    await tapToStart(page);
    // The counter is in view when the stand opens, so the hand has somewhere to point.
    await expect.poll(() => page.evaluate(() => window.__shchuna!.ghostShowing()), { timeout: 8000 }).toBe(true);
  });

  test('at level 3 the serve step is a written word', async ({ page }, testInfo) => {
    await openGame(page, 'falafel', { stories: true, level: 3 });
    await stripReady(page);
    expect(await page.evaluate(() => window.__shchuna!.storyWords())).toEqual([null, 'פִּיתָּה', null, 'לִימוֹנָדָה']);
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `docs/screens/story-word-${testInfo.project.name}.png` });
    // Tapping the word reads it aloud, then says the step.
    await tap(page, { x: page.viewportSize()!.width / 2, y: page.viewportSize()!.height - 20 });
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyStepCenter(1)))!);
    await expect.poll(async () => (await spoken(page)).slice(-2)).toEqual(['prop.falafel-pita', 'story.pita.serve']);
  });

  test('nothing starts unless stories are on', async ({ page }) => {
    await openGame(page, 'falafel');
    expect(await story(page)).toBeNull();
    expect(await spoken(page)).not.toContain('story.pita.open');
  });
});
