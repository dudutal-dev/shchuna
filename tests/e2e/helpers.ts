import type { Page } from '@playwright/test';

export interface Point {
  x: number;
  y: number;
}

/** Waits for the game, opened with the test hook on. */
export async function openGame(page: Page): Promise<void> {
  await page.goto('./?e2e');
  await page.waitForFunction(() => window.__shchuna !== undefined);
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

/** A real touch drag, sent through the browser's touch pipeline. */
export async function touchDrag(page: Page, from: Point, to: Point, holdMs = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: string, point?: Point) =>
    cdp.send('Input.dispatchTouchEvent', {
      type: type as 'touchStart',
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
