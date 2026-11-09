import { Application, Text } from 'pixi.js';
import { strings } from '../content/strings.he';

const SKY = 0xbfe6ff;
const INK = 0x3b2f2f;

/** Boots the Pixi application and owns the top-level stage. */
export class Game {
  readonly app = new Application();

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

    const title = new Text({
      text: strings.appName,
      style: { fontFamily: 'Rubik', fontSize: 96, fontWeight: '700', fill: INK, padding: 24 },
    });
    title.anchor.set(0.5);
    this.app.stage.addChild(title);

    const layout = (): void => {
      title.position.set(this.app.screen.width / 2, this.app.screen.height / 2);
    };
    this.app.renderer.on('resize', layout);
    layout();
  }
}
