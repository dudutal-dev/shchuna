import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, touchHold } from './helpers';

const stage = (page: Page) => page.evaluate(() => window.__shchuna!.stage);

async function holdLock(page: Page, ms: number): Promise<void> {
  await touchHold(page, await page.evaluate(() => window.__shchuna!.hudCenter('lock')), ms);
}

async function openGate(page: Page): Promise<void> {
  await holdLock(page, 2400);
  await page.waitForFunction(() => window.__shchuna?.stage === 'gate');
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function answer(page: Page, right: boolean): Promise<void> {
  const correct = await page.evaluate(() => window.__shchuna!.gateAnswer?.());
  if (!correct) throw new Error('gate not open');
  const choices = page.locator('.gate-choice');
  const texts = await choices.allTextContents();
  const index = texts.findIndex((t) => (Number(t) === correct) === right);
  await choices.nth(index).tap();
}

test.describe('parents gate', () => {
  test('a short press on the lock does nothing', async ({ page }) => {
    await openGame(page, 'home');
    await holdLock(page, 400);
    await page.waitForTimeout(2000);
    expect(await stage(page)).toBe('playing');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  // SPEC §16.2 flow 5.
  test('two wrong answers go back to the game; the right one opens settings', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    await openGate(page);
    // Written only, never spoken (SPEC §12).
    expect(await page.evaluate(() => window.__shchuna!.lastLine())).not.toMatch(/gate/);
    await expect(page.locator('.gate-question')).toContainText('כָּפוּל');
    await page.screenshot({ path: `docs/screens/m7-gate-${testInfo.project.name}.png` });

    await answer(page, false);
    expect(await stage(page)).toBe('gate');
    await answer(page, false);
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await openGate(page);
    await answer(page, true);
    await page.waitForFunction(() => window.__shchuna?.stage === 'settings');
    await expect(page.getByRole('heading', { name: 'הגדרות' })).toBeVisible();
    await page.screenshot({ path: `docs/screens/m7-settings-${testInfo.project.name}.png` });

    // Address the child as a girl, and hide niqqud.
    await page.getByLabel('נקבה').check();
    await page.getByLabel('הצגת ניקוד').uncheck();
    await page.getByRole('button', { name: 'חזרה למשחק' }).tap();
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
    const settings = await page.evaluate(() => window.__shchuna!.state().settings);
    expect(settings).toMatchObject({ addressGender: 'f', showNiqqud: false });
  });

  test('reset asks twice, then starts a new game', async ({ page }) => {
    await openGame(page, 'home');
    await page.evaluate(() => window.__shchuna!.flushSave());
    await openGate(page);
    await answer(page, true);
    await page.waitForFunction(() => window.__shchuna?.stage === 'settings');
    await page.getByRole('button', { name: 'איפוס המשחק' }).tap();
    // The first "yes" only asks again.
    await page.getByRole('button', { name: 'כן, לאפס' }).tap();
    await expect(page.getByText('אי אפשר לבטל')).toBeVisible();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByRole('button', { name: 'איפוס סופי' }).tap(),
    ]);
    await page.waitForFunction(() => window.__shchuna?.stage === 'start');
    const save = await page.evaluate(() => window.__shchuna!.state());
    expect(save.wallet).toBe(20);
  });

  test("the parents' guide walks through every button, then back to the game", async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'home');
    await openGate(page);
    await answer(page, true);
    await page.waitForFunction(() => window.__shchuna?.stage === 'settings');
    await page.getByRole('button', { name: 'איך משחקים? הדרכה להורים' }).tap();
    await page.waitForFunction(() => window.__shchuna?.stage === 'guide');
    await expect(page.getByRole('heading', { name: 'ברוכים הבאים לשכונה' })).toBeVisible();

    // Step 2 lights up the map button, where it really is.
    await page.getByRole('button', { name: 'הבא' }).tap();
    await expect(page.getByRole('heading', { name: 'המפה' })).toBeVisible();
    const map = await page.evaluate(() => window.__shchuna!.hudCenter('map'));
    const spot = await page.locator('.guide-spot').boundingBox();
    expect(Math.abs(spot!.x + spot!.width / 2 - map.x)).toBeLessThan(4);
    await page.screenshot({ path: `docs/screens/m9-guide-${testInfo.project.name}.png` });

    // Back one, then on to the end.
    await page.getByRole('button', { name: 'הקודם' }).tap();
    await expect(page.getByRole('heading', { name: 'ברוכים הבאים לשכונה' })).toBeVisible();
    for (let i = 0; i < 20 && (await page.getByRole('button', { name: 'הבא' }).count()) > 0; i++) {
      await page.getByRole('button', { name: 'הבא' }).tap();
    }
    await expect(page.getByRole('heading', { name: 'זהו!' })).toBeVisible();
    await page.getByRole('button', { name: 'סיום' }).tap();
    await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
    await expect(page.locator('.guide-overlay')).toHaveCount(0);
  });

  // SPEC §16.2 flow 6.
  test('the whole app, gate included, is right to left', async ({ page }) => {
    await openGame(page, 'home');
    expect(await page.evaluate(() => document.dir)).toBe('rtl');
    await openGate(page);
    const direction = await page.locator('.parent-card').evaluate((node) => getComputedStyle(node).direction);
    expect(direction).toBe('rtl');
  });
});
