import type { Page } from '@playwright/test';

export interface Point {
  x: number;
  y: number;
}

/** A place to open straight into, or 'map' for the real way in: start screen, then map. */
export type SceneName =
  | 'home'
  | 'makolet'
  | 'gan'
  | 'clinic'
  | 'falafel'
  | 'beach'
  | 'station'
  | 'playground'
  | 'map';

/** Waits for the start screen, with the test hook on. */
export async function openStartScreen(page: Page, scene: SceneName = 'playground'): Promise<void> {
  await page.goto(scene === 'map' ? './?e2e' : `./?e2e&scene=${scene}`);
  await page.waitForFunction(() => window.__shchuna?.stage === 'start');
}

/** Gets past the start screen on a page that has just loaded. */
export async function tapToStart(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__shchuna?.stage === 'start');
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  await page.touchscreen.tap(size.width / 2, size.height / 2);
  await page.waitForFunction(() => ['playing', 'map'].includes(window.__shchuna?.stage ?? ''));
}

/** From inside a place: back to the map, then into another place. */
export async function travel(page: Page, place: string): Promise<void> {
  await tap(page, await page.evaluate(() => window.__shchuna!.hudCenter('map')));
  await page.waitForFunction(() => window.__shchuna?.stage === 'map');
  const at = await page.evaluate((id) => window.__shchuna!.mapCenter?.(id), place);
  if (!at) throw new Error(`No place on the map: ${place}`);
  await tap(page, at);
  // A letter found on the way in takes a few seconds to fly into the book.
  await page.waitForFunction(
    (id) => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === id,
    place,
    { timeout: 30_000 },
  );
}

/** Opens the game and goes straight into play. */
export async function openGame(page: Page, scene: SceneName = 'playground'): Promise<void> {
  await openStartScreen(page, scene);
  await tapToStart(page);
}

/** Drags the room sideways until a prop is in the middle third of the screen. */
export async function scrollTo(page: Page, id: string): Promise<Point> {
  const size = page.viewportSize();
  if (!size) throw new Error('no viewport');
  let previous: number | null = null;
  for (let i = 0; i < 12; i++) {
    const center = await propCenter(page, id);
    const offset = size.width / 2 - center.x;
    if (Math.abs(offset) < size.width / 6) return center;
    // At the end of the room it can't move further; on screen is good enough then.
    if (previous !== null && Math.abs(center.x - previous) < 2) return center;
    previous = center.x;
    const step = Math.sign(offset) * Math.min(Math.abs(offset), size.width - 320);
    // The top strip of wall is above every prop. Leftward drags start left of the
    // book and door buttons in the top-right corner.
    const y = 30;
    const from = step > 0 ? 100 : size.width - 220;
    // Held still before letting go, so the room stops there instead of gliding on.
    await touchDrag(page, { x: from, y }, { x: from + step, y }, 600);
  }
  return propCenter(page, id);
}

export async function propCenter(page: Page, id: string): Promise<Point> {
  const center = await page.evaluate((prop) => window.__shchuna?.center(prop), id);
  if (!center) throw new Error(`Prop not on screen: ${id}`);
  return center;
}

export async function propState(page: Page, id: string) {
  const state = await page.evaluate(() => window.__shchuna?.state());
  const prop = state?.props.find((p) => p.id === id);
  if (!prop) throw new Error(`No such prop: ${id}`);
  return prop;
}

export async function tap(page: Page, point: Point): Promise<void> {
  await page.touchscreen.tap(point.x, point.y);
}

/** A touch through the browser's own touch pipeline, held still for `holdMs`. */
export async function touchHold(page: Page, at: Point, holdMs: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

/** A touch drag through several points, pausing `holdMs` at each one before moving on. */
export async function touchPath(
  page: Page,
  points: ReadonlyArray<{ x: number; y: number; holdMs?: number }>,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: Point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
    });
  const [first, ...rest] = points;
  if (!first) return;
  await touch('touchStart', first);
  let from: Point = first;
  for (const point of rest) {
    for (let i = 1; i <= 12; i++) {
      await touch('touchMove', {
        x: from.x + ((point.x - from.x) * i) / 12,
        y: from.y + ((point.y - from.y) * i) / 12,
      });
    }
    if (point.holdMs) await page.waitForTimeout(point.holdMs);
    from = point;
  }
  await touch('touchEnd');
  await cdp.detach();
}

/** A real touch drag, sent through the browser's touch pipeline. */
export async function touchDrag(page: Page, from: Point, to: Point, holdMs = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', point?: Point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point ? [{ x: point.x, y: point.y }] : [],
    });
  await touch('touchStart', from);
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    });
  }
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await touch('touchEnd');
  await cdp.detach();
}
