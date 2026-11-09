import { Application } from 'pixi.js';
import { defaultFamily } from '../characters/catalog';
import { CharacterCreator } from '../characters/CharacterCreator';
import { propDefs } from '../content/props';
import { strings } from '../content/strings.he';
import { AudioManager, BrowserAudioBackend } from '../engine/AudioManager';
import { SaveManager } from '../engine/SaveManager';
import { Scene, type LocationData } from '../engine/Scene';
import { home } from '../locations/home/home.data';
import { Checkout } from '../locations/makolet/Checkout';
import { makolet } from '../locations/makolet/makolet.data';
import { playground } from '../locations/playground/playground.data';
import type { LocationId } from '../types';
import { Hud } from '../ui/Hud';
import { StartScreen } from '../ui/StartScreen';
import { Actions } from './actions';
import { GameStore } from './store';
import { installTestHook, type TestHook } from './testHook';

const SKY = 0xbfe6ff;
/** Coins in the purse at most; the piggy bank stops topping up beyond this. */
const PURSE_MAX = 50;

const LOCATIONS: Partial<Record<LocationId, LocationData>> = { home, makolet, playground };

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

/** Where a new session opens. Tests can ask for another place with `?e2e&scene=`. */
function firstLocation(): LocationData {
  const params = new URLSearchParams(location.search);
  const asked = params.has('e2e') ? (params.get('scene') as LocationId | null) : null;
  return (asked && LOCATIONS[asked]) || home;
}

/** Boots the Pixi application, wires the game together and moves between places. */
export class Game {
  readonly app = new Application();
  private readonly saves = new SaveManager();
  private store!: GameStore;
  private actions!: Actions;
  private audio!: AudioManager;
  private hud!: Hud;
  private hook: TestHook | null = null;
  private scene: Scene | null = null;
  private checkout: Checkout | null = null;
  private location: LocationData = home;
  private creator: CharacterCreator | null = null;
  private moving = false;
  /** True until the child taps in: the only time an update may reload the page. */
  onStartScreen = true;

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

    this.store = new GameStore(await this.saves.load());
    this.actions = new Actions(this.store, this.saves);
    this.audio = await createAudio(this.store);
    this.actions.seedCharacters(defaultFamily());

    // Closing the tab can't wait for the debounce.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saves.flush();
    });

    this.hud = new Hud(this.app, {
      undo: () => {
        this.audio.sfx('undo');
        this.actions.undo(this.location.id);
      },
      family: () => void this.openCreator(),
      // Until the map (M7), the door goes between the two places there are.
      go: () => void this.goTo(this.location.id === 'home' ? makolet : home),
    });
    this.hook = installTestHook({
      store: this.store,
      scene: () => this.scene,
      checkout: () => this.checkout,
      hud: this.hud,
      audio: this.audio,
      saves: this.saves,
    });
    await Promise.all([this.enter(firstLocation()), this.hud.init()]);
    this.audio.preload([
      'ui.tap_to_start',
      'ui.welcome',
      ...Object.values(propDefs).map((def) => def.voiceLine),
    ]);

    // Heard right away where the browser allows it. Otherwise iOS holds it until the
    // first touch, and the greeting below cuts it off.
    this.audio.say('ui.tap_to_start');
    this.setStage('start');
    await startScreen.waitForTap();
    this.onStartScreen = false;
    this.audio.sfx('success');
    this.audio.say('ui.welcome');
    startScreen.destroy();
    this.app.stage.addChild(this.hud.view);
    this.showScene();
    this.setStage('playing');
  }

  /** Leaves this place and opens another, saving on the way. */
  private async goTo(next: LocationData): Promise<void> {
    if (this.moving || this.creator || next.id === this.location.id) return;
    this.moving = true;
    this.audio.sfx('success');
    void this.saves.flush();
    this.checkout?.destroy();
    this.checkout = null;
    this.scene?.destroy();
    this.scene = null;
    await this.enter(next);
    this.showScene();
    this.moving = false;
    this.setStage('playing');
  }

  private async enter(data: LocationData): Promise<void> {
    this.location = data;
    const scene = new Scene(
      {
        app: this.app,
        store: this.store,
        actions: this.actions,
        defs: propDefs,
        audio: this.audio,
        onCoins: (amount) => this.addToPurse(amount),
      },
      data,
    );
    await scene.enter();
    this.scene = scene;
    if (data.id === 'makolet') {
      const checkout = new Checkout(this.app, scene, this.store, this.actions, this.audio, propDefs);
      await checkout.attach();
      this.checkout = checkout;
    }
  }

  /** Puts the scene (and the shop's coin strip) under the HUD. */
  private showScene(): void {
    if (!this.scene) return;
    const people = this.store.state.characters.some((c) => c.location === this.location.id);
    this.hud.setVisible('family', people);
    this.app.stage.addChildAt(this.scene.view, 0);
    if (this.checkout) this.app.stage.addChildAt(this.checkout.strip, 1);
  }

  private addToPurse(amount: number): void {
    const wallet = Math.min(this.store.state.wallet + amount, PURSE_MAX);
    this.actions.setWallet(wallet);
    this.audio.sfx('success');
    this.audio.say('shop.piggy');
  }

  private async openCreator(): Promise<void> {
    const here = this.store.state.characters.filter((c) => c.location === this.location.id);
    if (this.creator || here.length === 0) return;
    this.audio.sfx('tap');
    const creator = new CharacterCreator(
      this.app,
      this.store,
      this.actions,
      this.audio,
      this.location.id,
      () => {
        this.creator = null;
        if (this.hook) this.hook.creatorCenter = null;
        this.setStage('playing');
      },
    );
    this.creator = creator;
    await creator.open();
    this.app.stage.addChild(creator.view);
    if (this.hook) {
      this.hook.creatorCenter = (id) => creator.center(id as Parameters<CharacterCreator['center']>[0]);
    }
    this.setStage('creator');
  }

  private setStage(stage: TestHook['stage']): void {
    if (this.hook) this.hook.stage = stage;
  }
}
