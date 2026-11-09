import { Application, Container, Graphics, Sprite, Text, type Ticker } from 'pixi.js';
import { strings } from '../content/strings.he';
import { getArt, loadArt } from '../engine/art';
import { rtl } from '../engine/text';

const BACKGROUND_ART = 'ui/start.svg';
const INK = 0x3b2f2f;
const PULSE_PER_MS = 0.003;
const PULSE_SIZE = 0.03;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The first screen. The whole screen is the button, and this tap is what unlocks audio on iOS. */
export class StartScreen {
  readonly view = new Container();
  private readonly background = new Sprite();
  private readonly title = new Text({
    text: rtl(strings.appName),
    style: { fontFamily: 'Rubik', fontSize: 110, fontWeight: '800', fill: INK, padding: 30 },
  });
  private readonly button = new Container();
  private elapsed = 0;

  constructor(private readonly app: Application) {}

  async show(): Promise<void> {
    await loadArt([BACKGROUND_ART], true);
    this.background.texture = getArt(BACKGROUND_ART);
    this.background.anchor.set(0.5, 1);
    this.title.anchor.set(0.5);

    const label = new Text({
      text: rtl(strings.ui.tapToStart),
      style: { fontFamily: 'Rubik', fontSize: 52, fontWeight: '700', fill: 0xffffff, padding: 20 },
    });
    label.anchor.set(0.5);
    const pill = new Graphics()
      .roundRect(-label.width / 2 - 48, -label.height / 2 - 20, label.width + 96, label.height + 40, 48)
      .fill(0x3e8e7e)
      .stroke({ color: 0x2f7264, width: 5 });
    this.button.addChild(pill, label);

    this.view.addChild(this.background, this.title, this.button);
    this.view.eventMode = 'static';
    this.view.hitArea = this.app.screen;
    this.view.cursor = 'pointer';
    this.app.stage.addChild(this.view);

    this.app.renderer.on('resize', this.layout);
    this.app.ticker.add(this.pulse);
    this.layout();
  }

  /** Resolves on the first touch anywhere. */
  waitForTap(): Promise<void> {
    return new Promise((resolve) => this.view.once('pointertap', () => resolve()));
  }

  destroy(): void {
    this.app.renderer.off('resize', this.layout);
    this.app.ticker.remove(this.pulse);
    this.view.destroy({ children: true });
  }

  private readonly pulse = (ticker: Ticker): void => {
    if (reducedMotion) return;
    this.elapsed += ticker.deltaMS;
    this.button.scale.set(this.layoutScale * (1 + Math.sin(this.elapsed * PULSE_PER_MS) * PULSE_SIZE));
  };

  private layoutScale = 1;

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    const artWidth = this.background.texture.width;
    const artHeight = this.background.texture.height;
    this.background.scale.set(Math.max(width / artWidth, height / artHeight));
    this.background.position.set(width / 2, height);
    this.layoutScale = Math.min(height / 600, width / 900, 1.4);
    this.title.scale.set(this.layoutScale);
    this.title.position.set(width / 2, height * 0.26);
    this.button.scale.set(this.layoutScale);
    this.button.position.set(width / 2, height * 0.56);
  };
}
