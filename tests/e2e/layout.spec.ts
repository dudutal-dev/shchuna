import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { tap, tapToStart } from './helpers';

type Point = { x: number; y: number };

/** Short phones held sideways, and one with a notch on each side (as an iPhone in landscape). */
const PHONES = [
  { name: 'iphone-se', width: 667, height: 375, notch: 0 },
  { name: 'small-android', width: 640, height: 360, notch: 0 },
  { name: 'notch', width: 844, height: 390, notch: 47 },
  // Safari with its address bar showing, in landscape: the shortest screen a child gets.
  { name: 'safari-bar', width: 844, height: 330, notch: 47 },
];
const CATEGORIES = ['body', 'skin', 'hair', 'clothes', 'accessory'];
const MIN = 64;

/** Every button lies whole on the screen, clear of the notch, and no two overlap. */
function checkButtons(points: Point[], size: { width: number; height: number }, notch: number): void {
  const half = MIN / 2;
  for (const p of points) {
    expect(p.x - half, `left of ${JSON.stringify(p)}`).toBeGreaterThanOrEqual(notch);
    expect(p.x + half, `right of ${JSON.stringify(p)}`).toBeLessThanOrEqual(size.width - notch);
    expect(p.y - half).toBeGreaterThanOrEqual(0);
    expect(p.y + half, `bottom of ${JSON.stringify(p)}`).toBeLessThanOrEqual(size.height);
  }
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i]!;
      const b = points[j]!;
      const apart = Math.abs(a.x - b.x) >= MIN || Math.abs(a.y - b.y) >= MIN;
      expect(apart, `buttons at ${JSON.stringify(a)} and ${JSON.stringify(b)} overlap`).toBe(true);
    }
  }
}

async function open(page: Page, phone: (typeof PHONES)[number]): Promise<void> {
  await page.setViewportSize({ width: phone.width, height: phone.height });
  await page.goto(`./?e2e&scene=home&notch=${phone.notch}`);
  await tapToStart(page);
}

for (const phone of PHONES) {
  test(`buttons fit a ${phone.name} (${phone.width}×${phone.height})`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'iphone', 'phones only');
    await open(page, phone);
    const size = { width: phone.width, height: phone.height };
    const hud = await page.evaluate(() =>
      (['undo', 'family', 'map', 'book', 'lock'] as const).map((id) => window.__shchuna!.hudCenter(id)),
    );
    const arrow = await page.evaluate(() => window.__shchuna!.arrowCenter('left'));
    checkButtons([...hud, ...(arrow ? [arrow] : [])], size, phone.notch);
    await page.screenshot({ path: `docs/screens/layout-${phone.name}-home.png` });

    // The character creator: every category reachable, none cut off.
    await tap(page, hud[1]!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'creator');
    const controls = await page.evaluate(
      (ids) => [...ids, 'done'].map((id) => window.__shchuna!.creatorCenter?.(id) ?? null),
      CATEGORIES,
    );
    expect(controls.every(Boolean)).toBe(true);
    checkButtons(controls as Point[], size, phone.notch);
    await page.screenshot({ path: `docs/screens/layout-${phone.name}-creator.png` });
  });
}
