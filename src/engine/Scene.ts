import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type Ticker,
} from 'pixi.js';
import type { Actions, EntityChange } from '../app/actions';
import { cycle } from '../characters/catalog';
import type { GameStore } from '../app/store';
import { CharacterEntity, characterArt } from '../characters/CharacterEntity';
import type { Character, HebrewLetter, LocationId, PropDef, PropInstance } from '../types';
import { starBurst } from './effects';
import { HintSystem, hintIdleMs } from './HintSystem';
import { LetterSparkle } from './LetterSparkle';
import { getArt, loadArt } from './art';
import type { SoundPlayer } from './AudioManager';
import { rtl } from './text';
import { isHidden, openSurfaces, resolveDrop, type FloorBand, type Surface } from './DragSystem';
import { Entity, PropEntity } from './Entity';
import { allArtOf, GestureTracker, petSound, resolveTap, resolveUseOn } from './InteractionSystem';
import { easeOutBack, tween } from './tween';

/** Scene height in world units; the scale is derived from the screen height. */
export const WORLD_HEIGHT = 600;
const EDGE_SCROLL_ZONE_PX = 70;
const EDGE_SCROLL_SPEED_PX_PER_MS = 0.7;
const NAME_BUBBLE_MS = 2500;
/** Screen pixels, per the 32px minimum for text a child sees. */
const NAME_FONT_PX = 40;
/** How close to an open wardrobe a character must be put down to change clothes. */
const OUTFIT_RADIUS = 150;
/** Characters are aimed by their body, not their feet, so seats catch them from further away. */
const SEAT_SNAP_RADIUS = 150;
/** World units beyond the screen edges that still get drawn: the widest prop fits inside. */
const CULL_MARGIN = 400;

export interface LocationData {
  id: LocationId;
  width: number;
  /** Background tiles, laid out left to right. */
  background: string[];
  floor: FloorBand;
  surfaces: Surface[];
  props: PropInstance[];
  /** Part of the place that goes dark while someone lies on this surface (a bedroom). */
  dim?: { surface: string; x: number; width: number };
}

export interface SceneContext {
  app: Application;
  store: GameStore;
  actions: Actions;
  defs: Readonly<Record<string, PropDef>>;
  audio: SoundPlayer;
  /** The piggy bank was tapped. */
  onCoins?: (amount: number) => void;
  /** The letter hunt: which prop hides a letter, and what happens when one is tapped. */
  letters?: {
    on(instanceId: string): HebrewLetter | null;
    found(letter: HebrewLetter, screenPoint: { x: number; y: number }): void;
  };
}

type PointerSession =
  | { kind: 'pan'; lastX: number }
  | {
      kind: 'entity';
      entity: PropEntity | CharacterEntity;
      gesture: GestureTracker;
      dragging: boolean;
      grabX: number;
      grabY: number;
      screenX: number;
      screenY: number;
    };

/** One place: its layers, horizontal scrolling and everything a finger can do in it. */
export class Scene {
  readonly view = new Container();
  private readonly world = new Container();
  private readonly backgroundLayer = new Container();
  private readonly furnitureLayer = new Container();
  private readonly itemLayer = new Container();
  private readonly overlay = new Container();
  private readonly entities = new Map<string, PropEntity>();
  private readonly characters = new Map<string, CharacterEntity>();
  private readonly sparkles = new Map<string, LetterSparkle>();
  private readonly darkness = new Graphics();
  private darknessTarget = 0;
  private readonly pointers = new Map<number, PointerSession>();
  private unsubscribe: (() => void) | undefined;
  private scale = 1;
  private bubble: Container | undefined;
  private bubbleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly hints = new HintSystem(performance.now(), hintIdleMs());
  /** Hints wait until the child can see this, not while it loads behind the start screen. */
  private shown = false;

  /** Now on screen: the quiet time before a hint starts counting from here. */
  wake(): void {
    this.shown = true;
    this.hints.touched(performance.now());
  }
  /** The prop the last hint pointed at, for tests. */
  lastHint: string | null = null;

  constructor(
    private readonly ctx: SceneContext,
    private readonly data: LocationData,
  ) {
    this.itemLayer.sortableChildren = true;
    this.darkness.alpha = 0;
    this.darkness.eventMode = 'none';
    this.world.addChild(this.backgroundLayer, this.furnitureLayer, this.itemLayer, this.darkness);
    this.view.addChild(this.world, this.overlay);
  }

