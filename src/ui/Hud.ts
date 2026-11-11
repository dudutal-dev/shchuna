import { Application, Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import { getArt, loadArt } from '../engine/art';
import { easeOutBack, tween } from '../engine/tween';

/** Screen pixels, so buttons stay the same physical size on every device. */
export const BUTTON_SIZE = 72;
const MARGIN = 12;
const ICON_ALPHA = 0.8;
/** SPEC §12: the parents' lock opens only after a long press, so children don't wander in. */
export const LOCK_HOLD_MS = 2000;
const RING = 0xffc23c;

export type HudButtonId = 'undo' | 'family' | 'map' | 'book' | 'lock';

/** Inside a place every button shows; on the map only the letter book and the lock. */
export type HudMode = 'scene' | 'map';

/** A round icon button that squishes when pressed. */
export function makeButton(art: string, size: number, onPress: () => void): Container {
  const { button, inner } = buttonShell(art, size);
  button.on('pointerdown', (event) => {
    event.stopPropagation();
    squish(inner);
    onPress();
  });
  return button;
}

function buttonShell(art: string, size: number): { button: Container; inner: Container } {
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
  return { button, inner };
}

function squish(inner: Container): void {
  inner.scale.set(0.85);
  tween(inner.scale, { x: 1, y: 1 }, 180, easeOutBack);
}

/**
 * A button that acts only when held: a ring fills around it while the finger stays
 * down, and letting go early just lets the ring run back.
 */
export function makeHoldButton(
  app: Application,
  art: string,
  size: number,
  holdMs: number,
  onPress: () => void,
  onHeld: () => void,
): Container {
  const { button, inner } = buttonShell(art, size);
  const ring = new Graphics();
  button.addChild(ring);
  let pressedAt: number | null = null;

  const draw = (progress: number): void => {
    ring.clear();
    if (progress <= 0) return;
    const radius = size / 2 + 4;
    const start = -Math.PI / 2;
    ring
      .arc(0, 0, radius, start, start + Math.PI * 2 * Math.min(progress, 1))
      .stroke({ color: RING, width: 7, cap: 'round' });
  };
  // Wall-clock time, so a slow frame rate doesn't stretch the press.
  const tick = (): void => {
    if (pressedAt === null) return;
    const heldFor = performance.now() - pressedAt;
    draw(heldFor / holdMs);
    if (heldFor >= holdMs) {
      release();
      onHeld();
    }
  };
  const release = (): void => {
    pressedAt = null;
    app.ticker.remove(tick);
    draw(0);
  };

  button.on('pointerdown', (event) => {
    event.stopPropagation();
    squish(inner);
    onPress();
    pressedAt = performance.now();
    app.ticker.add(tick);
  });
  button.on('pointerup', release);
  button.on('pointerupoutside', release);
  button.on('pointercancel', release);
  return button;
}

/** Always-on-screen controls, drawn above the scene. */
export class Hud {
  readonly view = new Container();
  private readonly buttons = new Map<HudButtonId, Container>();
  private mode: HudMode = 'scene';
  /** Buttons a place has nothing for, such as the family button in the shop. */
  private readonly hidden = new Set<HudButtonId>();

  constructor(
    private readonly app: Application,
    private readonly handlers: Record<Exclude<HudButtonId, 'lock'>, () => void> & {
      lockPress: () => void;
      lockHeld: () => void;
    },
  ) {}

  async init(): Promise<void> {
    const art: Record<HudButtonId, string> = {
      undo: 'ui/undo.svg',
      family: 'ui/family.svg',
      map: 'ui/map.svg',
      book: 'ui/letter-book.svg',
      lock: 'ui/lock.svg',
    };
    await loadArt(Object.values(art));
    for (const id of Object.keys(art) as HudButtonId[]) {
      const button =
        id === 'lock'
          ? makeHoldButton(
              this.app,
              art.lock,
              BUTTON_SIZE,
              LOCK_HOLD_MS,
              this.handlers.lockPress,
              this.handlers.lockHeld,
            )
          : makeButton(art[id], BUTTON_SIZE, this.handlers[id]);
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

  setMode(mode: HudMode): void {
    this.mode = mode;
    this.layout();
  }

  /** Hides a button that has nothing to do here, such as the family button in the shop. */
  setVisible(id: HudButtonId, visible: boolean): void {
    if (visible) this.hidden.delete(id);
    else this.hidden.add(id);
    this.layout();
  }

  /** Kept for existing tests. */
  undoCenter(): { x: number; y: number } {
    return this.center('undo');
  }

  private readonly layout = (): void => {
    const half = BUTTON_SIZE / 2;
    const { width, height } = this.app.screen;
    const top = MARGIN + half;
    const bottom = height - MARGIN - half;
    const right = width - MARGIN - half;
    const onMap = this.mode === 'map';
    const shown = (id: HudButtonId): boolean =>
      !this.hidden.has(id) && (!onMap || id === 'book' || id === 'lock');
    for (const [id, button] of this.buttons) button.visible = shown(id);

    // SPEC §11. Bottom-left, stacked upwards: undo, then family.
    this.buttons.get('undo')?.position.set(MARGIN + half, bottom);
    this.buttons.get('family')?.position.set(MARGIN + half, bottom - BUTTON_SIZE - MARGIN);
    // Top-right: back to the map, with the letter book beside it. On the map the book
    // takes the corner itself.
    this.buttons.get('map')?.position.set(right, top);
    this.buttons.get('book')?.position.set(onMap ? right : right - MARGIN - BUTTON_SIZE, top);
    // Top-left: the parents' lock, small and out of the way.
    this.buttons.get('lock')?.position.set(MARGIN + half, top);
  };
}
