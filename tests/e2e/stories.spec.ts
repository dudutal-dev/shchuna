import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propState, scrollTo, settled, tap, stripReady, tapToStart, touchDrag, travel, type Point } from './helpers';

const PITA = 'falafel-falafel-pita';
const GRANDPA = 'falafel-2';

const story = (page: Page) => page.evaluate(() => window.__shchuna!.story());
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());
const lastLine = (page: Page) => page.evaluate(() => window.__shchuna!.lastLine());

/** Drags a bowl from the counter onto the pita. */
async function into(page: Page, bowl: string): Promise<void> {
  await scrollTo(page, PITA);
  const scale = page.viewportSize()!.height / 600;
  // Read once everything stands still: the room after sliding, and a bowl back from the last drag.
  const pita = await settled(page, PITA);
  await touchDrag(page, await settled(page, bowl), { x: pita.x + 20 * scale, y: pita.y }, 150);
}

/**
 * Carries something from the kitchen to grandpa on the terrace, as a child does: held at the
 * left edge of the screen until the room has slid over, then on to him.
 */
async function carryToGrandpa(page: Page, id: string): Promise<void> {
  await scrollTo(page, id);
  const from = await settled(page, id);
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
  let still = 0;
  await expect
    .poll(
      async () => {
        const now = await grandpaX();
        const stopped = now > 200 && Math.abs(now - before) < 1;
        before = now;
        // Three still readings in a row: one alone can fall between two slow frames.
        still = stopped ? still + 1 : 0;
        return still >= 3;
      },
      { timeout: 30_000, intervals: [300] },
    )
    .toBe(true);
  // Onto his table, as the hand shows: wide enough for a small finger, and he eats from it.
  const tableTop = async () => {
    const table = await page.evaluate(() => window.__shchuna!.surfaceCenter('terrace-table-1'));
    return { x: table!.x, y: table!.y - 12 * scale };
  };
  let to = await tableTop();
  await glide(edge, to);
  // Held over the table until the table is where the finger is: if the room moved a little
  // more while the finger was on its way, follow it before letting go.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(300);
    const now = await tableTop();
    if (Math.abs(now.x - to.x) < 2 && Math.abs(now.y - to.y) < 2) break;
    await glide(to, now);
    to = now;
  }
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

  test('an idle child is reminded of the current step, not given a general idea', async ({ page }) => {
    await page.goto('./?e2e&scene=falafel&stories&level=2&invites&hintMs=3000');
    await tapToStart(page);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.lastHint()), { timeout: 20_000 }).toBe('story:falafel');
    const lines = await spoken(page);
    expect(lines.at(-1)).toBe('story.pita.fill');
    expect(lines).not.toContain('invite.pita');
  });

  test('nobody wishes for anything while a story is being told', async ({ page }) => {
    test.slow();
    await page.goto('./?e2e&scene=falafel&stories&level=2&wishMs=1500');
    await tapToStart(page);
    await stripReady(page);
    await page.waitForTimeout(6000);
    expect(await page.evaluate(() => window.__shchuna!.wish())).toBeNull();
    // Put away, and wishes come back.
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyGuideCenter()))!);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.wish()), { timeout: 30_000 }).not.toBeNull();
  });

  test('someone who arrives with the child hears "we are here", then the story', async ({ page }) => {
    test.slow();
    await openGame(page, 'home', { stories: true, level: 2 });
    const kid = await scrollTo(page, 'family-3');
    await touchDrag(page, kid, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'map', undefined, { timeout: 30_000 });
    await tap(page, (await page.evaluate(() => window.__shchuna!.mapCenter?.('falafel')))!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === 'falafel', undefined, { timeout: 30_000 });
    await expect.poll(async () => (await spoken(page)).includes('story.pita.fill'), { timeout: 20_000 }).toBe(true);
    const lines = await spoken(page);
    const order = ['react.arrived', 'story.pita.open', 'story.pita.fill'].map((line) => lines.lastIndexOf(line));
    expect(order[0]).toBeGreaterThanOrEqual(0);
    expect(order[1]).toBeGreaterThan(order[0]!);
    expect(order[2]).toBeGreaterThan(order[1]!);
  });

  test('a pita emptied again is asked to be filled again, not served empty', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 2, query: 'invites&hintMs=3000' });
    await stripReady(page);
    await into(page, 'falafel-falafel-bowl');
    await into(page, 'falafel-salad-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(2);
    // Undo takes the filling out; the step stays done, but the guide knows what is missing.
    await tap(page, await page.evaluate(() => window.__shchuna!.undoCenter()));
    await tap(page, await page.evaluate(() => window.__shchuna!.undoCenter()));
    await expect.poll(async () => (await propState(page, PITA)).state?.stuffed).toBeUndefined();
    expect((await story(page))?.step).toBe(2);
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyStepCenter(2)))!);
    await expect.poll(() => lastLine(page)).toBe('story.pita.fill');
    expect(await page.evaluate(() => window.__shchuna!.ghostShowing())).toBe(true);
  });

  test('grandpa gets the pita from his table even with someone on the other stool', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 1 });
    expect(await page.evaluate(() => window.__shchuna!.put('falafel-1', 'stool-1'))).toBe(true);
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
  });

  test('when grandpa goes away the story is set aside, and waits for him', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await stripReady(page);
    // Grandpa is carried onto the map button and goes home.
    const scale = page.viewportSize()!.height / 600;
    const grandpa = await scrollTo(page, GRANDPA);
    await touchDrag(page, { x: grandpa.x, y: grandpa.y - 10 * scale }, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'map', undefined, { timeout: 30_000 });
    await tap(page, (await page.evaluate(() => window.__shchuna!.mapCenter?.('home')))!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === 'home', undefined, { timeout: 30_000 });
    expect(await story(page)).toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.storyStepCenter(0))).toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.hudPulsing('map'))).toBe(false);
    // Without him the stand has no story to tell.
    await travel(page, 'falafel');
    expect(await story(page)).toBeNull();
  });

  test('a finished story is told again on the next visit', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true, level: 1 });
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
    await travel(page, 'home');
    await travel(page, 'falafel');
    expect(await story(page)).toMatchObject({ id: 'pita', step: 0 });
    expect((await page.evaluate(() => window.__shchuna!.state())).stories.done).toHaveLength(1);
  });

  test('without stories the map has no guide', async ({ page }) => {
    await openGame(page, 'map');
    expect(await page.evaluate(() => window.__shchuna!.mapGuide?.() ?? null)).toBeNull();
  });

  test('nothing starts unless stories are on', async ({ page }) => {
    await openGame(page, 'falafel');
    expect(await story(page)).toBeNull();
    expect(await spoken(page)).not.toContain('story.pita.open');
  });
});

