import { expect, test } from './fixtures';
import { tap, tapToStart, travel } from './helpers';

// SPEC §16.2 flow 8: after one visit, the game plays with no network at all.
test('after the first load the game works offline', async ({ page, context }) => {
  // The offline copy downloads every recording and picture first.
  test.slow();
  await page.goto('./?e2e');
  await page.waitForFunction(() => window.__shchuna?.stage === 'start');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first visit installs the offline copy; from the next one it serves the page.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  await context.setOffline(true);
  await page.reload();
  await tapToStart(page);
  expect(await page.evaluate(() => window.__shchuna!.here())).toBe('map');

  // Into a place and on to the other, with art and voices from the offline copy.
  const makolet = await page.evaluate(() => window.__shchuna!.mapCenter?.('makolet'));
  if (!makolet) throw new Error('no makolet on the map');
  await tap(page, makolet);
  await page.waitForFunction(
    () => window.__shchuna?.stage === 'playing' && window.__shchuna.here() === 'makolet',
    undefined,
    { timeout: 30_000 },
  );
  await travel(page, 'home');
});
