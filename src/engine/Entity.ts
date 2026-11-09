import { Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Interaction, PropDef, PropInstance } from '../types';
import { getArt } from './art';
import { artFor } from './InteractionSystem';
import { easeOutBack, tween } from './tween';

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

export class PropEntity extends Entity {
  private readonly sprite = new Sprite();
  private currentArt = '';

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
    const art = artFor(this.def, instance);
    if (art === this.currentArt) return;
    this.currentArt = art;
    this.sprite.texture = getArt(art);
    const width = Math.max(this.sprite.width, MIN_TOUCH);
    const height = Math.max(this.sprite.height, MIN_TOUCH);
    // Centred on the art, which sits above the entity's feet.
    const top = -(this.sprite.height + height) / 2;
    this.hitArea = new Rectangle(-width / 2, top, width, height);
  }
}
