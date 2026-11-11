import { defineConfig } from '@playwright/test';

const PORT = 4173;

// Touch emulation in Chromium. The phone runs in landscape because that is the
// game's only orientation; portrait gets its own rotate-prompt test.
export default defineConfig({
  testDir: 'tests/e2e',
  // WebGL runs on the CPU here (SwiftShader), so drags are far slower than on a device.
  timeout: 90_000,
  fullyParallel: true,
  // Software WebGL is heavy: more than three pages at once on an 8-thread laptop starves
  // the frame loop, and slow frames time tests out.
  workers: process.env.CI ? undefined : 3,
  forbidOnly: !!process.env.CI,
  // Software WebGL under load is occasionally flaky locally; a retry is reported as "flaky", not hidden.
  retries: 1,
  // On CI, failures also become annotations, readable on GitHub without downloading logs.
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.03 } },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    hasTouch: true,
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    { name: 'ipad', use: { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 } },
    {
      name: 'iphone',
      use: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true },
    },
  ],
  // Always the production build: this is what covers the CSP, PWA and offline behaviour.
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    // These flows don't depend on the recordings, and a new line shouldn't need paid audio to test.
    env: { SHCHUNA_ALLOW_MISSING_VOICE: '1' },
    timeout: 180_000,
  },
});
