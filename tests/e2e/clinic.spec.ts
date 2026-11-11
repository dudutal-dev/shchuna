import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag, travel } from './helpers';

const isVisible = (page: Page, id: string) =>
  page.evaluate((prop) => window.__shchuna?.isVisible(prop) ?? false, id);
const person = (page: Page, id: string) =>
  page.evaluate((who) => window.__shchuna!.state().characters.find((c) => c.id === who), id);

test.describe('clinic', () => {
  test('the map opens into the waiting room, a patient on the bench', async ({ page }, testInfo) => {
    await openGame(page, 'home');
    await travel(page, 'clinic');
    expect(await person(page, 'clinic-2')).toMatchObject({ on: 'bench', pose: 'sit' });
    expect(await page.evaluate(() => window.__shchuna!.music())).toBe('audio/music/clinic.mp3');
    await page.screenshot({ path: `docs/screens/m9-clinic-waiting-${testInfo.project.name}.png` });
  });

  test('a cup fills at the water cooler', async ({ page }) => {
    await openGame(page, 'clinic');
    const scale = page.viewportSize()!.height / 600;
    const width = page.viewportSize()!.width;
    // From the reception desk down to the floor, as far left as the screen goes.
    const cup = await scrollTo(page, 'clinic-cup');
    await touchDrag(page, cup, { x: width * 0.25, y: cup.y + 120 * scale });
    // Then bring the cooler into view and hold the cup under its tap.
    await scrollTo(page, 'clinic-water-cooler');
    const cooler = await propCenter(page, 'clinic-water-cooler');
    await touchDrag(page, await propCenter(page, 'clinic-cup'), { x: cooler.x, y: cooler.y + 10 * scale });
    await expect.poll(async () => (await propState(page, 'clinic-cup')).state?.filled).toBe(true);
  });

  test("in the doctor's room the X-ray lights up, the cabinet opens and the doctor lies down", async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'clinic');
    const scale = page.viewportSize()!.height / 600;
    await tap(page, await scrollTo(page, 'clinic-light-box'));
    await expect.poll(async () => (await propState(page, 'clinic-light-box')).state?.on).toBe(true);

    expect(await isVisible(page, 'clinic-bandage')).toBe(false);
    await tap(page, await scrollTo(page, 'clinic-cabinet'));
    await expect.poll(() => isVisible(page, 'clinic-bandage')).toBe(true);

    await scrollTo(page, 'clinic-exam-bed');
    const bed = await propCenter(page, 'clinic-exam-bed');
    const doctor = await propCenter(page, 'clinic-1');
    await touchDrag(page, doctor, { x: bed.x, y: bed.y - 30 * scale });
    await expect.poll(async () => (await person(page, 'clinic-1'))?.pose).toBe('lie');
    await page.screenshot({ path: `docs/screens/m9-clinic-exam-${testInfo.project.name}.png` });
  });
});
