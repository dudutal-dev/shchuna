import { expect, test } from './fixtures';
import { openStartScreen, propCenter, tap, tapToStart, touchHold } from './helpers';

const lastLine = () => window.__shchuna?.lastLine();

test('the start screen waits for a touch, then greets', async ({ page }, testInfo) => {
  await openStartScreen(page);
  await page.screenshot({ path: `docs/screens/m2-start-${testInfo.project.name}.png` });
  expect(await page.evaluate(lastLine)).toBe('ui.tap_to_start');
  await tapToStart(page);
  expect(await page.evaluate(lastLine)).toBe('ui.welcome');
});

test('a long press names the prop in a bubble and in speech', async ({ page }, testInfo) => {
  await openStartScreen(page);
  await tapToStart(page);
  await touchHold(page, await propCenter(page, 'apple'), 900);
  await expect.poll(() => page.evaluate(lastLine)).toBe('prop.apple');
  await page.screenshot({ path: `docs/screens/m2-bubble-${testInfo.project.name}.png` });
});

test('a quick tap does not speak', async ({ page }) => {
  await openStartScreen(page);
  await tapToStart(page);
  await tap(page, await propCenter(page, 'ball'));
  await page.waitForTimeout(700);
  expect(await page.evaluate(lastLine)).toBe('ui.welcome');
});

test('the production bundle has no sign of the voice pipeline', async ({ page, baseURL }) => {
  await page.goto('./');
  const scripts = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.js')),
  );
  expect(scripts.length).toBeGreaterThan(0);
  for (const url of scripts) {
    expect(url.startsWith(new URL(baseURL ?? '').origin)).toBe(true);
    const source = await (await page.request.get(url)).text();
    expect(source).not.toContain('api.elevenlabs.io');
    expect(source).not.toContain('xi-api-key');
  }
});
