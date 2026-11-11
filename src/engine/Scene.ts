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
import { INVITATIONS, pickInvitation, type Invitation, type InviteTarget } from '../content/invitations';
import { GhostFinger, HAND_ART } from '../ui/GhostFinger';
import { LetterSparkle } from './LetterSparkle';
import { buttonSize, safeArea } from './safeArea';
import { getArt, loadArt } from './art';
import type { SoundPlayer } from './AudioManager';
import { rtl } from './text';
import {
  isHidden,
  openSurfaces,
  resolveDrop,
  type Activity,
  type FloorBand,
  type Surface,
} from './DragSystem';
import { Entity, PropEntity } from './Entity';
import { allArtOf, GestureTracker, petSound, resolveTap, resolveUseOn } from './InteractionSystem';
import { BUTTON_SIZE, makeButton } from '../ui/Hud';
import { easeInQuad, easeOutBack, easeOutQuad, killTweens, tween } from './tween';

/** Scene height in world units; the scale is derived from the screen height. */
export const WORLD_HEIGHT = 600;
const EDGE_SCROLL_ZONE_PX = 70;
const EDGE_SCROLL_SPEED_PX_PER_MS = 0.7;
const NAME_BUBBLE_MS = 2500;
/** Screen pixels, per the 32px minimum for text a child sees. */
const NAME_FONT_PX = 40;
/** How close to an open wardrobe a character must be put down to change clothes. */
const OUTFIT_RADIUS = 150;
/** A flick keeps the room sliding: it starts at the finger's speed and slows by this per frame. */
const FLING_FRICTION = 0.94;
const FLING_MIN_PX_PER_MS = 0.25;
const FLING_MAX_PX_PER_MS = 4;
/**
 * Lifting the finger within this many frames of its last move is a flick; later, a stop.
 * Counted in frames, not milliseconds, so a slow device judges it the same way.
 */
const FLING_WINDOW_FRAMES = 3;
/** The arrows move the room by most of a screen, so something already seen stays in view. */
const ARROW_STEP = 0.8;
const ARROW_ART = 'ui/arrow.svg';
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
  /** Spoken invitations: whether the parents allow them, and keeping them apart. */
  invites?: {
    enabled(): boolean;
    canSpeak(): boolean;
    spoke(): void;
  };
  /** The letter hunt: which prop hides a letter, and what happens when one is tapped. */
  letters?: {
    on(instanceId: string): HebrewLetter | null;
    found(letter: HebrewLetter, screenPoint: { x: number; y: number }): void;
  };
}

