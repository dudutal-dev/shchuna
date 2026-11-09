import { registerSW } from 'virtual:pwa-register';

/**
 * Keeps the offline copy up to date without ever reloading mid-play: a new version
 * downloads in the background and is switched to only while the start screen shows.
 * Otherwise it waits for the next launch, which always opens on the start screen.
 */
export function watchForUpdates(onStartScreen: () => boolean): void {
  if (!('serviceWorker' in navigator)) return;
  let waiting = false;
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      if (onStartScreen()) void update(true);
    },
  });
  // Coming back to an open tab later also counts as a fresh start.
  document.addEventListener('visibilitychange', () => {
    if (waiting && document.visibilityState === 'visible' && onStartScreen()) void update(true);
  });
}
