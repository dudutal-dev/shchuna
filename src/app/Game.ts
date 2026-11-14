import { Application } from 'pixi.js';
import {
  beachPeople,
  clinicPeople,
  defaultFamily,
  falafelPeople,
  ganPeople,
  stationPeople,
} from '../characters/catalog';
import { CharacterCreator } from '../characters/CharacterCreator';
import { letterInfo } from '../content/letters';
import { INVITE_GAP_MS } from '../content/invitations';
import { isOpen, type PlaceInfo } from '../content/places';
import { propDefs } from '../content/props';
import { STORIES, type Story, type StoryEvent, type StoryStep } from '../content/stories';
import { strings } from '../content/strings.he';
import { AudioManager, BrowserAudioBackend } from '../engine/AudioManager';
import { SaveManager } from '../engine/SaveManager';
import { Scene, type LocationData } from '../engine/Scene';
import { loadArt } from '../engine/art';
import { safeArea } from '../engine/safeArea';
import { setNiqqudShown } from '../engine/text';
import { find, hear, letterLines, letterOn } from '../learning/LetterHunt';
import { advance, DEFAULT_LEVEL, nextStory, sanitize, stepsOf } from '../learning/StoryEngine';
import { beach } from '../locations/beach/beach.data';
import { clinic } from '../locations/clinic/clinic.data';
import { falafel } from '../locations/falafel/falafel.data';
import { gan } from '../locations/gan/gan.data';
import { home } from '../locations/home/home.data';
import { Checkout } from '../locations/makolet/Checkout';
import { makolet } from '../locations/makolet/makolet.data';
import { playground } from '../locations/playground/playground.data';
import { station } from '../locations/station/station.data';
import type { HebrewLetter, LocationId, Settings, StoryLevel } from '../types';
import { Hud } from '../ui/Hud';
import { LetterBook } from '../ui/LetterBook';
import { revealLetter } from '../ui/LetterReveal';
import { NeighbourhoodMap } from '../ui/NeighbourhoodMap';
import { ParentGate } from '../ui/ParentGate';
import { ParentGuide } from '../ui/ParentGuide';
import { SettingsScreen } from '../ui/SettingsScreen';
import { StartScreen } from '../ui/StartScreen';
import { GUIDE_ART, StoryStrip } from '../ui/StoryStrip';
import { Actions } from './actions';
import { hideInstallHint, showInstallHint } from './installHint';
import { GameStore } from './store';
import { installTestHook, type TestHook } from './testHook';

const SKY = 0xbfe6ff;
/** Coins in the purse at most; the piggy bank stops topping up beyond this. */
const PURSE_MAX = 50;

const LOCATIONS: Partial<Record<LocationId, LocationData>> = {
  home,
  makolet,
  gan,
  clinic,
  falafel,
  beach,
  station,
  playground,
};

/** Background loops from scripts/gen-music.ts. The engine test scene has none. */
const MUSIC: Partial<Record<LocationId | 'map', string>> = {
  home: 'audio/music/home.mp3',
  makolet: 'audio/music/makolet.mp3',
  gan: 'audio/music/gan.mp3',
  clinic: 'audio/music/clinic.mp3',
  falafel: 'audio/music/falafel.mp3',
  beach: 'audio/music/beach.mp3',
  station: 'audio/music/station.mp3',
  map: 'audio/music/map.mp3',
};

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

/**
 * Where a session opens after the start screen: the map. Tests can go straight into
 * a place with `?e2e&scene=`.
 */
function firstStop(): LocationData | 'map' {
  const params = new URLSearchParams(location.search);
  const asked = params.has('e2e') ? (params.get('scene') as LocationId | null) : null;
  return (asked && LOCATIONS[asked]) || 'map';
}

/** In tests, invitations speak only in the tests that ask for them (`?e2e&invites`). */
function invitationsAllowed(): boolean {
  const params = new URLSearchParams(location.search);
  return !params.has('e2e') || params.has('invites');
}

