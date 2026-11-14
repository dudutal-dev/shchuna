import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { getArt, loadArt } from '../engine/art';
import { buttonSize } from '../engine/safeArea';
import { rtl } from '../engine/text';
import { easeOutBack, killTweens, tween } from '../engine/tween';

export const GUIDE_ART = 'ui/guide.svg';

const MARGIN = 12;
const GAP = 14;
const INK = 0x3b2f2f;
const HIGHLIGHT = 0xffc23c;
const DONE = 0x3e8e7e;
/** SPEC §10.4: nothing a child reads is smaller than this. */
const WORD_FONT_PX = 32;
const CURRENT_SCALE = 1.2;
const PULSE = 0.07;
const PULSE_MS = 800;

export interface StripStep {
  /** A path under assets/art. */
  art: string;
  /** A pointed word shown instead of the picture, for children who read. */
  word?: string;
}

type Point = { x: number; y: number };

interface Item {
  view: Container;
  /** Scaled for emphasis and the press bounce, so the layout can place `view` freely. */
  inner: Container;
  ring: Graphics;
  tick: Graphics;
  width: number;
}

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The story in pictures across the top of the screen, right to left: the guide, then each
 * step. The step the child is on is bigger and breathes; finished ones carry a tick; the ones
 * to come are pale. Tapping a step says it again; tapping the guide puts the story away.
 */
export class StoryStrip {
  readonly view = new Container();
  private guide: Item | null = null;
  private items: Item[] = [];
  private steps: readonly StripStep[] = [];
  private current = 0;
  private size = 72;
  private screen = { width: 0, height: 0 };
  private safe = { top: 0, left: 0, right: 0 };
  /** Bumped by every show and hide, so a slow art load can't draw over a newer strip. */
  private generation = 0;

  constructor(private readonly options: { onStep(index: number): void; onGuide(): void }) {
    this.view.visible = false;
  }

  async show(steps: readonly StripStep[], current: number): Promise<void> {
    const generation = ++this.generation;
    await loadArt([GUIDE_ART, ...steps.map((step) => step.art)]);
    if (generation !== this.generation) return;
    this.clear();
    this.steps = steps;
    this.current = current;
    this.guide = this.makeItem({ art: GUIDE_ART }, () => this.options.onGuide());
    this.guide.tick.visible = false;
    this.items = steps.map((step, index) => this.makeItem(step, () => this.options.onStep(index)));
    this.view.addChild(this.guide.view, ...this.items.map((item) => item.view));
    this.view.visible = true;
    this.restyle();
    this.place();
  }

  setCurrent(index: number): void {
    if (index === this.current) return;
    this.current = index;
    this.restyle();
    this.place();
  }

  hide(): void {
    this.generation++;
    this.clear();
    this.view.visible = false;
  }

  get showing(): boolean {
    return this.view.visible && this.items.length > 0;
  }

  layout(screen: { width: number; height: number }, safe: { top: number; left: number; right: number }): void {
    this.screen = screen;
    this.safe = safe;
    const size = buttonSize(screen.height);
    if (size !== this.size && this.showing) {
      // The circles are drawn at the button size: redraw them for the new screen.
      this.size = size;
      void this.show(this.steps, this.current);
      return;
    }
    this.size = size;
    this.place();
  }

  stepCenter(index: number): Point | null {
    const item = this.showing ? this.items[index] : undefined;
    return item ? { x: item.view.x, y: item.view.y } : null;
  }

  guideCenter(): Point | null {
    return this.showing && this.guide ? { x: this.guide.view.x, y: this.guide.view.y } : null;
  }

  /** The written word of each step, or null where it is a picture. For tests. */
  words(): (string | null)[] {
    return this.showing ? this.steps.map((step) => step.word ?? null) : [];
  }

  private clear(): void {
    for (const item of [...this.items, ...(this.guide ? [this.guide] : [])]) {
      killTweens(item.inner.scale);
      item.view.destroy({ children: true });
    }
    this.items = [];
    this.guide = null;
  }

