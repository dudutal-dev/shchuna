import { Application, Container, Graphics, Rectangle, Sprite, type Ticker } from 'pixi.js';
import { getArt, loadArt } from '../engine/art';
import { safeArea } from '../engine/safeArea';
import { easeOutBack, tween } from '../engine/tween';
import type { StoryLevel } from '../types';

const LEVELS: readonly StoryLevel[] = [1, 2, 3];
const ART: Record<StoryLevel, string> = {
  1: 'ui/kid-small.svg',
  2: 'ui/kid-middle.svg',
  3: 'ui/kid-big.svg',
};
const EDGE: Record<StoryLevel, number> = { 1: 0xffc23c, 2: 0xe5508a, 3: 0x58b8ea };
const PANEL = 0xfff7e6;
/** A card as drawn, before it is scaled to the screen. */
const CARD_WIDTH = 240;
const CARD_HEIGHT = 300;
const GAP = 28;
/** Touches are ignored this long after the pictures appear: a double tap on "start" lands here. */
const READY_MS = 700;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * "Who is playing today?" — asked once, the first time the game is opened: three children,
 * small, middle and big, from right to left. The one tapped sets the age the stories are told
 * for. No age, name or date is asked for or kept: only which of the three pictures.
 */
export class LevelPicker {
  readonly view = new Container();
  private readonly backdrop = new Graphics();
  private readonly cards = new Map<StoryLevel, Container>();
  private elapsed = 0;
  private shownAt = 0;
  private chosen: ((level: StoryLevel) => void) | null = null;

  constructor(private readonly app: Application) {}

  /** Loads the pictures; nothing shows yet. */
  async load(): Promise<void> {
    await loadArt(Object.values(ART));
  }

  show(): void {
    this.backdrop.eventMode = 'static';
    this.view.addChild(this.backdrop);
    for (const level of LEVELS) {
      const card = this.buildCard(level);
      this.cards.set(level, card);
      this.view.addChild(card);
    }
    this.app.stage.addChild(this.view);
    this.app.renderer.on('resize', this.layout);
    this.app.ticker.add(this.sway);
    this.layout();
    this.shownAt = performance.now();
    this.view.alpha = 0;
    tween(this.view, { alpha: 1 }, 200);
  }

  /** Resolves with the picture the child touched. */
  waitForChoice(): Promise<StoryLevel> {
    return new Promise((resolve) => (this.chosen = resolve));
  }

  /** The middle of a picture on screen, for tests. */
  center(level: StoryLevel): { x: number; y: number } | null {
    const card = this.cards.get(level);
    return card ? card.getGlobalPosition() : null;
  }

  destroy(): void {
    this.app.renderer.off('resize', this.layout);
    this.app.ticker.remove(this.sway);
    this.view.destroy({ children: true });
  }

  private buildCard(level: StoryLevel): Container {
    const card = new Container();
    const inner = new Container();
    const frame = new Graphics()
      .roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 40)
      .fill(0xffffff)
      .stroke({ color: EDGE[level], width: 8 });
    // The three are drawn on the same ground at the same scale, so their heights can be compared.
    const kid = new Sprite(getArt(ART[level]));
    kid.anchor.set(0.5, 1);
    kid.position.set(0, CARD_HEIGHT / 2 - 22);
    inner.addChild(frame, kid);
    card.addChild(inner);
    card.eventMode = 'static';
    card.cursor = 'pointer';
    card.hitArea = new Rectangle(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT);
    card.on('pointerdown', (event) => {
      event.stopPropagation();
      // By when the finger came down, not when a busy device got round to it: a queued
      // second tap on "start" must not count however late it is handled.
      const touchedAt = (event.nativeEvent as { timeStamp?: number }).timeStamp || performance.now();
      if (touchedAt - this.shownAt < READY_MS) return;
      inner.scale.set(0.9);
      tween(inner.scale, { x: 1, y: 1 }, 220, easeOutBack);
      const chosen = this.chosen;
      this.chosen = null;
      chosen?.(level);
    });
    return card;
  }

  /** The pictures rock a little, one after another, so it is clear they can be touched. */
  private readonly sway = (ticker: Ticker): void => {
    if (reducedMotion) return;
    this.elapsed += ticker.deltaMS;
    LEVELS.forEach((level, index) => {
      const inner = this.cards.get(level)?.children[0];
      if (inner) inner.rotation = Math.sin(this.elapsed / 520 + index * 1.3) * 0.03;
    });
  };

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    this.backdrop.clear().rect(0, 0, width, height).fill(PANEL);
    const safe = safeArea();
    const across = width - safe.left - safe.right;
    const down = height - safe.top - safe.bottom;
    const row = CARD_WIDTH * 3 + GAP * 4;
    const scale = Math.min(across / row, (down - 2 * GAP) / CARD_HEIGHT, 1.5);
    const step = (CARD_WIDTH + GAP) * scale;
    const middle = safe.left + across / 2;
    // Right to left: the smallest first, on the right.
    LEVELS.forEach((level, index) => {
      const card = this.cards.get(level);
      card?.scale.set(scale);
      card?.position.set(middle + step * (1 - index), safe.top + down / 2);
    });
  };
}
