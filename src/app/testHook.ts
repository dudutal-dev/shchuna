import type { SaveManager } from '../engine/SaveManager';
import type { Scene } from '../engine/Scene';
import type { SaveGame } from '../types';
import type { Hud } from '../ui/Hud';
import type { GameStore } from './store';

export interface TestHook {
  state(): SaveGame;
  center(id: string): { x: number; y: number } | null;
  undoCenter(): { x: number; y: number };
  flushSave(): Promise<void>;
}

declare global {
  interface Window {
    __shchuna?: TestHook;
  }
}

/** Canvas has no DOM to query, so e2e tests read positions here. Only with `?e2e` in the URL. */
export function installTestHook(parts: {
  store: GameStore;
  scene: Scene;
  hud: Hud;
  saves: SaveManager;
}): void {
  if (!new URLSearchParams(location.search).has('e2e')) return;
  window.__shchuna = {
    state: () => parts.store.state,
    center: (id) => parts.scene.entityCenter(id),
    undoCenter: () => parts.hud.undoCenter(),
    flushSave: () => parts.saves.flush(),
  };
}
