import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Enforces "no network except same origin" in the browser itself. Build only,
 * because the dev server needs inline scripts and a websocket for HMR.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'shchuna-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
        injectTo: 'head-prepend',
      },
    ],
  };
}

export default defineConfig({
  // Relative base: the same build works on Pages under any repo name, and later in Capacitor.
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    // Pixi fetches art, and the CSP's connect-src doesn't allow data: URLs.
    assetsInlineLimit: 0,
  },
  plugins: [
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      includeAssets: ['fonts/*.woff2', 'icons/*'],
      manifest: {
        name: 'שכונה',
        short_name: 'שכונה',
        description: 'עולם משחק ישראלי לילדים, בעברית מלאה',
        lang: 'he',
        dir: 'rtl',
        display: 'standalone',
        orientation: 'landscape',
        start_url: './',
        scope: './',
        background_color: '#BFE6FF',
        theme_color: '#BFE6FF',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,json}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
});
