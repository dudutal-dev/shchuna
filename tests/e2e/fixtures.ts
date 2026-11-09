import { test as base, expect } from '@playwright/test';

/**
 * Every flow runs under these two guards (CLAUDE.md iron rules, SPEC §16.2.7):
 * no request may leave the app's origin, and the console must stay clean.
 */
export const test = base.extend<{ guards: void }>({
  guards: [
    async ({ page, baseURL }, use) => {
      const origin = new URL(baseURL ?? 'http://localhost').origin;
      const external: string[] = [];
      const errors: string[] = [];
      page.on('request', (request) => {
        const url = new URL(request.url());
        if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && url.origin !== origin) {
          external.push(request.url());
        }
      });
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use();
      expect(external, 'external network requests').toEqual([]);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
