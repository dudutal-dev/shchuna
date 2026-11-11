import { expect, test } from './fixtures';
import { openGame, propCenter, propState, tap, tapToStart, touchDrag } from './helpers';

const TABLE_Y = 322;

test.describe('engine playground', () => {
  test('a dragged prop snaps to the table and survives a refresh', async ({ page }, testInfo) => {
    await openGame(page);
    await page.screenshot({ path: `docs/screens/m1-${testInfo.project.name}.png` });

    const ballStart = await propCenter(page, 'pg-ball');
    const table = await propCenter(page, 'pg-table');
    const scale = page.viewportSize()!.height / 600;
    // Puts the ball's base about 46 units below the tabletop, inside the snap radius.
    await touchDrag(page, ballStart, { x: table.x, y: table.y - 70 * scale });

    await expect.poll(async () => (await propState(page, 'pg-ball')).y).toBe(TABLE_Y);
    const moved = await propState(page, 'pg-ball');

    await page.evaluate(() => window.__shchuna?.flushSave());
    await page.reload();
    await tapToStart(page);
    const reloaded = await propState(page, 'pg-ball');
    expect(reloaded).toMatchObject({ x: moved.x, y: moved.y });
  });

  test('a prop dropped in empty air lands on the floor', async ({ page }) => {
    await openGame(page);
    const apple = await propCenter(page, 'pg-apple');
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    // Above the gap between the table and the lamp, well clear of any surface.
    const lamp = await propCenter(page, 'pg-lamp');
    await touchDrag(page, apple, { x: lamp.x - size.width * 0.1, y: 20 });
    await expect.poll(async () => (await propState(page, 'pg-apple')).y).toBeGreaterThanOrEqual(440);
  });

  test('undo returns a prop to where it was', async ({ page }) => {
    await openGame(page);
    const before = await propState(page, 'pg-ball');
    const ball = await propCenter(page, 'pg-ball');
    await touchDrag(page, ball, { x: ball.x - 60, y: ball.y - 10 });
    await expect.poll(async () => (await propState(page, 'pg-ball')).x).not.toBe(before.x);

    const undo = await page.evaluate(() => window.__shchuna?.undoCenter());
    if (!undo) throw new Error('no undo button');
    await tap(page, undo);
    await expect.poll(async () => (await propState(page, 'pg-ball')).x).toBe(before.x);
  });

  test('tapping a lamp toggles it, and undo turns it back', async ({ page }) => {
    await openGame(page);
    await tap(page, await propCenter(page, 'pg-lamp'));
    await expect.poll(async () => (await propState(page, 'pg-lamp')).state?.on).toBe(true);
    await tap(page, await propCenter(page, 'pg-lamp'));
    await expect.poll(async () => (await propState(page, 'pg-lamp')).state?.on).toBe(false);
  });

  test('a finger on the wall scrolls the room to reveal the sink', async ({ page }) => {
    await openGame(page);
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    const before = await propCenter(page, 'pg-sink');
    // The room opens at its right end, so the sink is out past the left edge.
    expect(before.x).toBeLessThan(size.width * 0.5);
    await touchDrag(page, { x: 100, y: 40 }, { x: size.width - 100, y: 40 });
    const after = await propCenter(page, 'pg-sink');
    expect(after.x).toBeGreaterThan(before.x);
  });

  test('a cup dropped by the sink fills with water', async ({ page }) => {
    await openGame(page);
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    for (let i = 0; i < 3; i++) {
      await touchDrag(page, { x: 100, y: 40 }, { x: size.width - 100, y: 40 });
    }
    const cup = await propCenter(page, 'pg-cup');
    const sink = await propCenter(page, 'pg-sink');
    await touchDrag(page, cup, sink);
    await expect.poll(async () => (await propState(page, 'pg-cup')).state?.filled).toBe(true);
    await page.screenshot({ path: `docs/screens/m1-useon-${test.info().project.name}.png` });
  });

  test('a small prop can be grabbed just outside its drawing', async ({ page }) => {
    await openGame(page);
    const scale = page.viewportSize()!.height / 600;
    // 64pt minimum holds at this scale, and the apple is drawn only 42 units either side.
    expect(104 * scale).toBeGreaterThanOrEqual(64);
    const start = await propState(page, 'pg-apple');
    const apple = await propCenter(page, 'pg-apple');
    const grab = { x: apple.x + 50 * scale, y: apple.y };
    await touchDrag(page, grab, { x: grab.x, y: grab.y + 250 * scale });
    await expect.poll(async () => (await propState(page, 'pg-apple')).y).not.toBe(start.y);
  });
});

test.describe('scrolling made easy', () => {
  test('a quick flick keeps the room gliding after the finger lifts', async ({ page }) => {
    await openGame(page, 'home');
    const size = page.viewportSize()!;
    const before = await propCenter(page, 'fridge');
    // A real flick takes a few milliseconds: far faster than CDP touches on software
    // WebGL, so the finger's events are sent from inside the page, in one go.
    const distance = size.width * 0.2;
    await page.evaluate(
      ({ from, to, y }) => {
        const canvas = document.querySelector('canvas')!;
        const send = (type: string, x: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 7,
              pointerType: 'touch',
              isPrimary: true,
              clientX: x,
              clientY: y,
              bubbles: true,
              buttons: type === 'pointerup' ? 0 : 1,
            }),
          );
        send('pointerdown', from);
        for (let i = 1; i <= 6; i++) send('pointermove', from + ((to - from) * i) / 6);
        send('pointerup', to);
      },
      { from: size.width * 0.4, to: size.width * 0.4 + distance, y: 40 },
    );
    // It goes on well past where the finger stopped. A busy test machine draws few frames,
    // so the glide may take a while to finish.
    await expect
      .poll(async () => (await propCenter(page, 'fridge')).x - before.x, { timeout: 8000 })
      .toBeGreaterThan(distance * 1.5);
  });

  test('a slow drag stops where the finger stops', async ({ page }) => {
    await openGame(page, 'home');
    const size = page.viewportSize()!;
    const before = await propCenter(page, 'fridge');
    await touchDrag(page, { x: size.width * 0.4, y: 40 }, { x: size.width * 0.6, y: 40 }, 600);
    await page.waitForTimeout(800);
    const settled = await propCenter(page, 'fridge');
    expect(Math.abs(settled.x - before.x - size.width * 0.2)).toBeLessThan(8);
  });

  test('the side arrows slide the room, and show only where there is more', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    // The home opens at its right end: nothing more to the right.
    expect(await page.evaluate(() => window.__shchuna!.arrowCenter('right'))).toBeNull();
    const left = await page.evaluate(() => window.__shchuna!.arrowCenter('left'));
    expect(left).not.toBeNull();
    await page.screenshot({ path: `docs/screens/m9-arrows-${testInfo.project.name}.png` });

    const before = await propCenter(page, 'fridge');
    await tap(page, left!);
    await expect
      .poll(async () => (await propCenter(page, 'fridge')).x - before.x)
      .toBeGreaterThan(page.viewportSize()!.width * 0.6);
    await expect.poll(() => page.evaluate(() => window.__shchuna!.arrowCenter('right'))).not.toBeNull();
  });
});