/** In tests, the guide tells stories only in the tests that ask for them (`?e2e&stories`). */
function storiesAllowedHere(): boolean {
  const params = new URLSearchParams(location.search);
  return !params.has('e2e') || params.has('stories');
}

/** In tests, `?e2e&level=1` tells the stories for that age whatever the save says. */
function testLevel(): StoryLevel | null {
  const params = new URLSearchParams(location.search);
  const asked = params.has('e2e') ? Number(params.get('level')) : 0;
  return asked === 1 || asked === 2 || asked === 3 ? asked : null;
}

/** Boots the Pixi application, wires the game together and moves between places. */
export class Game {
  readonly app = new Application();
  private readonly saves = new SaveManager();
  private store!: GameStore;
  private actions!: Actions;
  private audio!: AudioManager;
  private hud!: Hud;
  private strip!: StoryStrip;
  /** What the strip is showing (story and level), so it is rebuilt only when that changes. */
  private stripShows: string | null = null;
  private hook: TestHook | null = null;
  private scene: Scene | null = null;
  private checkout: Checkout | null = null;
  private map: NeighbourhoodMap | null = null;
  /** The place being played in; meaningless while the map shows. */
  private location: LocationData = home;
  private creator: CharacterCreator | null = null;
  private book: LetterBook | null = null;
  /** True while a parents' screen covers the game. */
  private parents = false;
  private moving = false;
  private playing: string | null = null;
  /** Characters on their way somewhere: chosen on the map. */
  private journey: string[] | null = null;
  /** When the last spoken invitation was, so they stay half a minute apart across places. */
  private lastInviteAt = 0;
  /** Stories the child put away: not offered again until the game is opened afresh. */
  private readonly storiesSkipped = new Set<string>();
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

    // The save comes first, so even the start screen follows the niqqud setting.
    this.store = new GameStore(await this.saves.load());
    setNiqqudShown(this.store.state.settings.showNiqqud);
    const startScreen = new StartScreen(this.app);
    await startScreen.show();
    showInstallHint();

    this.actions = new Actions(this.store, this.saves);
    this.audio = await createAudio(this.store);
    this.actions.seedCharacters([...defaultFamily(), ...ganPeople(), ...clinicPeople(), ...falafelPeople(), ...beachPeople(), ...stationPeople()]);