  async enter(): Promise<void> {
    const { actions, app, store } = this.ctx;
    actions.seedProps(this.data.props);
    const instances = this.instances();
    const art = instances.flatMap((instance) => allArtOf(this.defOf(instance)));
    if (this.people().length > 0) art.push(...characterArt());
    await Promise.all([loadArt(art), loadArt(this.data.background, true)]);

    // Tiles keep each texture inside the 4096px limit of older iPads.
    let tileX = 0;
    for (const path of this.data.background) {
      const tile = new Sprite(getArt(path));
      tile.x = tileX;
      tileX += tile.texture.width;
      tile.eventMode = 'static';
      tile.on('pointerdown', (event) => this.onBackgroundDown(event));
      this.backgroundLayer.addChild(tile);
    }
    for (const instance of instances) this.addEntity(instance);
    for (const character of this.people()) this.addCharacter(character);
    if (this.data.dim) {
      const { x, width } = this.data.dim;
      this.darkness.rect(x, 0, width, WORLD_HEIGHT).fill(0x1d2550);
    }
    this.sync();

    this.unsubscribe = store.subscribe(() => this.sync());
    const stage = app.stage;
    stage.eventMode = 'static';
    stage.hitArea = app.screen;
    stage.on('globalpointermove', this.onPointerMove);
    stage.on('pointerup', this.onPointerUp);
    stage.on('pointerupoutside', this.onPointerUp);
    stage.on('pointercancel', this.onPointerUp);
    app.ticker.add(this.onTick);
    app.renderer.on('resize', this.layout);
    // Any touch anywhere, HUD included, counts as the child being busy.
    document.addEventListener('pointerdown', this.onAnyTouch, true);
    this.layout();
    // The neighbourhood reads right to left, so a place opens at its right end.
    this.world.x = this.minScroll();
  }

  destroy(): void {
    const { app } = this.ctx;
    this.unsubscribe?.();
    app.stage.off('globalpointermove', this.onPointerMove);
    app.stage.off('pointerup', this.onPointerUp);
    app.stage.off('pointerupoutside', this.onPointerUp);
    app.stage.off('pointercancel', this.onPointerUp);
    app.ticker.remove(this.onTick);
    app.renderer.off('resize', this.layout);
    document.removeEventListener('pointerdown', this.onAnyTouch, true);
    clearTimeout(this.bubbleTimer);
    this.view.destroy({ children: true });
  }

