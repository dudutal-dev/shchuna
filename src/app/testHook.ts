import type { AudioManager } from '../engine/AudioManager';
import type { SaveManager } from '../engine/SaveManager';
import type { Scene } from '../engine/Scene';
import type { SaveGame } from '../types';
import type { Hud } from '../ui/Hud';
import type { GameStore } from './store';

export interface TestHook {
  stage: 'loading' | 'start' | 'playing';
  state(): SaveGame;
  center(id: string): { x: number; y: number } | null;
  isVisible(id: string): boolean;
  undoCenter(): { x: number; y: number };
  lastLine(): string | null;
  flushSave(): Promise<void>;
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
    lastLine: () => parts.audio.lastLine,
    flushSave: () => parts.saves.flush(),
  };
  window.__shchuna = hook;
  return hook;
}
