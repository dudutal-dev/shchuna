import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag, travel } from './helpers';

const isVisible = (page: Page, id: string) =>
  page.evaluate((prop) => window.__shchuna?.isVisible(prop) ?? false, id);

test.describe('falafel stand', () => {
  test('the map opens into the stand, with a customer at a terrace table', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    await travel(page, 'falafel');
    const customer = await page.evaluate(() =>
      window.__shchuna!.state().characters.find((c) => c.id === 'falafel-2'),
    );
    expect(customer).toMatchObject({ on: 'stool-2', pose: 'sit' });
    expect(await page.evaluate(() => window.__shchuna!.music())).toBe('audio/music/falafel.mp3');
    await page.screenshot({ path: `docs/screens/m9-falafel-${testInfo.project.name}.png` });
  });

  test('falafel goes into the pita, the cook eats it, and it comes back empty', async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'falafel');
    const scale = page.viewportSize()!.height / 600;
    await tap(page, await scrollTo(page, 'falafel-fryer'));
    await expect.poll(async () => (await propState(page, 'falafel-fryer')).state?.frying).toBe(true);

    await scrollTo(page, 'falafel-falafel-bowl');
    const bowlBefore = await propState(page, 'falafel-falafel-bowl');
    const pita = await propCenter(page, 'falafel-falafel-pita');
    await touchDrag(page, await propCenter(page, 'falafel-falafel-bowl'), { x: pita.x + 20 * scale, y: pita.y });
    await expect
      .poll(async () => (await propState(page, 'falafel-falafel-pita')).state?.stuffed)
      .toBe(true);
    // The bowl went back to its place, off the pita.
    expect((await propState(page, 'falafel-falafel-bowl')).x).toBe(bowlBefore.x);
    await page.screenshot({ path: `docs/screens/m9-falafel-pita-${testInfo.project.name}.png` });

    // Handed to the cook, it is eaten and goes back to the counter, empty again.
    const start = await propState(page, 'falafel-falafel-pita');
    // The fryer stands between the counter and the cook: both in view, away from the edges.
    await scrollTo(page, 'falafel-fryer');
    const cook = await propCenter(page, 'falafel-1');
    await touchDrag(page, await propCenter(page, 'falafel-falafel-pita'), { x: cook.x, y: cook.y - 20 * scale });
    await expect.poll(async () => (await propState(page, 'falafel-falafel-pita')).state?.stuffed).toBeUndefined();
    expect(await propState(page, 'falafel-falafel-pita')).toMatchObject({
      x: start.x,
      y: start.y,
      on: 'falafel-counter',
    });
  });

  test('the drinks fridge opens on lemonade and juice', async ({ page }) => {
    await openGame(page, 'falafel');
    expect(await isVisible(page, 'falafel-lemonade')).toBe(false);
    await tap(page, await scrollTo(page, 'falafel-drinks-fridge'));
    await expect.poll(() => isVisible(page, 'falafel-lemonade')).toBe(true);
    expect(await isVisible(page, 'falafel-juice')).toBe(true);
  });
});
