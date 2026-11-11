import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { propCenter, propState, scrollTo, tap, tapToStart, touchDrag } from './helpers';

const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());
const lastHint = (page: Page) => page.evaluate(() => window.__shchuna!.lastHint());

// Plan step 2: when the child is idle, a spoken invitation and a hand that shows how.
test.describe('invitations', () => {
  test('in the gan yard, idle: "who wants to slide?" and a hand drags someone to the slide', async ({
    page,
  }, testInfo) => {
    test.slow();
    // Long enough that no hint comes while the test itself is still scrolling the yard.
    await page.goto('./?e2e&scene=gan&hintMs=6000');
    await tapToStart(page);
    await scrollTo(page, 'gan-slide');
    // Said aloud, and the hand starts its demonstration (it shows for a few seconds).
    await expect.poll(() => spoken(page), { timeout: 30_000 }).toContain('invite.slide');
    expect(await lastHint(page)).toBe('invite:slide');
    // A picture of the hand mid-demonstration, when it is on screen.
    for (let i = 0; i < 20; i++) {
      if (await page.evaluate(() => window.__shchuna!.ghostShowing())) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `docs/screens/invite-slide-${testInfo.project.name}.png` });
        break;
      }
      await page.waitForTimeout(200);
    }

    // Doing it: the child takes the hint, and it is not offered again.
    const scale = page.viewportSize()!.height / 600;
    const top = await page.evaluate(() => window.__shchuna!.surfaceCenter('slide-top'));
    await touchDrag(page, await propCenter(page, 'gan-2'), { x: top!.x, y: top!.y - 30 * scale });
    await expect.poll(() => page.evaluate(() => window.__shchuna!.ghostShowing())).toBe(false);
    await expect.poll(async () => (await page.evaluate(() =>
      window.__shchuna!.state().characters.find((c) => c.id === 'gan-2')))?.pose, { timeout: 10_000 }).toBe('stand');
    // Spoken invitations are half a minute apart: the next quiet moment brings only a twinkle.
    await page.waitForTimeout(4500);
    expect(await lastHint(page)).not.toBe('invite:slide');
  });

  test('a tap invitation in the kitchen: "what is in the fridge?"', async ({ page }) => {
    await page.goto('./?e2e&scene=home&hintMs=3000');
    await tapToStart(page);
    await expect.poll(() => lastHint(page), { timeout: 20_000 }).toBe('invite:fridge');
    expect(await spoken(page)).toContain('invite.fridge');
    await tap(page, await propCenter(page, 'fridge'));
    await expect.poll(async () => (await propState(page, 'fridge')).state?.open).toBe(true);
  });

  test('parents can turn spoken invitations off', async ({ page }) => {
    await page.goto('./?e2e&scene=home&hintMs=2500');
    await page.waitForFunction(() => window.__shchuna?.stage === 'start');
    await page.evaluate(() => {
      // As if the switch in the parents' settings had been turned off.
      window.__shchuna!.state().settings.invitations = false;
    });
    await tapToStart(page);
    await expect.poll(() => lastHint(page), { timeout: 20_000 }).not.toBeNull();
    expect(await lastHint(page)).not.toMatch(/^invite:/);
    expect((await spoken(page)).some((line) => line.startsWith('invite.'))).toBe(false);
  });
});
