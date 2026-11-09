import { Container, Rectangle, Sprite } from 'pixi.js';
import { getArt } from '../engine/art';
import { Entity, MIN_TOUCH } from '../engine/Entity';
import { easeOutBack, tween } from '../engine/tween';
import type { Character } from '../types';
import { BODIES, HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES } from './catalog';

const BODY_W = 140;
const BODY_H = 200;
/** Hips, measured up from the feet in body-canvas units. */
const HIPS = 105;
const HEAD_H = 220;
/** The neck point inside the head canvas. */
const NECK_Y = 170;
/** The right hand's centre, relative to the feet. */
const HAND = { x: 53, y: -94 };
const SIT_LEGS = 0.45;
const BREATH_MS = 2600;
/** Accessories drawn in their own colours rather than tinted. */
const FIXED_ACCESSORIES = new Set(['glasses', 'kippa', 'cap', 'bow']);

const part = (name: string) => `characters/${name}.svg`;

/** Every character part, to load before a scene with characters opens. */
export function characterArt(): string[] {
  const hair = Object.values(HAIR_STYLES).flatMap((style) => [style.front, style.back]);
  return [
    ...['arms', 'legs', 'shoes', 'top-tshirt', 'top-sweater', 'top-dress', 'bottom-pants', 'bottom-shorts', 'bottom-skirt'].map(
      (name) => part(`body/${name}`),
    ),
    ...['head', 'face', 'acc-glasses', 'acc-kippa', 'acc-headscarf', 'acc-cap', 'acc-bow'].map((name) =>
      part(`head/${name}`),
    ),
    ...hair.filter((name): name is string => name !== null).map((name) => part(`head/${name}`)),
  ];
}

function sprite(path: string, tint?: number): Sprite {
  const s = new Sprite(getArt(path));
  if (tint !== undefined) s.tint = tint;
  return s;
}

/** A person built from layered, tinted parts. Its position is its feet (or seat, or bed). */
export class CharacterEntity extends Entity {
  private readonly figure = new Container();
  private hand = new Container();
  private breath = Math.random() * BREATH_MS;
  private key = '';

  constructor(character: Character) {
    super(character.id, true, []);
    this.addChild(this.figure);
    this.apply(character);
    this.moveTo(character.x, character.y, false);
  }

  /** Rebuilds the figure when appearance or pose changes. */
  apply(character: Character): void {
    const key = JSON.stringify([character.appearance, character.pose]);
    if (key === this.key) return;
    this.key = key;
    this.build(character);
  }

  /** Where a held prop goes, in the parent's coordinates. */
  handPoint(): { x: number; y: number } {
    const global = this.hand.getGlobalPosition();
    return this.parent ? this.parent.toLocal(global) : global;
  }

  /** A happy hop, for a tap. */
  hop(): void {
    this.figure.y = this.restY - 18;
    tween(this.figure, { y: this.restY }, 380, easeOutBack);
  }

  /** "Ta-da!": a quick grow and settle after a change in the creator. */
  taDa(): void {
    this.figure.scale.set(this.restScale * 1.15);
    tween(this.figure.scale, { x: this.restScale, y: this.restScale }, 420, easeOutBack);
  }

  /** A munching wobble while eating. */
  munch(): void {
    this.figure.rotation = this.restRotation + 0.06;
    tween(this.figure, { rotation: this.restRotation }, 500, easeOutBack);
  }

  animate(deltaMs: number): void {
    if (this.lifted) return;
    this.breath = (this.breath + deltaMs) % BREATH_MS;
    const phase = Math.sin((this.breath / BREATH_MS) * Math.PI * 2);
    this.figure.scale.y = this.restScale * (1 + phase * 0.012);
  }

  private restY = 0;
  private restScale = 1;
  private restRotation = 0;

  private build(character: Character): void {
    const a = character.appearance;
    const body = BODIES[a.body];
    const outfit = OUTFITS[a.outfit] ?? Object.values(OUTFITS)[0]!;
    const skin = SKIN_TONES[a.skinTone] ?? SKIN_TONES[0]!;
    const hairColor = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS.black!;
    const hair = HAIR_STYLES[a.hair] ?? HAIR_STYLES.short!;
    const scarf = a.accessory === 'headscarf';

    this.figure.removeChildren().forEach((child) => child.destroy({ children: true }));

    // Body parts share one canvas anchored at the feet.
    const lower = new Container();
    lower.pivot.y = -HIPS;
    lower.y = -HIPS;
    const upper = new Container();
    const place = (s: Sprite, group: Container) => {
      s.anchor.set(0.5, 1);
      group.addChild(s);
    };
    place(sprite(part('body/legs'), skin), lower);
    place(sprite(part('body/shoes'), outfit.shoesColor), lower);
    if (outfit.top !== 'dress') place(sprite(part(`body/bottom-${outfit.bottom}`), outfit.bottomColor), lower);
    place(sprite(part('body/arms'), skin), upper);
    place(sprite(part(`body/top-${outfit.top}`), outfit.topColor), upper);
    // A new hand each time: the old one went with the old parts.
    this.hand = new Container();
    this.hand.position.set(HAND.x, HAND.y);
    upper.addChild(this.hand);

    // Head parts share one canvas anchored at the neck, which sits on top of the body.
    const headAt = (group: Container) => {
      group.position.set(0, -BODY_H);
      group.scale.set(body.head);
    };
    const back = new Container();
    headAt(back);
    const head = new Container();
    headAt(head);
    const placeHead = (s: Sprite, group: Container) => {
      s.anchor.set(0.5, NECK_Y / HEAD_H);
      group.addChild(s);
    };
    if (hair.back && !scarf) placeHead(sprite(part(`head/${hair.back}`), hairColor), back);
    placeHead(sprite(part('head/head'), skin), head);
    placeHead(sprite(part('head/face')), head);
    if (hair.front && !scarf) placeHead(sprite(part(`head/${hair.front}`), hairColor), head);
    if (a.accessory) {
      const tint = FIXED_ACCESSORIES.has(a.accessory) ? undefined : outfit.topColor;
      placeHead(sprite(part(`head/acc-${a.accessory}`), tint), head);
    }

    this.figure.addChild(back, lower, upper, head);

    // Pose.
    const s = body.scale;
    this.restScale = s;
    this.restRotation = 0;
    this.restY = 0;
    this.figure.x = 0;
    if (character.pose === 'sit') {
      lower.scale.y = SIT_LEGS;
      this.restY = (HIPS - 8) * s;
    } else if (character.pose === 'lie') {
      // Head towards the headboard, on the right; lying on top of the mattress.
      this.restRotation = Math.PI / 2;
      this.figure.x = -(BODY_H + 60) * s * 0.5;
      this.restY = -(BODY_W / 2 - 34) * s;
    }
    this.figure.scale.set(s);
    this.figure.rotation = this.restRotation;
    this.figure.y = this.restY;

    // Measured in this entity's space, so the figure's scale and rotation are included.
    this.hitArea = null;
    const bounds = this.getLocalBounds();
    const width = Math.max(bounds.width, MIN_TOUCH);
    const height = Math.max(bounds.height, MIN_TOUCH);
    this.hitArea = new Rectangle(
      bounds.x + (bounds.width - width) / 2,
      bounds.y + (bounds.height - height) / 2,
      width,
      height,
    );
  }
}
