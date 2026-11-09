import { Application } from 'pixi.js';
import { propDefs } from '../content/props';
import { strings } from '../content/strings.he';
import { Scene } from '../engine/Scene';
import { SaveManager } from '../engine/SaveManager';
import { playground } from '../locations/playground/playground.data';
import { Hud } from '../ui/Hud';
import { Actions } from './actions';
import { GameStore } from './store';
import { installTestHook } from './testHook';

const SKY = 0xbfe6ff;

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

    const store = new GameStore(await this.saves.load());
    const actions = new Actions(store, this.saves);

    // Closing the tab can't wait for the debounce.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.saves.flush();
    });

    const scene = new Scene({ app: this.app, store, actions, defs: propDefs }, playground);
    await scene.enter();
    const hud = new Hud(this.app, () => actions.undo(playground.id));
    await hud.init();
    this.app.stage.addChild(scene.view, hud.view);

    installTestHook({ store, scene, hud, saves: this.saves });
  }
}
