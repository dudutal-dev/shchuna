import { Application } from 'pixi.js';
import { defaultFamily } from '../characters/catalog';
import { CharacterCreator } from '../characters/CharacterCreator';
import { propDefs } from '../content/props';
import { strings } from '../content/strings.he';
import { AudioManager, BrowserAudioBackend } from '../engine/AudioManager';
import { SaveManager } from '../engine/SaveManager';
import { Scene } from '../engine/Scene';
import { home } from '../locations/home/home.data';
import { playground } from '../locations/playground/playground.data';
import type { LocationData } from '../engine/Scene';
import { Hud } from '../ui/Hud';
import { StartScreen } from '../ui/StartScreen';
import { Actions } from './actions';
import { GameStore } from './store';
import { installTestHook } from './testHook';

const SKY = 0xbfe6ff;

async function createAudio(store: GameStore): Promise<AudioManager> {
  // A dynamic import keeps the line texts and the Web Speech fallback out of production.
  const fallback = import.meta.env.DEV
    ? (await import('../engine/devSpeech')).speakWithBrowserVoice
    : undefined;
  const backend = new BrowserAudioBackend(import.meta.env.BASE_URL, fallback);
  const audio = new AudioManager(backend, () => store.state.settings);
  await audio.init();
  return audio;
}

/** The home, until the map arrives (M7). Tests can open the engine playground instead. */
function pickLocation(): LocationData {
  const params = new URLSearchParams(location.search);
  return params.has('e2e') && params.get('scene') === 'playground' ? playground : home;
}

/** Boots the Pixi application and wires the game together. */
export class Game {
  readonly app = new Application();
  private readonly saves = new SaveManager();

  async start(host: HTMLElement): Promise<void> {
    await this.app.init({
      background: SKY,
      resizeTo: window,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      preference: 'webgl',
    });
    this.app.canvas.setAttribute('role', 'img');
    this.app.canvas.setAttribute('aria-label', strings.appName);
    host.appendChild(this.app.canvas);

    const startScreen = new StartScreen(this.app);
    await startScreen.show();

    const store = new GameStore(await this.saves.load());
    const actions = new Actions(store, this.saves);
    const audio = await createAudio(store);

    // Closing the tab can't wait for the debounce.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saves.flush();
    });

    const location = pickLocation();
    if (location.id === 'home') actions.seedCharacters(defaultFamily());
    const scene = new Scene({ app: this.app, store, actions, defs: propDefs, audio }, location);
    let creator: CharacterCreator | null = null;
    const openCreator = async (): Promise<void> => {
      if (creator || store.state.characters.length === 0) return;
      audio.sfx('tap');
      creator = new CharacterCreator(this.app, store, actions, audio, location.id, () => {
        creator = null;
        if (hook) {
          hook.stage = 'playing';
          hook.creatorCenter = null;
        }
      });
      await creator.open();
      this.app.stage.addChild(creator.view);
      if (hook) {
        const open = creator;
        hook.creatorCenter = (id) => open.center(id as Parameters<CharacterCreator['center']>[0]);
        hook.stage = 'creator';
      }
    };
    const hud = new Hud(this.app, {
      undo: () => {
        audio.sfx('undo');
        actions.undo(location.id);
      },
      family: () => void openCreator(),
    });
    const hook = installTestHook({ store, scene, hud, audio, saves: this.saves });
    await Promise.all([scene.enter(), hud.init()]);
    audio.preload([
      'ui.tap_to_start',
      'ui.welcome',
      ...Object.values(propDefs).map((def) => def.voiceLine),
    ]);

    // Heard right away where the browser allows it. Otherwise iOS holds it until the
    // first touch, and the greeting below cuts it off.
    audio.say('ui.tap_to_start');
    if (hook) hook.stage = 'start';
    await startScreen.waitForTap();
    audio.sfx('success');
    audio.say('ui.welcome');
    startScreen.destroy();
    this.app.stage.addChild(scene.view, hud.view);
    if (hook) hook.stage = 'playing';
  }
}
