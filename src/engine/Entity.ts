import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Interaction, PropDef, PropInstance } from '../types';
import { getArt } from './art';
import { artFor } from './InteractionSystem';
import { easeOutBack, easeOutElastic, tween } from './tween';

/**
 * Smallest touch target in world units. The world is 600 units tall, so on a
 * 375pt-high phone this is still the required 64pt.
 */
export const MIN_TOUCH = 104;
const LIFT_SCALE = 1.1;

/** Shared base of props and characters. Its position is its feet, on the ground. */
export abstract class Entity extends Container {
  /** Where game state says this entity is; it may still be tweening there. */
  targetX = 0;
  targetY = 0;
  lifted = false;
  protected readonly shadow = new Graphics();

  protected constructor(
    readonly entityId: string,
    readonly draggable: boolean,
    readonly interactions: readonly Interaction[],
  ) {
    super();
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.shadow.ellipse(0, 0, 44, 12).fill({ color: 0x3b2f2f, alpha: 0.22 });
    this.shadow.visible = false;
    this.addChild(this.shadow);
  }

  /** Instant response to a touch. */
  squish(): void {
    if (this.lifted) return;
    this.scale.set(0.92);
    tween(this.scale, { x: 1, y: 1 }, 180, easeOutBack);
  }

  setLifted(lifted: boolean): void {
    this.lifted = lifted;
    this.shadow.visible = lifted;
    const scale = lifted ? LIFT_SCALE : 1;
    tween(this.scale, { x: scale, y: scale }, 120, easeOutBack);
  }

  moveTo(x: number, y: number, animate: boolean): void {
    this.targetX = x;
    this.targetY = y;
    if (animate) {
      const distance = Math.hypot(x - this.x, y - this.y);
      tween(this.position, { x, y }, Math.min(120 + distance * 0.6, 340));
    } else {
      this.position.set(x, y);
    }
    this.zIndex = y;
  }
}

const FRAME_MS = 280;

export class PropEntity extends Entity {
  private readonly sprite = new Sprite();
  private frames: string[] = [];
  private frameElapsed = 0;
  private frameIndex = 0;

  constructor(
    readonly def: PropDef,
    instance: PropInstance,
  ) {
    super(instance.id, def.draggable, def.interactions);
    this.sprite.anchor.set(0.5, 1);
    this.addChild(this.sprite);
    this.applyInstance(instance);
    this.moveTo(instance.x, instance.y, false);
  }

  /** Shows the art matching the instance's state. */
  applyInstance(instance: PropInstance): void {
    const frames = artFor(this.def, instance);
    if (frames.join('|') === this.frames.join('|')) return;
    this.frames = frames;
    this.frameIndex = 0;
    this.frameElapsed = 0;
    this.showFrame();
  }

  /** Hidden props, such as milk in a closed fridge, can't be seen or touched. */
  setHidden(hidden: boolean): void {
    this.visible = !hidden;
    this.eventMode = hidden ? 'none' : 'static';
  }

  /** Steps any frame animation along. Call every tick. */
  animate(deltaMs: number): void {
    if (this.frames.length < 2) return;
    this.frameElapsed += deltaMs;
    if (this.frameElapsed < FRAME_MS) return;
    this.frameElapsed = 0;
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    this.showFrame();
  }

  /** A happy shake, for a tap that changes nothing. */
  wiggle(): void {
    this.rotation = 0.12;
    tween(this, { rotation: 0 }, 420, easeOutElastic);
  }

  /** Where a hidden letter sits: the top corner of the art, on the reading side (right). */
  letterSpot(): { x: number; y: number } {
    return { x: this.sprite.width / 2 - 14, y: -this.sprite.height + 14 };
  }

  private showFrame(): void {
    const art = this.frames[this.frameIndex];
    if (!art) return;
    this.sprite.texture = getArt(art);
    const width = Math.max(this.sprite.width, MIN_TOUCH);
    const height = Math.max(this.sprite.height, MIN_TOUCH);
    // Centred on the art, which sits above the entity's feet.
    const top = -(this.sprite.height + height) / 2;
    this.hitArea = new Rectangle(-width / 2, top, width, height);
  }
}
