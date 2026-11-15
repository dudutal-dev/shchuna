import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, openStartScreen, propCenter, scrollTo, stripReady, tap, tapToStart, touchDrag, touchHold, travel } from './helpers';

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
    // What the child found so far: nothing yet in a new game, all 22 letters listed.
    await expect(page.getByText('נמצאו 0 מתוך 22 אותיות.')).toBeVisible();
    await expect(page.locator('.progress-cell')).toHaveCount(22);
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

/** Through the gate into the settings, from wherever the game is. */
async function openSettings(page: Page): Promise<void> {
  await openGate(page);
  await answer(page, true);
  await page.waitForFunction(() => window.__shchuna?.stage === 'settings');
}

async function closeSettings(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'חזרה למשחק' }).tap();
  await page.waitForFunction(() => window.__shchuna?.stage === 'playing');
}

const story = (page: Page) => page.evaluate(() => window.__shchuna!.story());

/** Drags a bowl from the falafel counter onto the pita. */
async function into(page: Page, bowl: string): Promise<void> {
  await scrollTo(page, 'falafel-falafel-pita');
  const scale = page.viewportSize()!.height / 600;
  const pita = await propCenter(page, 'falafel-falafel-pita');
  await touchDrag(page, await propCenter(page, bowl), { x: pita.x + 20 * scale, y: pita.y });
}

test.describe('parents and stories', () => {
  test('the age level and the stories switch are kept', async ({ page }) => {
    await openGame(page, 'home');
    await openSettings(page);
    // Ages 5–6 until the parents choose, and stories on.
    await expect(page.getByLabel('גיל 5–6')).toBeChecked();
    await expect(page.getByLabel('סיפורים', { exact: true })).toBeChecked();
    await page.getByLabel('גיל 3–4').check();
    await page.getByLabel('סיפורים', { exact: true }).uncheck();
    await closeSettings(page);
    const saved = () => page.evaluate(() => window.__shchuna!.state().settings);
    expect(await saved()).toMatchObject({ level: 1, stories: false });
    await page.evaluate(() => window.__shchuna!.flushSave());
    await page.reload();
    await tapToStart(page);
    expect(await saved()).toMatchObject({ level: 1, stories: false });
  });

  test('changing the age in the middle of a story starts it again at that age', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true });
    await into(page, 'falafel-falafel-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(1);
    await into(page, 'falafel-salad-bowl');
    await expect.poll(async () => (await story(page))?.step).toBe(2);
    await openSettings(page);
    await page.getByLabel('גיל 3–4').check();
    await closeSettings(page);
    expect(await story(page)).toEqual({ id: 'pita', step: 0, steps: ['fill', 'serve'] });
    await stripReady(page);
    expect(await page.evaluate(() => window.__shchuna!.storyStepCenter(2))).toBeNull();
  });

  test('switching stories off puts the story away and starts no other', async ({ page }) => {
    test.slow();
    await openGame(page, 'falafel', { stories: true });
    await stripReady(page);
    await openSettings(page);
    await page.getByLabel('סיפורים', { exact: true }).uncheck();
    await closeSettings(page);
    expect(await story(page)).toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.storyStepCenter(0))).toBeNull();
    expect(await page.evaluate(() => window.__shchuna!.state().stories.active)).toBeUndefined();
    await travel(page, 'home');
    await travel(page, 'falafel');
    expect(await story(page)).toBeNull();
  });
});

test.describe('who is playing', () => {
  const picture = (page: Page, level: 1 | 2 | 3) =>
    page.evaluate((which) => window.__shchuna!.pickCenter?.(which) ?? null, level);
  const startTap = async (page: Page) => {
    const size = page.viewportSize()!;
    await page.touchscreen.tap(size.width / 2, size.height / 2);
  };

  test('the first launch asks who is playing, and the picture tapped sets the age', async ({ page }, testInfo) => {
    await openStartScreen(page, 'map', { stories: true, pick: true });
    await startTap(page);
    await page.waitForFunction(() => window.__shchuna?.stage === 'level');
    await expect
      .poll(() => page.evaluate(() => window.__shchuna!.spoken().includes('level.who')), { timeout: 15_000 })
      .toBe(true);
    // Right to left: the smallest first.
    const [small, middle, big] = [await picture(page, 1), await picture(page, 2), await picture(page, 3)];
    expect(small!.x).toBeGreaterThan(middle!.x);
    expect(middle!.x).toBeGreaterThan(big!.x);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `docs/screens/story-level-${testInfo.project.name}.png` });

    await tap(page, small!);
    await page.waitForFunction(() => window.__shchuna?.stage === 'map');
    expect(await page.evaluate(() => window.__shchuna!.state().settings.level)).toBe(1);
    expect(await page.evaluate(() => window.__shchuna!.pickCenter)).toBeNull();

    // Asked once: the next launch goes straight to the map.
    await page.evaluate(() => window.__shchuna!.flushSave());
    await page.reload();
    await tapToStart(page);
    expect(await stage(page)).toBe('map');
    expect(await page.evaluate(() => window.__shchuna!.state().settings.level)).toBe(1);
  });

  test('nobody is asked when the stories are switched off', async ({ page }) => {
    await openGame(page, 'home');
    await openSettings(page);
    await page.getByLabel('סיפורים', { exact: true }).uncheck();
    await closeSettings(page);
    await page.evaluate(() => window.__shchuna!.flushSave());
    await page.goto('./?e2e&stories&pick');
    await tapToStart(page);
    expect(await stage(page)).toBe('map');
    expect(await page.evaluate(() => window.__shchuna!.state().settings.level)).toBeUndefined();
  });
});