    this.catchBackButton();
    // A story saved under another level, or one that no longer exists, mustn't strand the child.
    const stories = sanitize(STORIES, this.store.state.stories, this.level());
    if (stories !== this.store.state.stories) this.actions.setStories(stories);

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
      map: () => void this.showMap(),
      book: () => void this.openBook(),
      lockPress: () => this.audio.sfx('tap'),
      lockHeld: () => void this.openParents(),
    });
    this.strip = new StoryStrip({
      onStep: (index) => this.onStripStep(index),
      onGuide: () => this.putStoryAway(),
    });
    this.app.renderer.on('resize', () => this.layoutStrip());
    this.hook = installTestHook({
      store: this.store,
      strip: this.strip,
      scene: () => this.scene,
      checkout: () => this.checkout,
      hud: this.hud,
      audio: this.audio,
      saves: this.saves,
      here: () => (this.map ? 'map' : this.location.id),
      lastHint: () => (this.map ? this.map.lastHint : (this.scene?.lastHint ?? null)),
      story: () => {
        const told = this.storyNow();
        return told ? { id: told.story.id, step: told.index, steps: told.steps.map((step) => step.id) } : null;
      },
      music: () => this.playing,
      fps: () => this.app.ticker.FPS,
      frameCost: (frames) => {
        const gl = (this.app.renderer as unknown as { gl?: WebGL2RenderingContext }).gl;
        const pixel = new Uint8Array(4);
        const start = performance.now();
        for (let i = 0; i < frames; i++) {
          // The ticker runs the game and then draws: the application renders on it.
          this.app.ticker.update(performance.now());
          // Reading a pixel waits for the GPU to finish the frame.
          gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        }
        return (performance.now() - start) / frames;
      },
    });
    const first = firstStop();
    // Everything loads behind the start screen, so the first tap goes straight in.
    // The guide's picture too, so a story's strip is there the moment the story begins.
    await Promise.all([first === 'map' ? this.openMap() : this.enter(first), this.hud.init(), loadArt([GUIDE_ART])]);
    this.audio.preload([
      'ui.tap_to_start',
      'ui.welcome',
      'map.where',
      ...Object.values(propDefs).map((def) => def.voiceLine),
    ]);

    // Heard right away where the browser allows it. Otherwise iOS holds it until the
    // first touch, and the greeting below cuts it off.
    this.audio.say('ui.tap_to_start');
    this.setStage('start');
    await startScreen.waitForTap();
    this.onStartScreen = false;
    hideInstallHint();
    this.audio.sfx('success');
    startScreen.destroy();
    this.app.stage.addChild(this.hud.view, this.strip.view);
    this.layoutStrip();
    if (this.map) {
      this.audio.sayAll(['ui.welcome', 'map.where']);
      this.showMapView();
    } else {
      this.audio.say('ui.welcome');
      this.showScene();
    }
  }

  /** Starts a place's loop, leaving it alone if it is already the one playing. */
  private playMusic(where: LocationId | 'map'): void {
    const url = MUSIC[where] ?? null;
    if (url === this.playing) return;
    this.playing = url;
    this.audio.music(url);
  }

  /** Leaves the place for the neighbourhood map. */
  private async showMap(): Promise<void> {
    if (this.busy() || this.map) return;
    this.moving = true;
    this.audio.sfx('success');
    void this.saves.flush();
    this.leaveScene();
    await this.openMap();
    this.audio.say(this.journey ? 'journey.where' : 'map.where');
    this.showMapView();
    this.moving = false;
  }

  /** Someone set off: the map opens, and the place tapped next is where they arrive. */
  private async startJourney(ids: string[]): Promise<void> {
    if (this.moving || this.map) return;
    this.journey = ids;
    await this.showMap();
  }

  private async openMap(): Promise<void> {
    const map = new NeighbourhoodMap(
      this.app,
      (id) => isOpen(id, this.store.state.unlocked),
      (id) => letterOn(this.store.state.letters, `map-${id}`),
      (place, open) => void this.onPlace(place, open),
      (weather) => this.audio.say(weather === 'rain' ? 'weather.rain' : 'weather.rainbow'),
    );
    await map.open();
    this.map = map;
  }

  private showMapView(): void {
    if (!this.map) return;
    this.app.stage.addChildAt(this.map.view, 0);
    this.map.setTravellers(this.journey !== null);
    this.hud.setMode('map');
    this.playMusic('map');
    this.map.wake();
    if (this.hook) {
      const map = this.map;
      this.hook.mapCenter = (id) =>
        id === 'letter' ? map.sparkleCenter() : map.center(id as LocationId);
      this.hook.weather = () => map.weather;
      this.hook.skyPoint = () => map.skyPoint();
    }
    this.setStage('map');
    this.refreshStrip();
  }

  /** A place on the map was tapped. */
  private async onPlace(place: PlaceInfo, open: boolean): Promise<void> {
    if (this.busy()) return;
    this.audio.sfx('tap');
    const data = LOCATIONS[place.id];
    if (!open || !data) {
      this.map?.wiggle(place.id);
      this.audio.sayAll([place.line, 'letter.hint.later']);
      return;
    }
    this.moving = true;
    // A letter on the place is found on the way in; then in we go.
    const letter = letterOn(this.store.state.letters, `map-${place.id}`);
    const at = this.map?.sparkleCenter();
    if (letter && at) {
      this.map?.clearLetter();
      await this.foundLetter(letter, at);
    }
    this.audio.say(place.line);
    this.moving = false;
    // Travellers arrive at the entrance, on the right where a place opens, side by side.
    const travellers = this.journey;
    this.journey = null;
    if (travellers) {
      const positions = travellers.map((_, index) => ({
        x: data.width - 260 - index * 110,
        y: data.floor.top + 105,
      }));
      this.actions.travel(travellers, data.id, positions);
    }
    await this.goTo(data);
    if (travellers) this.audio.say('react.arrived');
  }

  /** Opens a place, saving on the way. */
  private async goTo(next: LocationData): Promise<void> {
    if (this.busy()) return;
    this.moving = true;
    this.audio.sfx('success');
    void this.saves.flush();
    this.map?.destroy();
    this.map = null;
    if (this.hook) this.hook.mapCenter = null;
    this.leaveScene();
    await this.enter(next);
    this.showScene();
    this.moving = false;
  }

  private leaveScene(): void {
    this.checkout?.destroy();
    this.checkout = null;
    this.scene?.destroy();
    this.scene = null;
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
        onJourney: (ids) => void this.startJourney(ids),
        onStoryEvent: (event) => this.onStoryEvent(event),
        journeyZone: () => {
          const at = this.hud.visibleCenter('map');
          return at ? { ...at, radius: 70 } : null;
        },
        invites: {
          enabled: () => this.store.state.settings.invitations !== false && invitationsAllowed(),
          canSpeak: () => performance.now() - this.lastInviteAt > INVITE_GAP_MS || this.lastInviteAt === 0,
          spoke: () => (this.lastInviteAt = performance.now()),
        },
        letters: {
          on: (instanceId) => letterOn(this.store.state.letters, instanceId),
          found: (letter, at) => void this.foundLetter(letter, at),
        },
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
    this.hud.setMode('scene');
    this.playMusic(this.location.id);
    this.app.stage.addChildAt(this.scene.view, 0);
    this.scene.wake();
    if (this.checkout) this.app.stage.addChildAt(this.checkout.strip, 1);
    this.setStage('playing');
    this.refreshStrip();
    this.offerStory();
  }

  /** The age the stories are told for. */
  private level(): StoryLevel {
    return testLevel() ?? this.store.state.settings.level ?? DEFAULT_LEVEL;
  }

  private storiesAllowed(): boolean {
    return this.store.state.settings.stories !== false && storiesAllowedHere();
  }

  /** The story in progress, with its steps at this level and the one the child is on. */
  private storyNow(): { story: Story; steps: readonly StoryStep[]; index: number; step: StoryStep } | null {
    const active = this.store.state.stories.active;
    const story = active && STORIES.find((candidate) => candidate.id === active.id);
    if (!active || !story || !this.storiesAllowed()) return null;
    const steps = stepsOf(story, this.level());
    const step = steps[active.step];
    return step ? { story, steps, index: active.step, step } : null;
  }

  /** On arriving somewhere with no story in progress: the guide may begin one that starts here. */
  private offerStory(): void {
    const progress = this.store.state.stories;
    if (!this.scene || !this.storiesAllowed() || progress.active) return;
    const whereIs = (id: string) => this.store.state.characters.find((c) => c.id === id)?.location;
    const story = nextStory(STORIES, progress, this.location.id, whereIs, this.storiesSkipped);
    const first = story && stepsOf(story, this.level())[0];
    if (!story || !first) return;
    this.scene.resetProps(story.resets);
    this.actions.setStories({
      ...progress,
      active: { id: story.id, step: 0 },
      offered: progress.offered.includes(story.id) ? progress.offered : [...progress.offered, story.id],
    });
    this.audio.sayAll([story.openLine, first.line]);
    this.refreshStrip();
    this.showStepToTheYoungest(first);
  }

  /** The youngest are shown each step by the hand as it starts; older children only when they ask. */
  private showStepToTheYoungest(step: StoryStep): void {
    if (this.level() === 1 && !this.map && step.place === this.location.id) this.scene?.showHand(step.show);
  }

  private layoutStrip(): void {
    this.strip.layout(this.app.screen, safeArea());
  }

  /**
   * Shows the story's steps across the top, or hides them when no story is being told or a
   * full screen (the letter book, the character creator) is open. The map button breathes
   * when the next step is somewhere else.
   */
  private refreshStrip(): void {
    const told = this.storyNow();
    const covered = this.book !== null || this.creator !== null;
    this.hud.setPulse('map', told !== null && !this.map && told.step.place !== this.location.id);
    if (!told || covered) {
      this.strip.hide();
      this.stripShows = null;
      return;
    }
    const shows = `${told.story.id}:${this.level()}`;
    if (shows === this.stripShows) {
      this.strip.setCurrent(told.index);
      return;
    }
    this.stripShows = shows;
    void this.strip.show(
      told.steps.map((step) => ({
        art: step.art,
        ...(step.word ? { word: propDefs[step.word]?.nameHe } : {}),
      })),
      told.index,
    );
  }

  /** A step in the strip was tapped: it is said again, and the one in progress is shown by the hand. */
  private onStripStep(index: number): void {
    const told = this.storyNow();
    const step = told?.steps[index];
    if (!told || !step || this.busy()) return;
    this.audio.sfx('tap');
    const word = step.word ? propDefs[step.word]?.voiceLine : undefined;
    if (word) this.audio.sayAll([word, step.line]);
    else this.audio.say(step.line);
    if (index === told.index && !this.map && step.place === this.location.id) this.scene?.showHand(step.show);
  }

  /** The guide was tapped: "maybe later". The story comes back the next time the game is opened. */
  private putStoryAway(): void {
    const told = this.storyNow();
    if (!told || this.busy()) return;
    this.audio.sfx('tap');
    this.audio.say('story.later');
    this.storiesSkipped.add(told.story.id);
    const { done, offered } = this.store.state.stories;
    this.actions.setStories({ done, offered });
    this.refreshStrip();
  }

  /** The child did something: if it is what the story was waiting for, the story moves on. */
  private onStoryEvent(event: StoryEvent): void {
    const told = this.storyNow();
    if (!told) return;
    const { progress, outcome } = advance(STORIES, this.store.state.stories, this.level(), event, Date.now());
    if (outcome === 'none') return;
    this.actions.setStories(progress);
    this.refreshStrip();
    if (outcome === 'step') {
      const next = told.steps[told.index + 1];
      if (!next) return;
      this.audio.say(next.line);
      this.showStepToTheYoungest(next);
      return;
    }
    this.audio.sfx('tada');
    if (event.kind === 'fed') this.scene?.celebrate(event.who);
    this.audio.say(told.story.doneLine);
  }

  private addToPurse(amount: number): void {
    const wallet = Math.min(this.store.state.wallet + amount, PURSE_MAX);
    this.actions.setWallet(wallet);
    this.audio.sfx('success');
    this.audio.say('shop.piggy');
  }

  /** A letter was tapped: it is found, said aloud, shown big, then flies into the book. */
  private async foundLetter(letter: HebrewLetter, at: { x: number; y: number }): Promise<void> {
    const { progress, isNew } = find(this.store.state.letters, letter, Date.now());
    if (!isNew) return;
    this.actions.setLetters(progress);
    this.audio.sfx('tada');
    this.audio.say(letterLines.found(letter));
    await revealLetter(this.app, letter, letterInfo(letter).word, at, () => this.hud.center('book'));
  }

  private async openBook(): Promise<void> {
    if (this.busy()) return;
    this.audio.sfx('tap');
    const book = new LetterBook(
      this.app,
      this.store,
      this.audio,
      propDefs,
      [...home.props, ...makolet.props, ...gan.props, ...clinic.props, ...falafel.props, ...beach.props, ...station.props],
      (letter) => this.actions.setLetters(hear(this.store.state.letters, letter)),
      () => {
        this.book = null;
        this.refreshStrip();
        if (this.hook) {
          this.hook.bookCenter = null;
          this.hook.painter = null;
        }
        this.setStage(this.map ? 'map' : 'playing');
      },
    );
    this.book = book;
    this.refreshStrip();
    await book.open();
    this.app.stage.addChild(book.view);
    if (this.hook) {
      this.hook.bookCenter = (id) => book.center(id as HebrewLetter | 'done');
      this.hook.painter = () => book.painterInfo();
    }
    this.setStage('book');
  }

  private async openCreator(): Promise<void> {
    const here = this.store.state.characters.filter((c) => c.location === this.location.id);
    if (this.busy() || this.map || here.length === 0) return;
    this.audio.sfx('tap');
    const creator = new CharacterCreator(
      this.app,
      this.store,
      this.actions,
      this.audio,
      this.location.id,
      () => {
        this.creator = null;
        this.refreshStrip();
        if (this.hook) this.hook.creatorCenter = null;
        this.setStage('playing');
      },
    );
    this.creator = creator;
    this.refreshStrip();
    await creator.open();
    this.app.stage.addChild(creator.view);
    if (this.hook) {
      this.hook.creatorCenter = (id) => creator.center(id as Parameters<CharacterCreator['center']>[0]);
    }
    this.setStage('creator');
  }

  /** The lock was held for two seconds: the gate, then settings if it is passed. */
  private async openParents(): Promise<void> {
    if (this.busy()) return;
    this.parents = true;
    const gate = new ParentGate();
    if (this.hook) this.hook.gateAnswer = () => gate.question?.answer ?? null;
    this.setStage('gate');
    const passed = await gate.open();
    if (this.hook) this.hook.gateAnswer = null;
    if (passed) {
      this.setStage('settings');
      let guide = false;
      await new SettingsScreen().open(this.store.state.settings, {
        letters: this.store.state.letters,
        change: (patch) => this.changeSettings(patch),
        reset: () => void this.resetGame(),
        guide: () => (guide = true),
      });
      if (guide) await this.runGuide();
    }
    this.parents = false;
    this.setStage(this.map ? 'map' : 'playing');
  }

  /** The parents' guided tour, over the screen the child was on. */
  private async runGuide(): Promise<void> {
    const tour = new ParentGuide();
    this.setStage('guide');
    if (this.hook) this.hook.guideStep = () => tour.step;
    await tour.open((id) => this.hud.visibleCenter(id));
    if (this.hook) this.hook.guideStep = null;
  }

  private changeSettings(patch: Partial<Settings>): void {
    this.actions.setSettings(patch);
    setNiqqudShown(this.store.state.settings.showNiqqud);
    this.audio.settingsChanged();
    if (patch.sfx !== undefined) this.audio.sfx('tap');
  }

  /** The parents confirmed twice: a new game, from the start screen. */
  private async resetGame(): Promise<void> {
    await this.saves.reset();
    location.reload();
  }

  /**
   * Android's back button (and the browser's): one step back inside the game instead of
   * leaving it. It closes the letter book or the character creator, and from a place goes to
   * the map. On the map or the start screen it does nothing, so a child can't leave by
   * accident; a parent leaves with the phone's home button.
   */
  private catchBackButton(): void {
    history.pushState({ shchuna: true }, '');
    addEventListener('popstate', () => {
      // Stay one step ahead, so the next press is caught too.
      history.pushState({ shchuna: true }, '');
      if (this.onStartScreen || this.moving || this.parents) return;
      if (this.book) this.book.close();
      else if (this.creator) this.creator.close();
      else if (!this.map) void this.showMap();
    });
  }

  /** Something already holds the screen, or the game is between places. */
  private busy(): boolean {
    return this.moving || this.parents || this.creator !== null || this.book !== null;
  }

  private setStage(stage: TestHook['stage']): void {
    if (this.hook) this.hook.stage = stage;
  }
}
