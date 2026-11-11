import { Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { getArt } from '../engine/art';
import { Entity, MIN_TOUCH } from '../engine/Entity';
import { easeOutBack, easeOutQuad, tween } from '../engine/tween';
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
/** The eyes in the head canvas, relative to the neck point (face.svg: 78,104 and 122,104). */
const EYES = [-22, 22];
const EYE_Y = -66;
const BLINK_MS = 130;
const ZZZ_EVERY_MS = 1400;
const INK = 0x3b2f2f;
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
  /** Eyelids, shut for a blink or for sleep. Drawn over the eyes in the skin's colour. */
  private lids = new Graphics();
  private sunglasses = new Graphics();
  /** A swim ring and the water around the waist, for a character in the sea. */
  private water = new Container();
  private headView = new Container();
  /** Legs and shoes: hidden under the water while swimming. */
  private lowerView = new Container();
  private nextBlink = 2000 + Math.random() * 3000;
  private blinking = 0;
  private asleep = false;
  private swimming = false;
  private zzz = 0;
  private swayTarget = 0;
  private restX = 0;

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

  /** Asleep in bed: eyes shut, and a "z" floats up now and then. */
  setAsleep(asleep: boolean): void {
    this.asleep = asleep;
  }

  /** Sunbathing on the towel. */
  setSunglasses(on: boolean): void {
    this.sunglasses.visible = on;
  }

  /** In the sea: a swim ring, water around the waist, and a gentle bob. */
  setSwimming(swimming: boolean): void {
    this.swimming = swimming;
    this.water.visible = swimming;
    this.lowerView.visible = !swimming;
  }

  /** On a swing: how far the seat has swung, in this character's units; 0 when still. */
  setSway(offset: number): void {
    this.swayTarget = offset;
  }

  /** A laugh while watching TV. */
  giggle(): void {
    this.figure.rotation = this.restRotation - 0.07;
    tween(this.figure, { rotation: this.restRotation }, 600, easeOutBack);
  }

  animate(deltaMs: number): void {
    if (this.lifted) return;
    this.breath = (this.breath + deltaMs) % BREATH_MS;
    const phase = Math.sin((this.breath / BREATH_MS) * Math.PI * 2);
    this.figure.scale.y = this.restScale * (1 + phase * 0.012);

    // Blinks every few seconds; asleep, the eyes stay shut.
    this.nextBlink -= deltaMs;
    if (this.nextBlink <= 0) {
      this.blinking = BLINK_MS;
      this.nextBlink = 2500 + Math.random() * 3500;
    }
    this.blinking = Math.max(0, this.blinking - deltaMs);
    this.lids.visible = this.asleep || this.blinking > 0;

    if (this.asleep) {
      this.zzz -= deltaMs;
      if (this.zzz <= 0) {
        this.zzz = ZZZ_EVERY_MS;
        this.floatZ();
      }
    }

    // Swaying with a swing, smoothly following the seat.
    const targetX = this.restX + this.swayTarget;
    this.figure.x += (targetX - this.figure.x) * Math.min(1, deltaMs / 120);
    // Bobbing in the water.
    if (this.swimming) this.figure.y = this.restY + Math.sin(this.breath / 300) * 3 * this.restScale;
  }

  /** A "z" rising from a sleeper's head and fading. */
  private floatZ(): void {
    if (!this.parent) return;
    const at = this.toLocal(this.headView.getGlobalPosition());
    const z = new Text({
      text: 'z',
      style: { fontFamily: 'Rubik', fontSize: 34, fontWeight: '800', fill: 0x58b8ea, padding: 6 },
    });
    z.anchor.set(0.5);
    z.position.set(at.x + 10, at.y - 60 * this.restScale);
    z.eventMode = 'none';
    this.addChild(z);
    tween(z, { y: z.y - 70, x: z.x + 24, alpha: 0 }, 1800, easeOutQuad, () => z.destroy());
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

    // Eyelids and sunglasses ride on the head, so they lie down with it.
    this.lids = new Graphics();
    for (const x of EYES) {
      this.lids.ellipse(x, EYE_Y, 9, 10).fill(skin);
      this.lids
        .moveTo(x - 7, EYE_Y + 1)
        .quadraticCurveTo(x, EYE_Y + 6, x + 7, EYE_Y + 1)
        .stroke({ color: INK, width: 3, cap: 'round' });
    }
    this.lids.visible = false;
    this.sunglasses = new Graphics();
    for (const x of EYES) this.sunglasses.roundRect(x - 13, EYE_Y - 10, 26, 20, 8).fill(0x2b2f3d);
    this.sunglasses.moveTo(-9, EYE_Y - 3).lineTo(9, EYE_Y - 3).stroke({ color: 0x2b2f3d, width: 4 });
    this.sunglasses.moveTo(EYES[0]! - 6, EYE_Y - 4).lineTo(EYES[0]! - 1, EYE_Y - 7).stroke({ color: 0xffffff, width: 2, alpha: 0.7 });
    this.sunglasses.visible = false;
    head.addChild(this.lids, this.sunglasses);
    this.headView = head;

    this.lowerView = lower;
    lower.visible = !this.swimming;
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
    this.restX = this.figure.x;

    // The sea: a swim ring and water around the waist, drawn in front of the figure.
    this.water.destroy({ children: true });
    this.water = new Container();
    const waist = -(8 + 26) * s;
    const ring = new Graphics()
      .ellipse(0, waist, 70 * s, 22 * s)
      .fill(0xe4573d)
      .ellipse(0, waist - 4 * s, 46 * s, 12 * s)
      .cut();
    const stripes = new Graphics();
    for (const x of [-48, 0, 48]) stripes.rect(x * s - 7 * s, waist - 4 * s, 14 * s, 22 * s).fill(0xffffff);
    stripes.mask = ring.clone();
    const sea = new Graphics();
    const w = 110 * s;
    sea.moveTo(-w, waist + 8 * s);
    for (let i = 0; i < 4; i++) {
      const x0 = -w + (i * 2 * w) / 4;
      sea.quadraticCurveTo(x0 + w / 4, waist, x0 + w / 2, waist + 8 * s);
    }
    sea.lineTo(w, 26 * s).quadraticCurveTo(0, 40 * s, -w, 26 * s).closePath().fill({ color: 0x58b8ea, alpha: 0.95 });
    // A line of foam along the top of the water.
    const foam = new Graphics();
    foam.moveTo(-w, waist + 8 * s);
    for (let i = 0; i < 4; i++) {
      const x0 = -w + (i * 2 * w) / 4;
      foam.quadraticCurveTo(x0 + w / 4, waist, x0 + w / 2, waist + 8 * s);
    }
    foam.stroke({ color: 0xffffff, width: 4 * s, alpha: 0.9 });
    this.water.addChild(sea, foam, ring, stripes, stripes.mask as Graphics);
    this.water.visible = this.swimming;
    this.addChild(this.water);

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
