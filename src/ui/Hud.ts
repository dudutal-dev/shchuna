import { Application, Container, Rectangle, Sprite } from 'pixi.js';
import { getArt, loadArt } from '../engine/art';
import { easeOutBack, tween } from '../engine/tween';

/** Screen pixels, so it stays the same physical size on every device. */
const BUTTON_SIZE = 72;
const MARGIN = 12;
const ICON_ALPHA = 0.75;
const UNDO_ART = 'ui/undo.svg';

/** Always-on-screen controls, drawn above the scene. */
export class Hud {
  readonly view = new Container();
  private readonly undoButton = new Container();

  constructor(
    private readonly app: Application,
    private readonly onUndo: () => void,
  ) {}

  async init(): Promise<void> {
    await loadArt([UNDO_ART]);
    const icon = new Sprite(getArt(UNDO_ART));
    icon.anchor.set(0.5);
    icon.width = BUTTON_SIZE;
    icon.height = BUTTON_SIZE;
    const button = this.undoButton;
    button.addChild(icon);
    button.alpha = ICON_ALPHA;
    button.eventMode = 'static';
    button.cursor = 'pointer';
    button.hitArea = new Rectangle(
      -BUTTON_SIZE / 2,
      -BUTTON_SIZE / 2,
      BUTTON_SIZE,
      BUTTON_SIZE,
    );
    button.on('pointerdown', (event) => {
      event.stopPropagation();
      button.scale.set(0.85);
      tween(button.scale, { x: 1, y: 1 }, 180, easeOutBack);
      this.onUndo();
    });
    this.view.addChild(button);
    this.app.renderer.on('resize', this.layout);
    this.layout();
  }

  undoCenter(): { x: number; y: number } {
    return { x: this.undoButton.x, y: this.undoButton.y };
  }

  private readonly layout = (): void => {
    this.undoButton.position.set(
      MARGIN + BUTTON_SIZE / 2,
      this.app.screen.height - MARGIN - BUTTON_SIZE / 2,
    );
  };
}
