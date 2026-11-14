import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { propCenter, scrollTo, tapToStart, touchDrag } from './helpers';

const wish = (page: Page) => page.evaluate(() => window.__shchuna!.wish());
const spoken = (page: Page) => page.evaluate(() => window.__shchuna!.spoken());

// Plan step 3: small wishes, and counting in the fruit bowl.
test.describe('wishes and counting', () => {
  test('in the gan someone wishes to play; given a toy, they say thank you', async ({ page }, testInfo) => {
    test.slow();
    await page.goto('./?e2e&scene=gan&wishMs=2500&invites');
    await tapToStart(page);
    // In the gan there is no food and no bed: the only wish is for a toy, one that is on screen.
    await expect.poll(() => wish(page), { timeout: 30_000 }).not.toBeNull();
    const { characterId, kind, thing } = (await wish(page))!;
    expect(kind).toBe('play');
    expect(thing).toBeTruthy();
    const toy = await propCenter(page, thing!);
    expect(toy.x).toBeGreaterThan(0);
    expect(toy.x).toBeLessThan(page.viewportSize()!.width);
    // It is said aloud, naming the toy, and the see-through hand shows how.
    await expect.poll(() => spoken(page)).toContain('wish.play');
    expect(await page.evaluate(() => window.__shchuna!.lastHint())).toBe('wish:play');
    const defId = await page.evaluate((id) => window.__shchuna!.state().props.find((p) => p.id === id)?.defId, thing);
    await expect.poll(() => spoken(page), { timeout: 25_000 }).toContain(`prop.${defId}`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `docs/screens/wish-play-${testInfo.project.name}.png` });

    const scale = page.viewportSize()!.height / 600;
    const who = await propCenter(page, characterId);
    await touchDrag(page, toy, { x: who.x, y: who.y - 10 * scale });
    await expect.poll(() => wish(page)).toBeNull();
    await expect.poll(() => spoken(page)).toContain('react.thanks');
    const holder = await page.evaluate(
      (id) => window.__shchuna!.state().characters.find((c) => c.id === id),
      characterId,
    );
    expect(holder?.holding).toBe(thing);
  });

  test('in the makolet nobody wishes for a toy that is not there', async ({ page }) => {
    test.slow();
    await page.goto('./?e2e&scene=makolet&wishMs=1500');
    await tapToStart(page);
    const seen: Array<{ kind: string; thing?: string }> = [];
    for (let i = 0; i < 12; i++) {
      const now = await wish(page);
      if (now && !seen.some((s) => s.thing === now.thing && s.kind === now.kind)) seen.push(now);
      await page.waitForTimeout(1000);
    }
    const ids = await page.evaluate(() => window.__shchuna!.state().props.map((p) => p.id));
    for (const w of seen) {
      expect(w.kind).not.toBe('play');
      if (w.thing) expect(ids).toContain(w.thing);
    }
  });

  test('things put in the fruit bowl are counted aloud', async ({ page }, testInfo) => {
    await page.goto('./?e2e&scene=home');
    await tapToStart(page);
    const scale = page.viewportSize()!.height / 600;
    const bowl = await scrollTo(page, 'fruit-bowl');
    await touchDrag(page, await propCenter(page, 'pot'), { x: bowl.x, y: bowl.y - 40 * scale });
    await expect
      .poll(() => page.evaluate(() => window.__shchuna!.state().props.find((p) => p.id === 'pot')?.on))
      .toBe('fruit-bowl');
    await expect.poll(() => spoken(page)).toContain('number.1');
    await page.screenshot({ path: `docs/screens/count-bowl-${testInfo.project.name}.png` });
  });
});