type PointerSession =
  | { kind: 'pan'; lastX: number; lastAt: number; velocity: number; idleFrames: number }
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
  /** The see-through hand that shows what an invitation means. */
  private readonly ghost = new GhostFinger();
  /** Invitations the child has already taken up in this visit. */
  private readonly invitesDone = new Set<string>();
  private readonly invitesShown = new Map<string, number>();
  /** When each TV watcher laughs next (clock time). */
  private readonly laughAt = new Map<string, number>();
  /** When a laugh was last heard; never, at first, so the first one is. */
  private lastLaugh = -Infinity;
  /** Pixels per millisecond the room is still sliding after a flick. */
  private fling = 0;
  /** Big arrows at the screen's sides that slide the room: easier than a swipe for small hands. */
  private readonly arrows = new Map<'left' | 'right', Container>();

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
    await Promise.all([loadArt([...art, ARROW_ART, HAND_ART]), loadArt(this.data.background, true)]);

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
    for (const side of ['left', 'right'] as const) {
      // Left shows what lies to the left: the room moves right.
      const arrow = makeButton(ARROW_ART, BUTTON_SIZE, () => this.slide(side === 'left' ? 1 : -1));
      arrow.alpha = 0.85;
      this.arrows.set(side, arrow);
      this.view.addChild(arrow);
    }
    for (const instance of instances) this.addEntity(instance);
    // Above everything in the place, under the HUD.
    this.view.addChild(this.ghost.view);
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
      // A passenger inside a vehicle with its doors shut cannot be seen.
      if (!this.isDragging(entity)) entity.visible = !isHidden(character, this.data.surfaces, instances);
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
    const { width, height } = this.ctx.app.screen;
    this.scale = height / WORLD_HEIGHT;
    this.world.scale.set(this.scale);
    this.scrollTo(this.world.x);
    // Mid-height, between the corner buttons above and the family button below, clear of a notch.
    const size = buttonSize(height);
    const safe = safeArea();
    for (const arrow of this.arrows.values()) arrow.scale.y = size / BUTTON_SIZE;
    this.arrows.get('left')?.scale.set(size / BUTTON_SIZE);
    this.arrows.get('right')?.scale.set(-size / BUTTON_SIZE, size / BUTTON_SIZE);
    this.arrows.get('left')?.position.set(safe.left + 12 + size / 2, height * 0.42);
    this.arrows.get('right')?.position.set(width - safe.right - 12 - size / 2, height * 0.42);
    this.updateArrows();
  };

  /** An arrow shows only when there is more of the place that way. */
  private updateArrows(): void {
    const min = this.minScroll();
    this.arrows.get('left')!.visible = min < 0 && this.world.x < -1;
    this.arrows.get('right')!.visible = min < 0 && this.world.x > min + 1;
  }

  /** An arrow was tapped: the room glides most of a screen that way. */
  private slide(direction: 1 | -1): void {
    this.fling = 0;
    this.ctx.audio.sfx('tap');
    const min = this.minScroll();
    const target = Math.min(Math.max(this.world.x + direction * this.ctx.app.screen.width * ARROW_STEP, min), 0);
    tween(this.world, { x: target }, 450, easeOutQuad);
  }

  /** Screen centre of a side arrow, or null while it is hidden. For tests. */
  arrowCenter(side: 'left' | 'right'): { x: number; y: number } | null {
    const arrow = this.arrows.get(side);
    return arrow?.visible ? { x: arrow.x, y: arrow.y } : null;
  }

  private minScroll(): number {
    return this.ctx.app.screen.width - this.data.width * this.scale;
  }

  private scrollTo(x: number): void {
    const min = this.minScroll();
    // A place narrower than the screen stays centred instead of scrolling.
    this.world.x = min >= 0 ? min / 2 : Math.min(Math.max(x, min), 0);
  }

  private onBackgroundDown(event: FederatedPointerEvent): void {
    this.startPan(event.pointerId, event.global.x);
  }

  /** A finger on the room stops any glide and takes over the scrolling. */
  private startPan(pointerId: number, x: number): void {
    this.fling = 0;
    killTweens(this.world);
    this.pointers.set(pointerId, {
      kind: 'pan',
      lastX: x,
      lastAt: performance.now(),
      velocity: 0,
      idleFrames: 0,
    });
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
      const now = performance.now();
      const dx = x - session.lastX;
      const dt = Math.max(now - session.lastAt, 1);
      // Smoothed, so one jittery event doesn't decide the flick.
      session.velocity = session.velocity * 0.3 + (dx / dt) * 0.7;
      this.scrollTo(this.world.x + dx);
      session.lastX = x;
      session.lastAt = now;
      session.idleFrames = 0;
      return;
    }
    session.screenX = x;
    session.screenY = y;
    if (session.gesture.move(x, y)) {
      if (!session.entity.draggable) {
        // Dragging from fixed furniture scrolls the room, like dragging the wall.
        this.startPan(event.pointerId, x);
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
    if (session.kind === 'pan') {
      // Let go while still moving: the room keeps gliding.
      const recent = session.idleFrames <= FLING_WINDOW_FRAMES;
      if (recent && Math.abs(session.velocity) > FLING_MIN_PX_PER_MS) {
        this.fling = Math.max(-FLING_MAX_PX_PER_MS, Math.min(FLING_MAX_PX_PER_MS, session.velocity));
      }
      return;
    }
    const { entity } = session;
    if (entity instanceof CharacterEntity) {
      if (session.dragging) this.dropCharacter(entity);
      else if (session.gesture.up() && !this.wakeUp(entity) && !this.setOff(entity)) entity.hop();
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
    this.noteDone({ tap: entity.entityId });
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
    if (change.state && Object.values(change.state).includes(false)) this.drive(entity);
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
    if (landing.surfaceId) this.noteDone({ surface: landing.surfaceId });
    const effects = resolveUseOn(instance, landing, this.ctx.defs, instances);
    const own = effects.filter((effect) => effect.id === entity.entityId);
    const others = effects.filter((effect) => effect.id !== entity.entityId);
    const started = effects.some((effect) =>
      Object.values(effect.state ?? {}).some((value) => value !== undefined),
    );
    this.ctx.audio.sfx(started ? 'success' : 'drop');
    // A bowl that has just filled a pita goes back to its place, off the pita.
    const back = started && others.length > 0 && entity.def.returnsAfterUse;
    const at = back
      ? { x: instance.x, y: instance.y, surfaceId: instance.on ?? null }
      : { x: landing.x, y: landing.y, surfaceId: landing.surfaceId };
    entity.moveTo(at.x, at.y, true);
    const state = Object.assign({}, ...own.map((effect) => effect.state));
    this.ctx.actions.commit(id, [
      {
        id: entity.entityId,
        x: at.x,
        y: at.y,
        on: at.surfaceId,
        ...(own.length > 0 ? { state } : {}),
      },
      ...others,
      ...release,
    ]);
    if (started) this.celebrate(others[0]?.id ?? entity.entityId);
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
  /**
   * Eaten, and it goes back where it came from as it was, so there is always more: a stuffed
   * pita returns empty.
   */
  private eat(receiver: Character, instance: PropInstance, release: EntityChange[]): void {
    const person = this.characters.get(receiver.id);
    const origin = this.data.props.find((p) => p.id === instance.id) ?? instance;
    const state = Object.fromEntries(
      Object.keys(instance.state ?? {}).map((key) => [key, origin.state?.[key]]),
    );
    person?.munch();
    this.ctx.audio.sfx('yum');
    this.ctx.audio.say('react.yum');
    this.celebrate(receiver.id);
    this.ctx.actions.commit(this.data.id, [
      { id: instance.id, x: origin.x, y: origin.y, on: origin.on ?? null, state },
      ...release,
    ]);
  }

  private give(
    entity: PropEntity,
    instance: PropInstance,
    receiver: Character,
    release: EntityChange[],
  ): void {
    if (entity.def.food) {
      this.eat(receiver, instance, release);
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
    const activity = surface?.activity;
    if (landing.surfaceId) this.noteDone({ surface: landing.surfaceId });
    const changes: EntityChange[] = [change];
    // Sitting on the swing sets it going, in the same step (one undo stops both).
    if (activity?.kind === 'swing') changes.push({ id: activity.prop, state: { swinging: true } });
    this.ctx.actions.commit(id, changes);
    if (wardrobe) entity.taDa();
    if (activity) this.startActivity(entity, activity);
  }

  /** What happens the moment a character is put somewhere that does something. */
  private startActivity(entity: CharacterEntity, activity: Activity): void {
    this.noteDone({ activity: activity.kind });
    const say = (line: string) => this.ctx.audio.say(line);
    switch (activity.kind) {
      case 'slide': {
        // Let the drop settle on the top, then whoosh down and land standing.
        setTimeout(() => {
          if (entity.destroyed || this.isDragging(entity)) return;
          say('react.wee');
          this.ctx.audio.sfx('success');
          const { to } = activity;
          tween(entity, { x: to.x, y: to.y }, 900, easeInQuad, () => {
            if (entity.destroyed) return;
            this.ctx.actions.commit(this.data.id, [
              { id: entity.entityId, x: to.x, y: to.y, on: null, pose: 'stand' },
            ]);
            entity.hop();
            this.celebrate(entity.entityId);
          });
        }, 350);
        return;
      }
      case 'eat':
        setTimeout(() => this.eatFromTable(entity, activity.table), 600);
        return;
      case 'swim':
        say('react.splash');
        return;
      case 'sunbathe':
        say('react.sun');
        return;
      default:
    }
  }

  /** A character sat at a table eats what is on it, nearest first. */
  private eatFromTable(entity: CharacterEntity, table: string): void {
    if (entity.destroyed) return;
    const food = this.instances()
      .filter((p) => p.on === table && this.defOf(p).food)
      .sort((a, b) => Math.abs(a.x - entity.x) - Math.abs(b.x - entity.x))[0];
    const person = this.people().find((c) => c.id === entity.entityId);
    if (!food || !person) return;
    this.eat(person, food, []);
  }

  /** Every frame: what each character is doing where they are. */
  private updateActivities(): void {
    const instances = this.instances();
    for (const character of this.people()) {
      const entity = this.characters.get(character.id);
      if (!entity || this.isDragging(entity)) continue;
      const surface = character.on ? this.data.surfaces.find((s) => s.id === character.on) : undefined;
      const activity = surface?.activity;
      entity.setAsleep(activity?.kind === 'sleep' && character.pose === 'lie');
      entity.setSunglasses(activity?.kind === 'sunbathe');
      entity.setSwimming(activity?.kind === 'swim');
      let sway = 0;
      if (activity?.kind === 'swing') {
        const swing = instances.find((p) => p.id === activity.prop);
        const seat = this.entities.get(activity.prop);
        // The seat swings 30 units forward and back with the swing's two frames.
        if (swing?.state?.swinging && seat) sway = seat.frame === 0 ? -30 : 30;
      }
      entity.setSway(sway);
      if (activity?.kind === 'watch') {
        const shows = instances.find((p) => p.id === activity.prop)?.state?.[activity.key];
        // Clock time, not frames: a slow device laughs as often as a fast one.
        const now = performance.now();
        const due = this.laughAt.get(character.id) ?? now + 2500 + Math.random() * 3000;
        if (shows && now >= due) {
          entity.giggle();
          // Heard now and then, not from everyone at once.
          if (now - this.lastLaugh > 15_000) {
            this.lastLaugh = now;
            this.ctx.audio.say('react.laugh');
          }
          this.laughAt.set(character.id, now + 4000 + Math.random() * 4000);
        } else {
          this.laughAt.set(character.id, due);
        }
      }
    }
  }

  /**
   * For tests: puts a character on a surface the way a drop would, so an activity can be
   * checked without carrying the character across the rooms by touch.
   */
  testPut(characterId: string, surfaceId: string): boolean {
    const entity = this.characters.get(characterId);
    const surface = this.data.surfaces.find((s) => s.id === surfaceId);
    if (!entity || !surface) return false;
    const x = surface.x + surface.width / 2;
    const changes: EntityChange[] = [
      { id: characterId, x, y: surface.y, on: surface.id, pose: surface.pose ?? 'stand' },
    ];
    if (surface.activity?.kind === 'swing') {
      changes.push({ id: surface.activity.prop, state: { swinging: true } });
    }
    this.ctx.actions.commit(this.data.id, changes);
    this.noteDone({ surface: surface.id });
    if (surface.activity) this.startActivity(entity, surface.activity);
    return true;
  }

  /** Whether a character can be seen (a passenger inside a closed bus cannot). */
  isCharacterVisible(id: string): boolean {
    return this.characters.get(id)?.visible ?? false;
  }

  /** A passenger in the bus was tapped: the doors close and off it goes, as a tap on the bus would. */
  private setOff(entity: CharacterEntity): boolean {
    const character = this.people().find((c) => c.id === entity.entityId);
    const surface = character?.on ? this.data.surfaces.find((s) => s.id === character.on) : undefined;
    if (surface?.activity?.kind !== 'ride') return false;
    const vehicle = this.entities.get(surface.activity.prop);
    if (!vehicle) return false;
    this.tap(vehicle);
    return true;
  }

  /** A sleeper was tapped: they wake up and get out of bed. */
  private wakeUp(entity: CharacterEntity): boolean {
    const character = this.people().find((c) => c.id === entity.entityId);
    const surface = character?.on ? this.data.surfaces.find((s) => s.id === character.on) : undefined;
    if (!character || surface?.activity?.kind !== 'sleep' || character.pose !== 'lie') return false;
    this.ctx.audio.say('react.morning');
    this.ctx.actions.commit(this.data.id, [
      { id: character.id, x: character.x, y: this.data.floor.top + 100, on: null, pose: 'stand' },
    ]);
    setTimeout(() => entity.destroyed || entity.hop(), 250);
    return true;
  }

  /**
   * The doors of a vehicle with passengers just closed: it drives off the screen and back.
   * Only the picture moves; where it stands in the game does not change.
   */
  private drive(vehicle: PropEntity): void {
    const passengers = this.people().some((c) => {
      const surface = this.data.surfaces.find((s) => s.id === c.on);
      return surface?.activity?.kind === 'ride' && surface.activity.prop === vehicle.entityId;
    });
    if (!passengers) return;
    this.ctx.audio.say('react.byebye');
    tween(vehicle.pivot, { x: 1500 }, 1400, easeInQuad, () => {
      setTimeout(() => {
        if (vehicle.destroyed) return;
        vehicle.pivot.x = -1500;
        tween(vehicle.pivot, { x: 0 }, 1500, easeOutQuad);
      }, 900);
    });
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

  private readonly onAnyTouch = (): void => {
    this.hints.touched(performance.now());
    this.ghost.stop();
  };

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

  /**
   * Suggests something to do, aloud, with the see-through hand showing how. False when the
   * parents turned invitations off, one was said a moment ago, or none fits what is on screen.
   */
  private offerInvitation(): boolean {
    const invites = this.ctx.invites;
    const list = INVITATIONS[this.data.id];
    if (!invites?.enabled() || !invites.canSpeak() || !list) return false;
    const instances = this.instances();
    const pick = pickInvitation(list, {
      done: (invitation) => this.invitationDone(invitation, instances),
      timesShown: (id) => this.invitesShown.get(id) ?? 0,
      isOn: (prop, key) => instances.find((p) => p.id === prop)?.state?.[key] === true,
      points: (invitation) => this.invitationPoints(invitation),
    });
    if (!pick) return false;
    this.invitesShown.set(pick.invitation.id, (this.invitesShown.get(pick.invitation.id) ?? 0) + 1);
    invites.spoke();
    this.ctx.audio.say(pick.invitation.line);
    this.ghost.play(pick.from, pick.to);
    this.lastHint = `invite:${pick.invitation.id}`;
    return true;
  }

  private invitationDone(invitation: Invitation, instances: readonly PropInstance[]): boolean {
    if (this.invitesDone.has(invitation.id)) return true;
    const done = invitation.doneWhen;
    return 'state' in done && instances.find((p) => p.id === done.state.prop)?.state?.[done.state.key] === true;
  }

  /** Something happened that an invitation asked for: it won't be offered again this visit. */
  private noteDone(happened: { activity: Activity['kind'] } | { tap: string } | { surface: string }): void {
    for (const invitation of INVITATIONS[this.data.id] ?? []) {
      const done = invitation.doneWhen;
      const match =
        ('activity' in done && 'activity' in happened && done.activity === happened.activity) ||
        ('tap' in done && 'tap' in happened && done.tap === happened.tap) ||
        ('surface' in done && 'surface' in happened && done.surface === happened.surface);
      if (match) this.invitesDone.add(invitation.id);
    }
  }

  /** Where the hand starts and ends, on screen; null when any of it is off screen. */
  private invitationPoints(
    invitation: Invitation,
  ): { from: { x: number; y: number }; to?: { x: number; y: number } } | null {
    const { width, height } = this.ctx.app.screen;
    const onScreen = (p: { x: number; y: number } | null) =>
      p && p.x > 50 && p.x < width - 50 && p.y > 50 && p.y < height - 50 ? p : null;
    const surfacePoint = (id: string) => {
      const top = this.surfaceCenter(id);
      return top ? { x: top.x, y: top.y - 20 * this.scale } : null;
    };
    const propPoint = (ids: readonly string[]) => {
      for (const id of ids) {
        const entity = this.entities.get(id);
        if (!entity?.visible) continue;
        const at = onScreen(this.entityCenter(id));
        if (at) return at;
      }
      return null;
    };
    const resolve = (target: InviteTarget, towards?: { x: number; y: number } | null) => {
      if ('surface' in target) return onScreen(surfacePoint(target.surface));
      if ('prop' in target) return propPoint(target.prop);
      // A person: someone standing on screen, the nearest to where they would go.
      const goal = 'drag' in invitation.show && 'surface' in invitation.show.to ? invitation.show.to.surface : null;
      let best: { x: number; y: number } | null = null;
      let bestDistance = Infinity;
      for (const character of this.people()) {
        if (character.on === goal || character.pose === 'lie') continue;
        const at = onScreen(this.entityCenter(character.id));
        if (!at) continue;
        const distance = towards ? Math.hypot(at.x - towards.x, at.y - towards.y) : 0;
        if (distance < bestDistance) {
          best = at;
          bestDistance = distance;
        }
      }
      return best;
    };
    if ('tap' in invitation.show) {
      const at = resolve(invitation.show.tap);
      return at ? { from: at } : null;
    }
    const to = resolve(invitation.show.to);
    const from = to ? resolve(invitation.show.drag, to) : null;
    return from && to ? { from, to } : null;
  }

  /** Whether the see-through hand is showing now. For tests. */
  get ghostShowing(): boolean {
    return this.ghost.showing;
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
    if (this.offerInvitation()) return;
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
    if (this.fling !== 0) {
      const before = this.world.x;
      this.scrollTo(before + this.fling * ticker.deltaMS);
      this.fling *= FLING_FRICTION ** (ticker.deltaMS / 16.7);
      // Stopped, or reached the end of the place.
      if (Math.abs(this.fling) < 0.02 || this.world.x === before) this.fling = 0;
    }
    this.updateArrows();
    this.cull();
    this.updateActivities();
    for (const entity of this.entities.values()) entity.animate(ticker.deltaMS);
    for (const sparkle of this.sparkles.values()) sparkle.animate(ticker.deltaMS);
    for (const entity of this.characters.values()) entity.animate(ticker.deltaMS);
    this.placeHeldProps();
    for (const session of this.pointers.values()) {
      if (session.kind === 'pan') session.idleFrames += 1;
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
