import type { AudioManager } from '../engine/AudioManager';
import type { SaveManager } from '../engine/SaveManager';
import type { Scene } from '../engine/Scene';
import type { SaveGame } from '../types';
import type { Hud, HudButtonId } from '../ui/Hud';
import type { GameStore } from './store';

type Point = { x: number; y: number };

export interface TestHook {
  stage: 'loading' | 'start' | 'playing' | 'creator';
  state(): SaveGame;
  /** A prop or character in the scene, or a creator control while the creator is open. */
  center(id: string): Point | null;
  isVisible(id: string): boolean;
  undoCenter(): Point;
  hudCenter(id: HudButtonId): Point;
  darkness(): number;
  lastLine(): string | null;
  flushSave(): Promise<void>;
  /** Set while the character creator is open. */
  creatorCenter: ((id: string) => Point | null) | null;
}

declare global {
  interface Window {
    __shchuna?: TestHook;
  }
}

/** Canvas has no DOM to query, so e2e tests read the game here. Only with `?e2e` in the URL. */
export function installTestHook(parts: {
  store: GameStore;
  scene: Scene;
  hud: Hud;
  audio: AudioManager;
  saves: SaveManager;
}): TestHook | null {
  if (!new URLSearchParams(location.search).has('e2e')) return null;
  const hook: TestHook = {
    stage: 'loading',
    state: () => parts.store.state,
    center: (id) => parts.scene.entityCenter(id),
    isVisible: (id) => parts.scene.isEntityVisible(id),
    undoCenter: () => parts.hud.undoCenter(),
    hudCenter: (id) => parts.hud.center(id),
    darkness: () => parts.scene.darknessLevel(),
    lastLine: () => parts.audio.lastLine,
    flushSave: () => parts.saves.flush(),
    creatorCenter: null,
  };
  window.__shchuna = hook;
  return hook;
}
