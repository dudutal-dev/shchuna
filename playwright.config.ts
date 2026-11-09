import { defineConfig } from '@playwright/test';

const PORT = 4173;

// Touch emulation in Chromium. The phone runs in landscape because that is the
// game's only orientation; portrait gets its own rotate-prompt test.
export default defineConfig({
  testDir: 'tests/e2e',
  // WebGL runs on the CPU here (SwiftShader), so drags are far slower than on a device.
  timeout: 90_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
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
    timeout: 180_000,
  },
});
