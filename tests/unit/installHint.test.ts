import { describe, expect, it } from 'vitest';
import { needsChromeToInstall } from '../../src/app/installHint';

const ANDROID = 'Mozilla/5.0 (Linux; Android 15; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko)';

describe('install note for Android', () => {
  it('is not needed in Chrome on Android, on iPhone or on a computer', () => {
    expect(needsChromeToInstall(`${ANDROID} Chrome/142.0.0.0 Mobile Safari/537.36`, false, false)).toBe(false);
    expect(
      needsChromeToInstall('Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) Version/19.0 Safari/604.1', false, false),
    ).toBe(false);
    expect(needsChromeToInstall('Mozilla/5.0 (Windows NT 10.0) Chrome/142.0.0.0', false, false)).toBe(false);
  });

  it('is shown in Samsung Internet, Edge, Opera, Firefox and Brave on Android', () => {
    for (const browser of ['SamsungBrowser/28.0 Chrome/130.0', 'Chrome/142.0 EdgA/142.0', 'Chrome/142.0 OPR/90.0']) {
      expect(needsChromeToInstall(`${ANDROID} ${browser} Mobile Safari/537.36`, false, false), browser).toBe(true);
    }
    expect(needsChromeToInstall('Mozilla/5.0 (Android 15; Mobile; rv:140.0) Gecko/140.0 Firefox/140.0', false, false)).toBe(true);
    expect(needsChromeToInstall(`${ANDROID} Chrome/142.0.0.0 Mobile Safari/537.36`, false, true)).toBe(true);
  });

  it('is not shown once the game runs installed', () => {
    expect(needsChromeToInstall(`${ANDROID} SamsungBrowser/28.0 Chrome/130.0`, true, false)).toBe(false);
  });
});
