import { Container, Sprite } from 'pixi.js';
import { getArt } from '../engine/art';
import { easeOutQuad, killTweens, tween } from '../engine/tween';

export const HAND_ART = 'ui/hand.svg';
/** The fingertip inside hand.svg (96 × 110). */
const TIP = { x: 34, y: 6 };
const SIZE = 104;
const REPEATS = 2;

type Point = { x: number; y: number };

/**
 * A see-through hand that shows a child what to do: it presses, and either lifts again (a tap)
 * or carries on to another place and lets go there (a drag). Takes no touches itself, and any
 * touch on the screen sends it away.
 */
export class GhostFinger {
  readonly view = new Container();
  private readonly hand = new Sprite();
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor() {
    this.view.eventMode = 'none';
    this.view.visible = false;
    this.view.alpha = 0;
    this.view.addChild(this.hand);
  }

  get showing(): boolean {
    return this.view.visible;
  }

  /** Shows a tap at `from`, or a drag from `from` to `to`, twice over. Screen coordinates. */
  play(from: Point, to?: Point): void {
    this.stop();
    this.hand.texture = getArt(HAND_ART);
    this.hand.anchor.set(TIP.x / 96, TIP.y / 110);
    this.hand.scale.set(SIZE / 96);
    this.view.visible = true;
    const once = (start: number) => {
      this.later(start, () => {
        this.view.position.set(from.x, from.y);
        this.view.scale.set(1);
        tween(this.view, { alpha: 0.95 }, 250);
      });
      // The press.
      this.later(start + 350, () => tween(this.view.scale, { x: 0.85, y: 0.85 }, 150));
      if (to) {
        this.later(start + 550, () => tween(this.view, { x: to.x, y: to.y }, 1100, easeOutQuad));
        this.later(start + 1750, () => tween(this.view.scale, { x: 1, y: 1 }, 150));
      } else {
        this.later(start + 600, () => tween(this.view.scale, { x: 1, y: 1 }, 150));
      }
      this.later(start + (to ? 2000 : 900), () => tween(this.view, { alpha: 0 }, 250));
    };
    const length = to ? 2600 : 1400;
    for (let i = 0; i < REPEATS; i++) once(i * length);
    this.later(REPEATS * length, () => this.stop());
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
    killTweens(this.view);
    killTweens(this.view.scale);
    this.view.visible = false;
    this.view.alpha = 0;
  }

  private later(ms: number, run: () => void): void {
    this.timers.push(setTimeout(run, ms));
  }
}
