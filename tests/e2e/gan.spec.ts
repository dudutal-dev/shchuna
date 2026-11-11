import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { openGame, propCenter, propState, scrollTo, tap, touchDrag, travel } from './helpers';

const isVisible = (page: Page, id: string) =>
  page.evaluate((prop) => window.__shchuna?.isVisible(prop) ?? false, id);
const found = (page: Page) =>
  page.evaluate(() => window.__shchuna!.state().letters.filter((l) => l.found).map((l) => l.letter));

test.describe('gan', () => {
  test('the map opens into the gan, where the teacher and two children wait', async ({
    page,
  }, testInfo) => {
    await openGame(page, 'home');
    await travel(page, 'gan');
    const people = await page.evaluate(() =>
      window.__shchuna!.state().characters.filter((c) => c.location === 'gan'),
    );
    expect(people).toHaveLength(3);
    expect(await page.evaluate(() => window.__shchuna!.music())).toBe('audio/music/gan.mp3');
    await page.screenshot({ path: `docs/screens/m9-gan-class-${testInfo.project.name}.png` });
  });

  test('the puppet theatre opens on the peacock, who hides tet', async ({ page }, testInfo) => {
    await openGame(page, 'gan');
    expect(await isVisible(page, 'gan-peacock')).toBe(false);
    const theater = await scrollTo(page, 'gan-puppet-theater');
    // The curtains, below the stage, open it.
    const scale = page.viewportSize()!.height / 600;
    await tap(page, { x: theater.x, y: theater.y + 90 * scale });
    await expect.poll(() => isVisible(page, 'gan-peacock')).toBe(true);
    await page.screenshot({ path: `docs/screens/m9-theater-${testInfo.project.name}.png` });
    await tap(page, await propCenter(page, 'gan-peacock'));
    await expect.poll(() => found(page)).toEqual(['ט']);
    expect(await page.evaluate(() => window.__shchuna!.spoken())).toContain('letter.found.tet');
  });

  test('in the yard the swing swings, and a bucket fills in the sandbox', async ({
    page,
  }, testInfo) => {
    test.slow();
    await openGame(page, 'gan');
    await tap(page, await scrollTo(page, 'gan-swing'));
    await expect.poll(async () => (await propState(page, 'gan-swing')).state?.swinging).toBe(true);

    await scrollTo(page, 'gan-sandbox');
    const scale = page.viewportSize()!.height / 600;
    const bucket = await propCenter(page, 'gan-bucket');
    const sandbox = await propCenter(page, 'gan-sandbox');
    // Out of the sandbox and back in again.
    await touchDrag(page, bucket, { x: bucket.x + 200 * scale, y: bucket.y + 40 * scale });
    await page.waitForTimeout(400);
    await touchDrag(page, await propCenter(page, 'gan-bucket'), { x: sandbox.x, y: sandbox.y - 20 * scale });
    await expect.poll(async () => (await propState(page, 'gan-bucket')).state?.full).toBe(true);
    await page.screenshot({ path: `docs/screens/m9-yard-${testInfo.project.name}.png` });
  });
});
