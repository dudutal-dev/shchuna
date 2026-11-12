import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, scrollTo, tap, tapToStart } from './helpers';

type Point = { x: number; y: number };

const found = (page: Page) =>
  page.evaluate(() =>
    window.__shchuna!.state().letters.filter((l) => l.found).map((l) => l.letter),
  );
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());

async function point(page: Page, read: () => Point | null | undefined): Promise<Point> {
  const at = await page.evaluate(read);
  if (!at) throw new Error('not on screen');
  return at;
}

async function openBook(page: Page): Promise<void> {
  await tap(page, await point(page, () => window.__shchuna!.hudCenter('book')));
  await page.waitForFunction(() => window.__shchuna?.stage === 'book');
}

test.describe('letter hunt', () => {
  // SPEC §16.2 flow 4.
  test('finding lamed on the bread puts it in the letter book', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await scrollTo(page, 'kitchen-table');
    expect(await found(page)).toEqual([]);
    await page.screenshot({ path: `docs/screens/m6-sparkle-${testInfo.project.name}.png` });

    await tap(page, await point(page, () => window.__shchuna!.letterCenter('bread')));
    await expect.poll(() => found(page)).toEqual(['ל']);
    expect(await spoken(page)).toContain('letter.found.lamed');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `docs/screens/m6-found-${testInfo.project.name}.png` });

    // Once found, the sparkle is gone; the bread is just bread again.
    await expect.poll(() => page.evaluate(() => window.__shchuna!.letterCenter('bread'))).toBeNull();

    // Let it fly into the book before opening it.
    await page.waitForTimeout(3400);
    await openBook(page);
    await page.screenshot({ path: `docs/screens/m6-book-${testInfo.project.name}.png` });
    await tap(page, await point(page, () => window.__shchuna!.bookCenter?.('ל')));
    await expect.poll(async () => (await spoken(page)).slice(-1)).toEqual(['letter.name.lamed']);
    await expect.poll(async () => (await spoken(page)).slice(-2), { timeout: 10_000 }).toEqual([
      'letter.name.lamed',
      'prop.bread',
    ]);
    const lamed = await page.evaluate(() =>
      window.__shchuna!.state().letters.find((l) => l.letter === 'ל'),
    );
    expect(lamed?.timesHeard).toBe(1);
  });

  test('a letter not found yet gives a hint about where to look', async ({ page }) => {
    await openGame(page, 'home');
    await openBook(page);
    await tap(page, await point(page, () => window.__shchuna!.bookCenter?.('ח')));
    await expect.poll(async () => (await spoken(page)).slice(-1)).toEqual(['letter.hint.kitchen']);
    await tap(page, await point(page, () => window.__shchuna!.bookCenter?.('מ')));
    await expect.poll(async () => (await spoken(page)).slice(-1)).toEqual(['letter.hint.station']);
    await tap(page, await point(page, () => window.__shchuna!.bookCenter?.('done')));
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
  });

  test('a letter inside the closed fridge appears when it opens, and stays found after a refresh', async ({
    page,
  }) => {
    await openGame(page, 'home');
    // Milk is in the closed fridge, so its letter is out of sight.
    expect(await page.evaluate(() => window.__shchuna!.isVisible('milk'))).toBe(false);
    await tap(page, await scrollTo(page, 'fridge'));
    await expect.poll(() => page.evaluate(() => window.__shchuna!.isVisible('milk'))).toBe(true);
    await tap(page, await point(page, () => window.__shchuna!.letterCenter('milk')));
    await expect.poll(() => found(page)).toEqual(['ח']);

    await page.evaluate(() => window.__shchuna?.flushSave());
    await page.reload();
    await tapToStart(page);
    expect(await found(page)).toEqual(['ח']);
    expect(await page.evaluate(() => window.__shchuna!.letterCenter('milk'))).toBeNull();
    // The other letters are still waiting.
    expect(await page.evaluate(() => window.__shchuna!.letterCenter('cake'))).not.toBeNull();
  });

  test('alef waits on the watermelon in the makolet', async ({ page }, testInfo) => {
    await openGame(page, 'makolet');
    await scrollTo(page, 'mk-watermelon');
    await tap(page, await point(page, () => window.__shchuna!.letterCenter('mk-watermelon')));
    await expect.poll(() => found(page)).toEqual(['א']);
    expect(await spoken(page)).toContain('letter.found.alef');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `docs/screens/m9-alef-${testInfo.project.name}.png` });
  });
});

test('yod hides on the moon in the kids-room window', async ({ page }) => {
  // Scrolls across the whole house: slow on software-rendered WebGL.
  test.slow();
  await openGame(page, 'home');
  await tap(page, await scrollTo(page, 'moon'));
  await expect
    .poll(() =>
      page.evaluate(() => window.__shchuna!.state().letters.filter((l) => l.found).map((l) => l.letter)),
    )
    .toEqual(['י']);
});

test('a found letter can be painted with a finger, and painting most of it gets a "well done"', async ({
  page,
}, testInfo) => {
  test.slow();
  await openGame(page, 'home');
  await scrollTo(page, 'kitchen-table');
  await tap(page, (await page.evaluate(() => window.__shchuna!.letterCenter('bread')))!);
  // Let lamed fly into the book, then open the book and tap it.
  await page.waitForTimeout(3600);
  await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('book')));
  await page.waitForFunction(() => window.__shchuna?.stage === 'book');
  await tap(page, (await page.evaluate(() => window.__shchuna!.bookCenter?.('ל')))!);
  await expect.poll(() => page.evaluate(() => window.__shchuna!.painter?.() ?? null)).not.toBeNull();

  // A finger runs over the whole letter, sent from inside the page so it is quick.
  await page.evaluate(() => {
    const info = window.__shchuna!.painter!()!;
    const canvas = document.querySelector('canvas')!;
    const send = (type: string, p: { x: number; y: number }) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 9,
          pointerType: 'touch',
          isPrimary: true,
          clientX: p.x,
          clientY: p.y,
          bubbles: true,
          buttons: type === 'pointerup' ? 0 : 1,
        }),
      );
    send('pointerdown', info.points[0]!);
    for (const p of info.points) send('pointermove', p);
    send('pointerup', info.points[info.points.length - 1]!);
  });
  await expect
    .poll(() => page.evaluate(() => window.__shchuna!.painter?.()?.progress ?? 0))
    .toBeGreaterThan(0.6);
  await expect.poll(() => page.evaluate(() => window.__shchuna!.spoken())).toContain('react.wellDone');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `docs/screens/paint-letter-${testInfo.project.name}.png` });

  const done = await page.evaluate(() => window.__shchuna!.painter!()!.done);
  await tap(page, done);
  await expect.poll(() => page.evaluate(() => window.__shchuna!.painter?.() ?? null)).toBeNull();
  expect(await page.evaluate(() => window.__shchuna!.stage)).toBe('book');
});