  private makeItem(step: StripStep, onPress: () => void): Item {
    const size = this.size;
    const inner = new Container();
    const back = new Graphics();
    const ring = new Graphics();
    let width = size;
    if (step.word) {
      const label = new Text({
        text: rtl(step.word),
        style: { fontFamily: 'Rubik', fontSize: WORD_FONT_PX, fontWeight: '800', fill: INK, padding: 14 },
      });
      label.anchor.set(0.5);
      width = Math.max(size, Math.ceil(label.width) + 28);
      back.roundRect(-width / 2, -size / 2, width, size, size / 2).fill(0xffffff);
      inner.addChild(back, label);
    } else if (step.art === GUIDE_ART) {
      // The guide's art is a finished round button, like the HUD's.
      const icon = new Sprite(getArt(step.art));
      icon.anchor.set(0.5);
      icon.width = size;
      icon.height = size;
      inner.addChild(icon);
    } else {
      back.circle(0, 0, size / 2).fill(0xffffff);
      const picture = new Sprite(getArt(step.art));
      picture.anchor.set(0.5);
      const fit = (size * 0.68) / Math.max(picture.texture.width, picture.texture.height);
      picture.scale.set(fit);
      inner.addChild(back, picture);
    }
    const tick = new Graphics();
    const r = size * 0.17;
    tick.circle(0, 0, r).fill(DONE).stroke({ color: 0xffffff, width: 2 });
    tick
      .moveTo(-r * 0.5, 0)
      .lineTo(-r * 0.1, r * 0.4)
      .lineTo(r * 0.55, -r * 0.4)
      .stroke({ color: 0xffffff, width: Math.max(2, r * 0.3), cap: 'round', join: 'round' });
    tick.position.set(-width / 2 + r * 0.9, size / 2 - r * 0.9);
    inner.addChild(ring, tick);

    const view = new Container();
    view.addChild(inner);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new Rectangle(-width / 2, -size / 2, width, size);
    view.on('pointerdown', (event) => {
      event.stopPropagation();
      onPress();
    });
    return { view, inner, ring, tick, width };
  }

  /** Done, current or still to come: each looks different at a glance. */
  private restyle(): void {
    this.items.forEach((item, index) => {
      const state = index < this.current ? 'done' : index === this.current ? 'current' : 'next';
      item.tick.visible = state === 'done';
      item.view.alpha = state === 'next' ? 0.5 : 1;
      item.ring.clear();
      item.ring
        .roundRect(-item.width / 2, -this.size / 2, item.width, this.size, this.size / 2)
        .stroke(state === 'current' ? { color: HIGHLIGHT, width: 5 } : { color: INK, width: 3, alpha: 0.35 });
      killTweens(item.inner.scale);
      if (state !== 'current') {
        item.inner.scale.set(1);
        return;
      }
      item.inner.scale.set(0.9);
      tween(item.inner.scale, { x: CURRENT_SCALE, y: CURRENT_SCALE }, 260, easeOutBack, () => this.breathe(item, true));
    });
  }

  private breathe(item: Item, out: boolean): void {
    if (reducedMotion() || item !== this.items[this.current]) return;
    const to = CURRENT_SCALE + (out ? PULSE : 0);
    tween(item.inner.scale, { x: to, y: to }, PULSE_MS, undefined, () => this.breathe(item, !out));
  }

  /**
   * In the top row between the lock and the map when there is room; on a narrow phone, in a
   * row of its own just below, so nothing covers a button.
   */
  private place(): void {
    if (!this.guide) return;
    const { width } = this.screen;
    const size = this.size;
    const all = [this.guide, ...this.items];
    const widthOf = (item: Item, index: number) => item.width * (index - 1 === this.current ? CURRENT_SCALE + PULSE : 1);
    const total = all.reduce((sum, item, index) => sum + widthOf(item, index), 0) + GAP * (all.length - 1);
    // The lock on the left; the letter book and the map on the right.
    const leftEdge = this.safe.left + MARGIN + size + MARGIN;
    const rightEdge = width - this.safe.right - MARGIN - (size + MARGIN) * 2;
    const fitsTop = total <= rightEdge - leftEdge;
    const topRow = this.safe.top + MARGIN + size / 2;
    const y = fitsTop ? topRow : topRow + size + MARGIN + (size * (CURRENT_SCALE + PULSE - 1)) / 2;
    const from = fitsTop ? leftEdge : this.safe.left + MARGIN;
    const to = fitsTop ? rightEdge : width - this.safe.right - MARGIN;
    // Right to left, starting with the guide.
    let x = (from + to) / 2 + total / 2;
    all.forEach((item, index) => {
      const w = widthOf(item, index);
      item.view.position.set(x - w / 2, y);
      x -= w + GAP;
    });
  }
}
