import { Container, Graphics, Sprite } from 'pixi.js';
import { getArt } from '../engine/art';
import { easeOutBack, tween } from '../engine/tween';

/** What a character wishes for, shown as a picture in a thought bubble. */
export type WishKind = 'eat' | 'sleep' | 'play' | 'order';

export const WISH_ART: Record<WishKind, string> = {
  eat: 'playground/apple.svg',
  sleep: 'home/bed.svg',
  play: 'playground/ball.svg',
  order: 'falafel/pita-full.svg',
};

const RADIUS = 58;
const ICON = 76;
const OUTLINE = 0xc9b48f;

/**
 * A thought bubble over a character's head with a picture of what they would like: no words,
 * so a child who can't read understands it. It grows in, and pops when the wish comes true.
 */
export class WishBubble extends Container {
  /** `side` is where the bubble sits beside the head; its little circles lean back towards it. */
  constructor(
    readonly kind: WishKind,
    side: 'left' | 'right' = 'right',
  ) {
    super();
    this.eventMode = 'none';
    const lean = side === 'right' ? -1 : 1;
    const bubble = new Graphics()
      // Two little circles lead from the head up to the bubble.
      .circle(12 * lean, RADIUS + 34, 8)
      .fill(0xffffff)
      .stroke({ color: OUTLINE, width: 3 })
      .circle(4 * lean, RADIUS + 14, 12)
      .fill(0xffffff)
      .stroke({ color: OUTLINE, width: 3 })
      .circle(0, 0, RADIUS)
      .fill(0xffffff)
      .stroke({ color: OUTLINE, width: 4 });
    const icon = new Sprite(getArt(WISH_ART[kind]));
    icon.anchor.set(0.5);
    const fit = Math.min(ICON / icon.texture.width, ICON / icon.texture.height);
    icon.scale.set(fit);
    this.addChild(bubble, icon);
    this.scale.set(0.1);
    tween(this.scale, { x: 1, y: 1 }, 420, easeOutBack);
  }

  /** The wish came true (or was let go): the bubble shrinks away. */
  pop(): void {
    if (this.destroyed) return;
    tween(this.scale, { x: 1.25, y: 1.25 }, 140, undefined, () => {
      if (this.destroyed) return;
      tween(this, { alpha: 0 }, 200, undefined, () => this.destroy({ children: true }));
    });
  }
}
