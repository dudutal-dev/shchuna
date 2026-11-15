import type { AudioManager } from '../engine/AudioManager';
import type { SaveManager } from '../engine/SaveManager';
import type { Scene } from '../engine/Scene';
import type { Coin } from '../learning/CoinCounter';
import type { Checkout } from '../locations/makolet/Checkout';
import type { SaveGame } from '../types';
import type { Hud, HudButtonId } from '../ui/Hud';
import type { StoryStrip } from '../ui/StoryStrip';
import type { GameStore } from './store';

type Point = { x: number; y: number };

export interface TestHook {
  stage:
    | 'loading'
    | 'start'
    | 'map'
    | 'level'
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
  /** The guide's story in progress: its current step, and the step ids at this level. */
  story(): { id: string; step: number; steps: string[] } | null;
  /** A step's place in the story strip, or the guide's; null while the strip is hidden. */
  storyStepCenter(index: number): Point | null;
  storyGuideCenter(): Point | null;
  /** Each step's written word, or null where the strip shows a picture. */
  storyWords(): (string | null)[];
  /** Whether a HUD button is breathing to draw the eye (the map, when the story goes on elsewhere). */
  hudPulsing(id: HudButtonId): boolean;
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
  /** Set while the map shows: where the story guide stands, if a story is on offer or in progress. */
  mapGuide: (() => { place: string; center: Point } | null) | null;
  /** Set while the first-launch "who is playing?" screen shows: a picture's middle. */
  pickCenter: ((level: 1 | 2 | 3) => Point | null) | null;
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
  /** Set while the letter book is open with its stickers page: a story's sticker, in colour or still waiting. */
  bookSticker: ((storyId: string) => 'earned' | 'waiting' | null) | null;
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
  strip: StoryStrip;
  here: () => string;
  lastHint: () => string | null;
  story: () => { id: string; step: number; steps: string[] } | null;
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
    story: parts.story,
    storyStepCenter: (index) => parts.strip.stepCenter(index),
    storyGuideCenter: () => parts.strip.guideCenter(),
    storyWords: () => parts.strip.words(),
    hudPulsing: (id) => parts.hud.isPulsing(id),
    wish: () => parts.scene()?.currentWish ?? null,
    lastEffect: () => parts.scene()?.lastEffect ?? null,
    painter: null,
    weather: null,
    skyPoint: null,
    music: parts.music,
    fps: parts.fps,
    frameCost: parts.frameCost,
    mapCenter: null,
    mapGuide: null,
    pickCenter: null,
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
    bookSticker: null,
    coinCenter: (coin) => parts.checkout()?.coinCenter(coin) ?? null,
    trayCenter: () => parts.checkout()?.trayCenter() ?? null,
  };
  window.__shchuna = hook;
  return hook;
}
