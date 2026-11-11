import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, scrollTo, tap, touchDrag, touchPath, travel } from './helpers';

type Point = { x: number; y: number };

/** Between the shop and the home, by way of the map. */
async function goOut(page: Page): Promise<void> {
  const here = await page.evaluate(() => window.__shchuna!.here());
  await travel(page, here === 'makolet' ? 'home' : 'makolet');
}

const hookPoint = async (page: Page, read: () => Point | null | undefined): Promise<Point> => {
  const point = await page.evaluate(read);
  if (!point) throw new Error('not on screen');
  return point;
};

const wallet = (page: Page) => page.evaluate(() => window.__shchuna!.state().wallet);
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());

/** Carries a shelf product to the checkout belt, scrolling the shop along the way. */
async function toBelt(page: Page, id: string): Promise<void> {
  const size = page.viewportSize()!;
  const scale = size.height / 600;
  // Held at the left edge, the shop scrolls towards the checkout; then the product is put
  // down on the floor left of centre, above the coin strip. How far one hold scrolls
  // depends on the frame rate, so carry it again until it reaches the checkout.
  const worldX = async () =>
    (await page.evaluate((i) => window.__shchuna!.state().props.find((p) => p.id === i), id))!.x;
  for (let carry = 0; carry < 5 && (await worldX()) > 900; carry++) {
    const start = await scrollTo(page, id);
    await touchPath(page, [
      start,
      { x: 30, y: start.y + 100 * scale, holdMs: 2000 },
      { x: size.width * 0.3, y: size.height - 90 },
    ]);
    await page.waitForTimeout(500);
  }
  await scrollTo(page, 'mk-counter');
  const onBelt = async () => {
    const state = await page.evaluate(() => window.__shchuna!.state());
    return state.props.find((p) => p.id === id)?.on === 'belt';
  };
  // A small hand misses sometimes and simply tries again; so does this test.
  for (let attempt = 0; attempt < 3 && !(await onBelt()); attempt++) {
    // Let the product settle before measuring where it is.
    await page.waitForTimeout(500);
    const belt = await hookPoint(page, () => window.__shchuna!.surfaceCenter('belt'));
    const item = await propCenter(page, id);
    // The finger holds a product by its middle, about 30 units above where it stands.
    await touchDrag(page, item, { x: belt.x, y: belt.y - 30 * scale });
  }
  await expect.poll(onBelt).toBe(true);
}

test.describe('makolet', () => {
  test.slow();

  test('the shop opens with stocked shelves, then the checkout', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await goOut(page);
    await page.screenshot({ path: `docs/screens/m5-shelves-${testInfo.project.name}.png` });
    await scrollTo(page, 'mk-counter');
    await page.screenshot({ path: `docs/screens/m5-checkout-${testInfo.project.name}.png` });
  });

  // SPEC §16.2 flow 3.
  test('bread costs 3, paying 5 gives 2 change, and the bread is in the fridge at home', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    await goOut(page);
    const startWallet = await wallet(page);

    await toBelt(page, 'mk-bread');
    await expect.poll(() => spoken(page)).toEqual(
      expect.arrayContaining(['prop.bread', 'count.shekels.3']),
    );

    const coin = await hookPoint(page, () => window.__shchuna!.coinCenter(5));
    const tray = await hookPoint(page, () => window.__shchuna!.trayCenter());
    await touchDrag(page, coin, tray);

    await expect.poll(() => wallet(page)).toBe(startWallet - 5 + 2);
    // Each line waits for the one before it to finish, so the whole answer takes a few seconds.
    await expect
      .poll(async () => (await spoken(page)).slice(-4), { timeout: 15_000 })
      .toEqual(['count.shekels.5', 'shop.change', 'count.shekels.2', 'shop.thanks']);
    await page.screenshot({ path: `docs/screens/m5-paid-${testInfo.project.name}.png` });

    // The shelf is restocked.
    const shelfBread = await page.evaluate(() =>
      window.__shchuna!.state().props.find((p) => p.id === 'mk-bread'),
    );
    expect(shelfBread?.on).toBe('shelf-b-2');

    await goOut(page);
    const bought = await page.evaluate(() =>
      window.__shchuna!.state().props.filter((p) => p.id.startsWith('bought-')),
    );
    expect(bought).toHaveLength(1);
    expect(bought[0]).toMatchObject({ defId: 'bread', location: 'home', on: 'fridge-1' });
    await tap(page, await scrollTo(page, 'fridge'));
    await expect.poll(() => page.evaluate((id) => window.__shchuna!.isVisible(id), bought[0]!.id)).toBe(true);
    await page.screenshot({ path: `docs/screens/m5-fridge-${testInfo.project.name}.png` });
  });

  test('a coin with nothing on the belt goes back to the purse', async ({ page }) => {
    await openGame(page, 'home');
    await goOut(page);
    const before = await wallet(page);
    await tap(page, await hookPoint(page, () => window.__shchuna!.coinCenter(1)));
    await page.waitForTimeout(400);
    expect(await wallet(page)).toBe(before);
  });

  test('the piggy bank at home fills the purse', async ({ page }) => {
    await openGame(page, 'home');
    const before = await wallet(page);
    await tap(page, await scrollTo(page, 'piggy'));
    await expect.poll(() => wallet(page)).toBe(before + 10);
    expect(await page.evaluate(() => window.__shchuna!.lastLine())).toBe('shop.piggy');
  });
});
