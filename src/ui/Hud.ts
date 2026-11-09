import { Application, Container, Rectangle, Sprite } from 'pixi.js';
import { getArt, loadArt } from '../engine/art';
import { easeOutBack, tween } from '../engine/tween';

/** Screen pixels, so buttons stay the same physical size on every device. */
export const BUTTON_SIZE = 72;
const MARGIN = 12;
const ICON_ALPHA = 0.8;

export type HudButtonId = 'undo' | 'family';

/** A round icon button that squishes when pressed. */
export function makeButton(art: string, size: number, onPress: () => void): Container {
  const icon = new Sprite(getArt(art));
  icon.anchor.set(0.5);
  icon.width = size;
  icon.height = size;
  // The press bounce runs on an inner layer, so a layout can still scale the button itself.
  const inner = new Container();
  inner.addChild(icon);
  const button = new Container();
  button.addChild(inner);
  button.eventMode = 'static';
  button.cursor = 'pointer';
  button.hitArea = new Rectangle(-size / 2, -size / 2, size, size);
  button.on('pointerdown', (event) => {
    event.stopPropagation();
    inner.scale.set(0.85);
    tween(inner.scale, { x: 1, y: 1 }, 180, easeOutBack);
    onPress();
  });
  return button;
}

/** Always-on-screen controls, drawn above the scene. */
export class Hud {
  readonly view = new Container();
  private readonly buttons = new Map<HudButtonId, Container>();

  constructor(
    private readonly app: Application,
    private readonly handlers: Record<HudButtonId, () => void>,
  ) {}

  async init(): Promise<void> {
    const art: Record<HudButtonId, string> = { undo: 'ui/undo.svg', family: 'ui/family.svg' };
    await loadArt(Object.values(art));
    for (const id of Object.keys(art) as HudButtonId[]) {
      const button = makeButton(art[id], BUTTON_SIZE, this.handlers[id]);
      button.alpha = ICON_ALPHA;
      this.buttons.set(id, button);
      this.view.addChild(button);
    }
    this.app.renderer.on('resize', this.layout);
    this.layout();
  }

  center(id: HudButtonId): { x: number; y: number } {
    const button = this.buttons.get(id);
    return { x: button?.x ?? 0, y: button?.y ?? 0 };
  }

  /** Kept for existing tests. */
  undoCenter(): { x: number; y: number } {
    return this.center('undo');
  }

  private readonly layout = (): void => {
    const half = BUTTON_SIZE / 2;
    const bottom = this.app.screen.height - MARGIN - half;
    // Bottom-left corner, stacked upwards: undo, then family.
    this.buttons.get('undo')?.position.set(MARGIN + half, bottom);
    this.buttons.get('family')?.position.set(MARGIN + half, bottom - BUTTON_SIZE - MARGIN);
  };
}
