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
  stage:
    | 'loading'
    | 'start'
    | 'map'
    | 'playing'
    | 'creator'
    | 'book'
    | 'gate'
    | 'settings'
    | 'guide';
  /** Set while the parents' guided tour runs: the step showing, from 0. */
  guideStep: (() => number) | null;
  /** The place being played in, or 'map'. */
  here(): string;
  /** What the last idle hint pointed at: a prop, or a place on the map. */
  lastHint(): string | null;
  /** Puts a character on a surface as a drop would. For checking what places do with them. */
  put(characterId: string, surfaceId: string): boolean;
  characterVisible(id: string): boolean;
  /** Set while the letter book is open: the letter being painted, if any. */
  painter: (() => { progress: number; points: Point[]; done: Point } | null) | null;
  /** The last surprise a prop showed: "fish:aquarium". */
  lastEffect(): string | null;
  /** Set while the map shows: the weather there, and a point in its sky. */
  weather: (() => string) | null;
  skyPoint: (() => Point) | null;
  /** The wish showing over someone's head, if any. */
  wish(): { characterId: string; kind: string; thing?: string } | null;
  /** Whether the see-through hand of an invitation is showing. */
  ghostShowing(): boolean;
  /** A side arrow that slides the room, or null while it is hidden. */
  arrowCenter(side: 'left' | 'right'): Point | null;
  /** The background loop playing now. */
  music(): string | null;
  /** Frames per second right now. */
  fps(): number;
  /** Average milliseconds to update and draw one frame, GPU included, over `frames` frames. */
  frameCost(frames: number): number;
  /** Set while the map shows: a place's middle, or the letter sparkling on it. */
  mapCenter: ((id: string) => Point | null) | null;
  /** Set while the parents' gate is open. */
  gateAnswer: (() => number | null) | null;
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
  /** The sparkling letter on a prop, while it is still hidden. */
  letterCenter(instanceId: string): Point | null;
  /** Set while the letter book is open: a letter's slot, or 'done'. */
  bookCenter: ((id: string) => Point | null) | null;
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
  here: () => string;
  lastHint: () => string | null;
  music: () => string | null;
  fps: () => number;
  frameCost: (frames: number) => number;
  audio: AudioManager;
  saves: SaveManager;
}): TestHook | null {
  if (!new URLSearchParams(location.search).has('e2e')) return null;
  const hook: TestHook = {
    stage: 'loading',
    here: parts.here,
    lastHint: parts.lastHint,
    arrowCenter: (side) => parts.scene()?.arrowCenter(side) ?? null,
    put: (characterId, surfaceId) => parts.scene()?.testPut(characterId, surfaceId) ?? false,
    characterVisible: (id) => parts.scene()?.isCharacterVisible(id) ?? false,
    ghostShowing: () => parts.scene()?.ghostShowing ?? false,
    wish: () => parts.scene()?.currentWish ?? null,
    lastEffect: () => parts.scene()?.lastEffect ?? null,
    painter: null,
    weather: null,
    skyPoint: null,
    music: parts.music,
    fps: parts.fps,
    frameCost: parts.frameCost,
    mapCenter: null,
    gateAnswer: null,
    guideStep: null,
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
    letterCenter: (id) => parts.scene()?.letterCenter(id) ?? null,
    bookCenter: null,
    coinCenter: (coin) => parts.checkout()?.coinCenter(coin) ?? null,
    trayCenter: () => parts.checkout()?.trayCenter() ?? null,
  };
  window.__shchuna = hook;
  return hook;
}
