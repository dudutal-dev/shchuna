import { defineConfig } from '@playwright/test';

// Records the parents' video guide (scripts/guide-video.ts). Not part of the test suite.
const PORT = 4176;
const SIZE = { width: 1180, height: 820 };

export default defineConfig({
  testDir: 'tests/video',
  testMatch: '*.video.ts',
  outputDir: '.voice-samples/guide/run',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    viewport: SIZE,
    hasTouch: true,
    video: { mode: 'on', size: SIZE },
    launchOptions: {
      // The real graphics card where there is one, for a smooth video.
      args: ['--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