test.describe('the guide on the map', () => {
  const mapGuide = (page: Page) => page.evaluate(() => window.__shchuna!.mapGuide?.() ?? null);
  const openings = async (page: Page) => (await spoken(page)).filter((line) => line === 'story.pita.open').length;
  const enter = async (page: Page, place: string) => {
    await tap(page, (await page.evaluate((id) => window.__shchuna!.mapCenter?.(id), place))!);
    await page.waitForFunction(
      (id) => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === id,
      place,
      { timeout: 30_000 },
    );
  };
  const toMap = async (page: Page) => {
    await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'map');
  };

  test('the guide waits by the falafel stand and says how the story begins', async ({ page }, testInfo) => {
    await openGame(page, 'map', { stories: true, level: 2 });
    const guide = await mapGuide(page);
    expect(guide?.place).toBe('falafel');
    await expect.poll(() => openings(page), { timeout: 15_000 }).toBe(1);
    expect(await spoken(page)).not.toContain('map.where');
    expect(await story(page)).toBeNull();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `docs/screens/story-map-${testInfo.project.name}.png` });
    // Tapping the guide says it again.
    await tap(page, guide!.center);
    await expect.poll(() => openings(page), { timeout: 15_000 }).toBe(2);
  });

  test('going into the stand from the map starts the story, without the opening twice', async ({ page }) => {
    await openGame(page, 'map', { stories: true, level: 2 });
    await expect.poll(() => openings(page), { timeout: 15_000 }).toBe(1);
    // Heard to its end: a line cut off in the middle is said again in the place.
    await page.waitForTimeout(5000);
    await enter(page, 'falafel');
    expect(await story(page)).toMatchObject({ id: 'pita', step: 0 });
    await expect.poll(async () => (await spoken(page)).includes('story.pita.fill'), { timeout: 15_000 }).toBe(true);
    expect(await openings(page)).toBe(1);
  });

  test('walking in before the guide has finished speaking still hears how the story begins', async ({ page }) => {
    await openGame(page, 'map', { stories: true, level: 2 });
    // Straight in, while the welcome is still being said.
    await enter(page, 'falafel');
    await expect.poll(async () => (await spoken(page)).includes('story.pita.fill'), { timeout: 15_000 }).toBe(true);
    const lines = await spoken(page);
    expect(lines.lastIndexOf('story.pita.open')).toBeGreaterThan(lines.lastIndexOf('place.falafel'));
  });

  test('another place starts no story, and the offer is still there afterwards', async ({ page }) => {
    test.slow();
    await openGame(page, 'map', { stories: true, level: 2 });
    await enter(page, 'home');
    expect(await story(page)).toBeNull();
    await toMap(page);
    expect((await mapGuide(page))?.place).toBe('falafel');
    // Said once already today: the map asks where to, as it always did.
    await expect.poll(() => lastLine(page)).toBe('map.where');
  });

  test('with a story in progress the guide stands where it goes on, and says nothing new', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await expect.poll(() => openings(page), { timeout: 15_000 }).toBe(1);
    await toMap(page);
    expect((await mapGuide(page))?.place).toBe('falafel');
    await page.waitForTimeout(1500);
    expect(await openings(page)).toBe(1);
  });

  test('a story put away leaves the map without a guide', async ({ page }) => {
    await openGame(page, 'falafel', { stories: true, level: 2 });
    await stripReady(page);
    await tap(page, (await page.evaluate(() => window.__shchuna!.storyGuideCenter()))!);
    await expect.poll(() => story(page)).toBeNull();
    await toMap(page);
    expect(await mapGuide(page)).toBeNull();
  });

  test('an idle child on the map is shown the place the story starts in', async ({ page }) => {
    await openGame(page, 'map', { stories: true, level: 2, query: 'hintMs=3000' });
    await expect.poll(() => page.evaluate(() => window.__shchuna!.lastHint()), { timeout: 20_000 }).toBe('falafel');
  });
});

