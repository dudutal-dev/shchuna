import type { AudioManager } from '../engine/AudioManager';
import type { SaveManager } from '../engine/SaveManager';
import type { Scene } from '../engine/Scene';
import type { Coin } from '../learning/CoinCounter';
import type { Checkout } from '../locations/makolet/Checkout';
import type { SaveGame } from '../types';
import type { Hud, HudButtonId } from '../ui/Hud';
import type { GameStore } from './store';

type Point = { x: number; y: number };

export interface TestHook {
  stage: 'loading' | 'start' | 'playing' | 'creator';
  state(): SaveGame;
  /** A prop or character in the scene. */
  center(id: string): Point | null;
  isVisible(id: string): boolean;
  /** The middle of a surface's top, such as the shop's belt. */
  surfaceCenter(id: string): Point | null;
  undoCenter(): Point;
  hudCenter(id: HudButtonId): Point;
  darkness(): number;
  lastLine(): string | null;
  /** Recent spoken lines, oldest first. */
  spoken(): string[];
  flushSave(): Promise<void>;
  /** Set while the character creator is open. */
  creatorCenter: ((id: string) => Point | null) | null;
  /** In the shop only. */
  coinCenter(coin: Coin): Point | null;
  trayCenter(): Point | null;
}

declare global {
  interface Window {
    __shchuna?: TestHook;
  }
}

/** Canvas has no DOM to query, so e2e tests read the game here. Only with `?e2e` in the URL. */
export function installTestHook(parts: {
  store: GameStore;
  scene: () => Scene | null;
  checkout: () => Checkout | null;
  hud: Hud;
  audio: AudioManager;
  saves: SaveManager;
}): TestHook | null {
  if (!new URLSearchParams(location.search).has('e2e')) return null;
  const hook: TestHook = {
    stage: 'loading',
    state: () => parts.store.state,
    center: (id) => parts.scene()?.entityCenter(id) ?? null,
    isVisible: (id) => parts.scene()?.isEntityVisible(id) ?? false,
    surfaceCenter: (id) => parts.scene()?.surfaceCenter(id) ?? null,
    undoCenter: () => parts.hud.undoCenter(),
    hudCenter: (id) => parts.hud.center(id),
    darkness: () => parts.scene()?.darknessLevel() ?? 0,
    lastLine: () => parts.audio.lastLine,
    spoken: () => [...parts.audio.history],
    flushSave: () => parts.saves.flush(),
    creatorCenter: null,
    coinCenter: (coin) => parts.checkout()?.coinCenter(coin) ?? null,
    trayCenter: () => parts.checkout()?.trayCenter() ?? null,
  };
  window.__shchuna = hook;
  return hook;
}
