import { expect, test } from './fixtures';
import { openGame, propCenter, propState, tap, touchDrag } from './helpers';

const TABLE_Y = 322;

test.describe('engine playground', () => {
  test('a dragged prop snaps to the table and survives a refresh', async ({ page }, testInfo) => {
    await openGame(page);
    await page.screenshot({ path: `docs/screens/m1-${testInfo.project.name}.png` });

    const ballStart = await propCenter(page, 'ball');
    const table = await propCenter(page, 'table');
    const scale = page.viewportSize()!.height / 600;
    // Puts the ball's base about 46 units below the tabletop, inside the snap radius.
    await touchDrag(page, ballStart, { x: table.x, y: table.y - 70 * scale });

    await expect.poll(async () => (await propState(page, 'ball')).y).toBe(TABLE_Y);
    const moved = await propState(page, 'ball');

    await page.evaluate(() => window.__shchuna?.flushSave());
    await page.reload();
    await page.waitForFunction(() => window.__shchuna !== undefined);
    const reloaded = await propState(page, 'ball');
    expect(reloaded).toMatchObject({ x: moved.x, y: moved.y });
  });

  test('a prop dropped in empty air lands on the floor', async ({ page }) => {
    await openGame(page);
    const apple = await propCenter(page, 'apple');
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    // Above the gap between the table and the lamp, well clear of any surface.
    const lamp = await propCenter(page, 'lamp');
    await touchDrag(page, apple, { x: lamp.x - size.width * 0.1, y: 20 });
    await expect.poll(async () => (await propState(page, 'apple')).y).toBeGreaterThanOrEqual(440);
  });

  test('undo returns a prop to where it was', async ({ page }) => {
    await openGame(page);
    const before = await propState(page, 'ball');
    const ball = await propCenter(page, 'ball');
    await touchDrag(page, ball, { x: ball.x - 60, y: ball.y - 10 });
    await expect.poll(async () => (await propState(page, 'ball')).x).not.toBe(before.x);

    const undo = await page.evaluate(() => window.__shchuna?.undoCenter());
    if (!undo) throw new Error('no undo button');
    await tap(page, undo);
    await expect.poll(async () => (await propState(page, 'ball')).x).toBe(before.x);
  });

  test('tapping a lamp toggles it, and undo turns it back', async ({ page }) => {
    await openGame(page);
    await tap(page, await propCenter(page, 'lamp'));
    await expect.poll(async () => (await propState(page, 'lamp')).state?.on).toBe(true);
    await tap(page, await propCenter(page, 'lamp'));
    await expect.poll(async () => (await propState(page, 'lamp')).state?.on).toBe(false);
  });

  test('a finger on the wall scrolls the room to reveal the sink', async ({ page }) => {
    await openGame(page);
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    const before = await propCenter(page, 'sink');
    // The room opens at its right end, so the sink is out past the left edge.
    expect(before.x).toBeLessThan(size.width * 0.5);
    await touchDrag(page, { x: 100, y: 40 }, { x: size.width - 100, y: 40 });
    const after = await propCenter(page, 'sink');
    expect(after.x).toBeGreaterThan(before.x);
  });

  test('a cup dropped by the sink fills with water', async ({ page }) => {
    await openGame(page);
    const size = page.viewportSize();
    if (!size) throw new Error('no viewport');
    for (let i = 0; i < 3; i++) {
      await touchDrag(page, { x: 100, y: 40 }, { x: size.width - 100, y: 40 });
    }
    const cup = await propCenter(page, 'cup');
    const sink = await propCenter(page, 'sink');
    await touchDrag(page, cup, sink);
    await expect.poll(async () => (await propState(page, 'cup')).state?.filled).toBe(true);
    await page.screenshot({ path: `docs/screens/m1-useon-${test.info().project.name}.png` });
  });

  test('a small prop can be grabbed just outside its drawing', async ({ page }) => {
    await openGame(page);
    const scale = page.viewportSize()!.height / 600;
    // 64pt minimum holds at this scale, and the apple is drawn only 42 units either side.
    expect(104 * scale).toBeGreaterThanOrEqual(64);
    const start = await propState(page, 'apple');
    const apple = await propCenter(page, 'apple');
    const grab = { x: apple.x + 50 * scale, y: apple.y };
    await touchDrag(page, grab, { x: grab.x, y: grab.y + 250 * scale });
    await expect.poll(async () => (await propState(page, 'apple')).y).not.toBe(start.y);
  });
});
