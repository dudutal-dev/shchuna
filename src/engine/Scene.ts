import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  type FederatedPointerEvent,
  type Ticker,
} from 'pixi.js';
import type { Actions } from '../app/actions';
import type { GameStore } from '../app/store';
import type { LocationId, PropDef, PropInstance } from '../types';
import { getArt, loadArt } from './art';
import type { SoundPlayer } from './AudioManager';
import { rtl } from './text';
import { resolveDrop, type FloorBand, type Surface } from './DragSystem';
import { Entity, PropEntity } from './Entity';
import { GestureTracker, resolveTap, resolveUseOn } from './InteractionSystem';
import { easeOutBack, tween } from './tween';

/** Scene height in world units; the scale is derived from the screen height. */
export const WORLD_HEIGHT = 600;
const EDGE_SCROLL_ZONE_PX = 70;
const EDGE_SCROLL_SPEED_PX_PER_MS = 0.7;
const NAME_BUBBLE_MS = 2500;
/** Screen pixels, per the 32px minimum for text a child sees. */
const NAME_FONT_PX = 40;

export interface LocationData {
  id: LocationId;
  width: number;
  background: string;
  floor: FloorBand;
  surfaces: Surface[];
  props: PropInstance[];
}

export interface SceneContext {
  app: Application;
  store: GameStore;
  actions: Actions;
  defs: Readonly<Record<string, PropDef>>;
  audio: SoundPlayer;
}

type PointerSession =
  | { kind: 'pan'; lastX: number }
  | {
      kind: 'entity';
      entity: PropEntity;
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
  private readonly pointers = new Map<number, PointerSession>();
  private unsubscribe: (() => void) | undefined;
  private scale = 1;
  private bubble: Container | undefined;
  private bubbleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly ctx: SceneContext,
    private readonly data: LocationData,
  ) {
    this.itemLayer.sortableChildren = true;
    this.world.addChild(this.backgroundLayer, this.furnitureLayer, this.itemLayer);
    this.view.addChild(this.world, this.overlay);
  }

  async enter(): Promise<void> {
    const { actions, app, store } = this.ctx;
    actions.seedProps(this.data.props);
    const instances = this.instances();
    const art = instances.flatMap((instance) => {
      const def = this.defOf(instance);
      return [def.art, ...(def.artStates?.map((entry) => entry.art) ?? [])];
    });
    await Promise.all([loadArt(art), loadArt([this.data.background], true)]);

    const background = new Sprite(getArt(this.data.background));
    background.eventMode = 'static';
    background.on('pointerdown', (event) => this.onBackgroundDown(event));
    this.backgroundLayer.addChild(background);
    for (const instance of instances) this.addEntity(instance);

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
    clearTimeout(this.bubbleTimer);
    this.view.destroy({ children: true });
  }

  /** Screen position of a prop's centre, or null if it isn't in this scene. */
  entityCenter(id: string): { x: number; y: number } | null {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const bounds = entity.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
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
    for (const instance of this.instances()) {
      const entity = this.entities.get(instance.id);
      if (!entity) continue;
      entity.applyInstance(instance);
      const moved = entity.targetX !== instance.x || entity.targetY !== instance.y;
      if (moved && !this.isDragging(entity)) entity.moveTo(instance.x, instance.y, true);
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

  private onEntityDown(entity: PropEntity, event: FederatedPointerEvent): void {
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
    if (session.dragging) this.drop(session.entity);
    else if (session.gesture.up()) this.tap(session.entity);
  };

  private tap(entity: PropEntity): void {
    const instance = this.instances().find((prop) => prop.id === entity.entityId);
    if (!instance) return;
    const change = resolveTap(entity.def, instance);
    if (!change) return;
    this.ctx.audio.sfx('toggle');
    this.ctx.actions.commit(this.data.id, [change]);
  }

  private drop(entity: PropEntity): void {
    const instances = this.instances();
    const instance = instances.find((prop) => prop.id === entity.entityId);
    if (!instance) return;
    const { floor, surfaces, width, id } = this.data;
    const landing = resolveDrop({ x: entity.x, y: entity.y }, surfaces, floor, width);
    entity.setLifted(false);
    const effects = resolveUseOn(instance, landing, this.ctx.defs, instances);
    const own = effects.find((effect) => effect.id === entity.entityId);
    const others = effects.filter((effect) => effect !== own);
    this.ctx.audio.sfx(effects.length > 0 ? 'success' : 'drop');
    entity.moveTo(landing.x, landing.y, true);
    this.ctx.actions.commit(id, [{ ...own, id: entity.entityId, x: landing.x, y: landing.y }, ...others]);
  }

  private readonly onTick = (ticker: Ticker): void => {
    const now = performance.now();
    for (const session of this.pointers.values()) {
      if (session.kind !== 'entity') continue;
      if (session.gesture.tick(now)) {
        this.showBubble(session.entity);
        this.ctx.audio.say(session.entity.def.voiceLine);
      }
      if (session.dragging) this.edgeScroll(session, ticker.deltaMS);
    }
  };

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