  /** Screen position of a prop's or character's centre, or null if it isn't in this scene. */
  entityCenter(id: string): { x: number; y: number } | null {
    const entity = this.entities.get(id) ?? this.characters.get(id);
    if (!entity) return null;
    const bounds = entity.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  /**
   * Adds something a place draws for itself: behind the furniture (a cashier behind
   * the counter), on the wall (a painted sign), or in front of everything.
   */
  addToWorld(child: Container, where: 'behindFurniture' | 'wall' | 'front'): void {
    if (where === 'behindFurniture') this.furnitureLayer.addChildAt(child, 0);
    else if (where === 'wall') this.backgroundLayer.addChild(child);
    else this.world.addChildAt(child, this.world.getChildIndex(this.darkness));
  }

  /** Screen position of a prop's hidden letter, or null if it has none showing. */
  letterCenter(instanceId: string): { x: number; y: number } | null {
    const sparkle = this.sparkles.get(instanceId);
    return sparkle?.parent ? sparkle.getGlobalPosition() : null;
  }

  /** Puts a sparkle on each prop whose letter is still hidden, and takes found ones away. */
  private syncSparkles(): void {
    const letters = this.ctx.letters;
    if (!letters) return;
    for (const [id, entity] of this.entities) {
      const letter = letters.on(id);
      const current = this.sparkles.get(id);
      if (current && current.letter !== letter) {
        current.destroy({ children: true });
        this.sparkles.delete(id);
      }
      if (!letter || this.sparkles.has(id)) continue;
      const sparkle = new LetterSparkle(letter);
      sparkle.position.copyFrom(entity.letterSpot());
      entity.addChild(sparkle);
      this.sparkles.set(id, sparkle);
    }
  }

  /** World units to screen pixels, and back. */
  toScreen(point: { x: number; y: number }): { x: number; y: number } {
    return this.world.toGlobal(point);
  }

  toWorld(point: { x: number; y: number }): { x: number; y: number } {
    return this.world.toLocal(point);
  }

  get worldScale(): number {
    return this.scale;
  }

  /** Screen position of the middle of a surface's top, or null if there's no such surface. */
  surfaceCenter(id: string): { x: number; y: number } | null {
    const surface = this.data.surfaces.find((s) => s.id === id);
    return surface ? this.toScreen({ x: surface.x + surface.width / 2, y: surface.y }) : null;
  }

  isEntityVisible(id: string): boolean {
    return this.entities.get(id)?.visible ?? false;
  }

  /** How dark the dimmable part of the place is, from 0 to 1. */
  darknessLevel(): number {
    return this.darkness.alpha;
  }

  private people(): Character[] {
    return this.ctx.store.state.characters.filter((c) => c.location === this.data.id);
  }

  private addCharacter(character: Character): void {
    const entity = new CharacterEntity(character);
    entity.on('pointerdown', (event) => this.onEntityDown(entity, event));
    this.itemLayer.addChild(entity);
    this.characters.set(character.id, entity);
  }

  private instances(): PropInstance[] {
    return this.ctx.store.state.props.filter((prop) => prop.location === this.data.id);
  }

  private defOf(instance: PropInstance): PropDef {
    const def = this.ctx.defs[instance.defId];
    if (!def) throw new Error(`Unknown prop: ${instance.defId}`);
    return def;
  }

  private addEntity(instance: PropInstance): void {
    const def = this.defOf(instance);
    const entity = new PropEntity(def, instance);
    entity.on('pointerdown', (event) => this.onEntityDown(entity, event));
    (def.layer === 'furniture' ? this.furnitureLayer : this.itemLayer).addChild(entity);
    this.entities.set(instance.id, entity);
  }

  /** Brings entities in line with game state, whichever action changed it. */
  private sync(): void {
    const instances = this.instances();
    for (const instance of instances) {
      const entity = this.entities.get(instance.id);
      if (!entity) continue;
      entity.applyInstance(instance);
      if (!this.isDragging(entity)) {
        entity.setHidden(isHidden(instance, this.data.surfaces, instances));
      }
      const moved = entity.targetX !== instance.x || entity.targetY !== instance.y;
      if (moved && !this.isDragging(entity)) entity.moveTo(instance.x, instance.y, true);
    }
    this.syncSparkles();
    let dark = false;
    for (const character of this.people()) {
      const entity = this.characters.get(character.id);
      if (!entity) continue;
      entity.apply(character);
      const moved = entity.targetX !== character.x || entity.targetY !== character.y;
      if (moved && !this.isDragging(entity)) entity.moveTo(character.x, character.y, true);
      if (character.pose === 'lie' && character.on === this.data.dim?.surface) dark = true;
    }
    const target = dark ? 0.35 : 0;
    if (this.darknessTarget !== target) {
      this.darknessTarget = target;
      tween(this.darkness, { alpha: target }, 900);
    }
  }

  private isDragging(entity: Entity): boolean {
    for (const session of this.pointers.values()) {
      if (session.kind === 'entity' && session.entity === entity && session.dragging) return true;
    }
    return false;
  }

  private readonly layout = (): void => {
    this.scale = this.ctx.app.screen.height / WORLD_HEIGHT;
    this.world.scale.set(this.scale);
    this.scrollTo(this.world.x);
  };

  private minScroll(): number {
    return this.ctx.app.screen.width - this.data.width * this.scale;
  }

  private scrollTo(x: number): void {
    const min = this.minScroll();
    // A place narrower than the screen stays centred instead of scrolling.
    this.world.x = min >= 0 ? min / 2 : Math.min(Math.max(x, min), 0);
  }

  private onBackgroundDown(event: FederatedPointerEvent): void {
    this.pointers.set(event.pointerId, { kind: 'pan', lastX: event.global.x });
  }

  private onEntityDown(entity: PropEntity | CharacterEntity, event: FederatedPointerEvent): void {
    event.stopPropagation();
    this.ctx.audio.sfx('tap');
    entity.squish();
    const gesture = new GestureTracker();
    gesture.down(event.global.x, event.global.y, performance.now());
    const local = this.world.toLocal(event.global);
    this.pointers.set(event.pointerId, {
      kind: 'entity',
      entity,
      gesture,
      dragging: false,
      grabX: local.x - entity.x,
      grabY: local.y - entity.y,
      screenX: event.global.x,
      screenY: event.global.y,
    });
  }

  private readonly onPointerMove = (event: FederatedPointerEvent): void => {
    const session = this.pointers.get(event.pointerId);
    if (!session) return;
    const { x, y } = event.global;
    if (session.kind === 'pan') {
      this.scrollTo(this.world.x + x - session.lastX);
      session.lastX = x;
      return;
    }
    session.screenX = x;
    session.screenY = y;
    if (session.gesture.move(x, y)) {
      if (!session.entity.draggable) {
        // Dragging from fixed furniture scrolls the room, like dragging the wall.
        this.pointers.set(event.pointerId, { kind: 'pan', lastX: x });
        return;
      }
      session.dragging = true;
      this.ctx.audio.sfx('lift');
      session.entity.setLifted(true);
      session.entity.zIndex = 100_000;
      this.hideBubble();
    }
    if (session.dragging) this.followPointer(session);
  };

  private followPointer(session: Extract<PointerSession, { kind: 'entity' }>): void {
    const local = this.world.toLocal({ x: session.screenX, y: session.screenY });
    session.entity.position.set(local.x - session.grabX, local.y - session.grabY);
  }

  private readonly onPointerUp = (event: FederatedPointerEvent): void => {
    const session = this.pointers.get(event.pointerId);
    if (!session) return;
    this.pointers.delete(event.pointerId);
    if (session.kind !== 'entity') return;
    const { entity } = session;
    if (entity instanceof CharacterEntity) {
      if (session.dragging) this.dropCharacter(entity);
      else if (session.gesture.up()) entity.hop();
      return;
    }
    if (session.dragging) this.drop(entity);
    else if (session.gesture.up()) this.tap(entity);
  };

  private tap(entity: PropEntity): void {
    const instance = this.instances().find((prop) => prop.id === entity.entityId);
    if (!instance) return;
    // A tap on a prop with a hidden letter finds the letter.
    const sparkle = this.sparkles.get(entity.entityId);
    if (sparkle && this.ctx.letters) {
      this.ctx.letters.found(sparkle.letter, sparkle.getGlobalPosition());
      return;
    }
    const coins = entity.def.interactions.find((i) => i.type === 'coins');
    if (coins?.type === 'coins') {
      entity.wiggle();
      this.ctx.onCoins?.(coins.amount);
      return;
    }
    const change = resolveTap(entity.def, instance);
    if (!change) {
      const sound = petSound(entity.def);
      if (sound) {
        this.ctx.audio.sfx(sound);
        entity.wiggle();
      }
      return;
    }
    this.ctx.audio.sfx('toggle');
    this.ctx.actions.commit(this.data.id, [change]);
    this.celebrate(entity.entityId);
  }

  private drop(entity: PropEntity): void {
    const instances = this.instances();
    const instance = instances.find((prop) => prop.id === entity.entityId);
    if (!instance) return;
    const { floor, surfaces, width, id } = this.data;
    // Let go of it, if someone was holding it.
    const holder = this.people().find((c) => c.holding === instance.id);
    const release: EntityChange[] = holder ? [{ id: holder.id, holding: null }] : [];
    const receiver = this.characterAt(entity.getGlobalPosition(), holder?.id);
    if (receiver) {
      entity.setLifted(false);
      this.give(entity, instance, receiver, release);
      return;
    }
    const usable = openSurfaces(surfaces, instances);
    const landing = resolveDrop({ x: entity.x, y: entity.y }, usable, floor, width);
    entity.setLifted(false);
    const effects = resolveUseOn(instance, landing, this.ctx.defs, instances);
    const own = effects.filter((effect) => effect.id === entity.entityId);
    const others = effects.filter((effect) => effect.id !== entity.entityId);
    const started = effects.some((effect) =>
      Object.values(effect.state ?? {}).some((value) => value !== undefined),
    );
    this.ctx.audio.sfx(started ? 'success' : 'drop');
    entity.moveTo(landing.x, landing.y, true);
    const state = Object.assign({}, ...own.map((effect) => effect.state));
    this.ctx.actions.commit(id, [
      {
        id: entity.entityId,
        x: landing.x,
        y: landing.y,
        on: landing.surfaceId,
        ...(own.length > 0 ? { state } : {}),
      },
      ...others,
      ...release,
    ]);
    if (started) this.celebrate(entity.entityId);
  }

  /** The character under a screen point, if any, other than `except`. */
  private characterAt(point: { x: number; y: number }, except?: string): Character | undefined {
    for (const character of this.people()) {
      if (character.id === except) continue;
      const entity = this.characters.get(character.id);
      const local = entity?.toLocal(point);
      if (local && entity?.hitArea?.contains(local.x, local.y)) return character;
    }
    return undefined;
  }

  /** A prop handed to a character: food gets eaten, anything else is held. */
  private give(
    entity: PropEntity,
    instance: PropInstance,
    receiver: Character,
    release: EntityChange[],
  ): void {
    const person = this.characters.get(receiver.id);
    if (entity.def.food) {
      // Eaten, and it goes back where it came from, so there is always more.
      const origin = this.data.props.find((p) => p.id === instance.id) ?? instance;
      person?.munch();
      this.ctx.audio.sfx('yum');
      this.celebrate(receiver.id);
      this.ctx.actions.commit(this.data.id, [
        { id: instance.id, x: origin.x, y: origin.y, on: origin.on ?? null },
        ...release,
      ]);
      return;
    }
    this.ctx.audio.sfx('success');
    const changes: EntityChange[] = [
      ...release,
      { id: receiver.id, holding: instance.id },
      { id: instance.id, on: null },
    ];
    // Whatever was in that hand before goes down at the character's feet.
    const dropped = receiver.holding;
    if (dropped && dropped !== instance.id) {
      const y = Math.max(receiver.y, this.data.floor.top);
      changes.push({ id: dropped, x: receiver.x + 50, y, on: null });
    }
    this.ctx.actions.commit(this.data.id, changes);
  }

  private dropCharacter(entity: CharacterEntity): void {
    const character = this.people().find((c) => c.id === entity.entityId);
    if (!character) return;
    const { floor, surfaces, width, id } = this.data;
    const seats = openSurfaces(surfaces, this.instances()).filter((s) => s.pose);
    const landing = resolveDrop({ x: entity.x, y: entity.y }, seats, floor, width, SEAT_SNAP_RADIUS);
    const surface = surfaces.find((s) => s.id === landing.surfaceId);
    entity.setLifted(false);
    entity.moveTo(landing.x, landing.y, true);
    const change: EntityChange = {
      id: character.id,
      x: landing.x,
      y: landing.y,
      on: landing.surfaceId,
      pose: surface?.pose ?? 'stand',
    };
    const wardrobe = this.outfitChangerNear(landing);
    if (wardrobe) change.appearance = cycle(character.appearance, 'clothes');
    this.ctx.audio.sfx(wardrobe ? 'success' : 'drop');
    this.ctx.actions.commit(id, [change]);
    if (wardrobe) entity.taDa();
  }

  /** An open wardrobe close to this point, if there is one. */
  private outfitChangerNear(point: { x: number; y: number }): PropInstance | undefined {
    return this.instances().find((instance) => {
      const changer = this.ctx.defs[instance.defId]?.changesOutfit;
      if (!changer || instance.state?.[changer.key] !== true) return false;
      return (
        Math.abs(instance.x - point.x) < OUTFIT_RADIUS &&
        Math.abs(instance.y - point.y) < OUTFIT_RADIUS
      );
    });
  }

  private readonly onAnyTouch = (): void => this.hints.touched(performance.now());

  /**
   * Skips drawing what is off screen. A house is three rooms wide and shows about one,
   * so this saves most of the frame.
   */
  private cull(): void {
    const left = -this.world.x / this.scale - CULL_MARGIN;
    const right = left + this.ctx.app.screen.width / this.scale + 2 * CULL_MARGIN;
    for (const tile of this.backgroundLayer.children) {
      if (tile instanceof Sprite) tile.renderable = tile.x < right && tile.x + tile.texture.width > left;
    }
    for (const layer of [this.furnitureLayer, this.itemLayer]) {
      for (const child of layer.children) child.renderable = child.x > left && child.x < right;
    }
  }

  /** A small "ta-da!" over an entity: something just happened to it. */
  celebrate(id: string): void {
    const at = this.entityCenter(id);
    if (at) starBurst(this.overlay, at.x, at.y, { radius: 70 * Math.max(this.scale, 0.8) });
  }

  /**
   * Nudges a quiet child (SPEC §5.2): something on screen that does something when
   * tapped wiggles, with a few soft twinkles. A hidden letter is the first choice.
   */
  private showHint(): void {
    const width = this.ctx.app.screen.width;
    const candidates = [...this.entities.values()].filter((entity) => {
      if (!entity.visible || this.isDragging(entity)) return false;
      const at = this.entityCenter(entity.entityId);
      if (!at || at.x < 60 || at.x > width - 60) return false;
      return (
        this.sparkles.has(entity.entityId) ||
        entity.def.interactions.some((i) => ['tap', 'toggle', 'pet', 'coins'].includes(i.type))
      );
    });
    const letters = candidates.filter((entity) => this.sparkles.has(entity.entityId));
    const pool = letters.length > 0 ? letters : candidates;
    const entity = pool[Math.floor(Math.random() * pool.length)];
    if (!entity) return;
    const bounds = entity.getBounds();
    entity.wiggle();
    starBurst(this.overlay, bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.3, {
      count: 6,
      radius: 50,
      size: 10,
      duration: 1200,
      colours: [0xffc23c, 0xfff1b8],
    });
    this.lastHint = entity.entityId;
  }

  private readonly onTick = (ticker: Ticker): void => {
    const now = performance.now();
    if (this.shown && this.pointers.size === 0 && this.hints.due(now)) this.showHint();
    this.cull();
    for (const entity of this.entities.values()) entity.animate(ticker.deltaMS);
    for (const sparkle of this.sparkles.values()) sparkle.animate(ticker.deltaMS);
    for (const entity of this.characters.values()) entity.animate(ticker.deltaMS);
    this.placeHeldProps();
    for (const session of this.pointers.values()) {
      if (session.kind !== 'entity') continue;
      if (session.gesture.tick(now) && session.entity instanceof PropEntity) {
        this.showBubble(session.entity);
        this.ctx.audio.say(session.entity.def.voiceLine);
      }
      if (session.dragging) this.edgeScroll(session, ticker.deltaMS);
    }
  };

  /** Keeps every held prop in its holder's hand, wherever the holder goes. */
  private placeHeldProps(): void {
    for (const character of this.people()) {
      if (!character.holding) continue;
      const prop = this.entities.get(character.holding);
      const person = this.characters.get(character.id);
      if (!prop || !person || this.isDragging(prop)) continue;
      const hand = person.handPoint();
      // A held prop hangs from the hand by its middle, not its feet.
      prop.position.set(hand.x, hand.y + prop.height / 2);
      prop.zIndex = person.zIndex + 1;
    }
  }

  /** Holding a dragged prop near the screen edge carries it into the next part of the room. */
  private edgeScroll(
    session: Extract<PointerSession, { kind: 'entity' }>,
    deltaMs: number,
  ): void {
    const width = this.ctx.app.screen.width;
    let direction = 0;
    if (session.screenX < EDGE_SCROLL_ZONE_PX) direction = 1;
    else if (session.screenX > width - EDGE_SCROLL_ZONE_PX) direction = -1;
    if (direction === 0) return;
    this.scrollTo(this.world.x + direction * EDGE_SCROLL_SPEED_PX_PER_MS * deltaMs);
    this.followPointer(session);
  }

  private showBubble(entity: PropEntity): void {
    this.hideBubble();
    const bubble = new Container();
    const label = new Text({
      text: rtl(entity.def.nameHe),
      style: { fontFamily: 'Rubik', fontSize: NAME_FONT_PX, fontWeight: '600', fill: 0x3b2f2f, padding: 12 },
    });
    label.anchor.set(0.5);
    const box = new Graphics()
      .roundRect(-label.width / 2 - 24, -label.height / 2 - 10, label.width + 48, label.height + 20, 28)
      .fill(0xffffff)
      .stroke({ color: 0xffc23c, width: 4 });
    bubble.addChild(box, label);
    const bounds = entity.getBounds();
    const halfWidth = label.width / 2 + 30;
    const screenWidth = this.ctx.app.screen.width;
    bubble.x = Math.min(
      Math.max(bounds.x + bounds.width / 2, halfWidth),
      screenWidth - halfWidth,
    );
    bubble.y = Math.max(bounds.y - 44, 54);
    bubble.scale.set(0.6);
    tween(bubble.scale, { x: 1, y: 1 }, 160, easeOutBack);
    this.overlay.addChild(bubble);
    this.bubble = bubble;
    this.bubbleTimer = setTimeout(() => this.hideBubble(), NAME_BUBBLE_MS);
  }

  private hideBubble(): void {
    clearTimeout(this.bubbleTimer);
    this.bubble?.destroy({ children: true });
    this.bubble = undefined;
  }
}
