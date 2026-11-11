import { registerSW } from 'virtual:pwa-register';

/** While the game is open, a new version is looked for this often. */
const CHECK_EVERY_MS = 30 * 60_000;
/**
 * Back after this long in the background, the game may restart on a waiting new version:
 * by then the child has left it, and everything was saved on the way out.
 */
const AWAY_MS = 60_000;

/**
 * Keeps the installed game up to date, even when it lives on the home screen and is never
 * really closed. A new version is looked for at launch, whenever the game comes back to the
 * front, and every half hour; it downloads in the background without interrupting play,
 * and is switched to only at a natural break: on the start screen, or on coming back after
 * more than a minute away. Coming back sooner, the child carries on where they were.
 */
export function watchForUpdates(onStartScreen: () => boolean): void {
  if (!('serviceWorker' in navigator)) return;
  let waiting = false;
  let hiddenAt = 0;
  let registration: ServiceWorkerRegistration | undefined;

  // Offline, the check fails quietly; the next one will try again.
  const check = (): void => void registration?.update().catch(() => undefined);

  const update = registerSW({
    immediate: true,
    onRegisteredSW(_url, found) {
      registration = found;
      setInterval(check, CHECK_EVERY_MS);
    },
    onNeedRefresh() {
      waiting = true;
      if (onStartScreen()) void update(true);
    },
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (waiting && (onStartScreen() || Date.now() - hiddenAt > AWAY_MS)) {
      void update(true);
      return;
    }
    // Back in front: is there something new since we left?
    check();
  });
}