test.describe('the sticker album', () => {
  const inBook = (page: Page, id: string) => page.evaluate((what) => window.__shchuna!.bookCenter?.(what) ?? null, id);
  const openBook = async (page: Page) => {
    await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('book')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'book');
  };
  const stickerLines = async (page: Page) => (await spoken(page)).filter((line) => line === 'story.sticker').length;

  test('the album shows the story sticker waiting, and says its name', async ({ page }, testInfo) => {
    await openGame(page, 'home', { stories: true, level: 1 });
    await openBook(page);
    expect(await inBook(page, 'sticker:pita')).toBeNull();
    await tap(page, (await inBook(page, 'tab-stickers'))!);
    await expect.poll(() => inBook(page, 'sticker:pita')).not.toBeNull();
    expect(await inBook(page, 'א')).toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.bookSticker?.('pita') ?? null)).toBe('waiting');
    await tap(page, (await inBook(page, 'sticker:pita'))!);
    await expect.poll(() => lastLine(page)).toBe('story.pita.name');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screens/story-album-${testInfo.project.name}.png` });
    // And back to the letters.
    await tap(page, (await inBook(page, 'tab-letters'))!);
    await expect.poll(() => inBook(page, 'א')).not.toBeNull();
    expect(await inBook(page, 'sticker:pita')).toBeNull();
  });

  test('a story finished for the first time gives a sticker, and only once', async ({ page }) => {
    test.setTimeout(240_000);
    await openGame(page, 'falafel', { stories: true, level: 1 });
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
    await expect.poll(() => stickerLines(page), { timeout: 15_000 }).toBe(1);
    // And there it is in the album, in colour.
    await page.waitForTimeout(2500);
    await openBook(page);
    await tap(page, (await inBook(page, 'tab-stickers'))!);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.bookSticker?.('pita') ?? null)).toBe('earned');
    await tap(page, (await inBook(page, 'done'))!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
    // Told again, it ends with the cheer alone.
    await travel(page, 'home');
    await travel(page, 'falafel');
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await carryToGrandpa(page, PITA);
    await expect.poll(() => story(page)).toBeNull();
    await page.waitForTimeout(4000);
    expect(await stickerLines(page)).toBe(1);
    expect((await spoken(page)).filter((line) => line === 'story.pita.done')).toHaveLength(2);
  });

  test('without stories the book has no sticker page', async ({ page }) => {
    await openGame(page, 'home');
    await openBook(page);
    expect(await inBook(page, 'tab-stickers')).toBeNull();
    expect(await inBook(page, 'tab-letters')).toBeNull();
    expect(await inBook(page, 'א')).not.toBeNull();
  });
});
