import { Application, Container, Graphics, Rectangle, Sprite, type Ticker } from 'pixi.js';
import { MAP_HEIGHT, MAP_WIDTH, PLACES, type PlaceInfo } from '../content/places';
import { getArt, loadArt } from '../engine/art';
import { starBurst } from '../engine/effects';
import { HintSystem, hintIdleMs } from '../engine/HintSystem';
import { LetterSparkle } from '../engine/LetterSparkle';
import { easeOutBack, easeOutElastic, tween } from '../engine/tween';
import { safeArea } from '../engine/safeArea';
import type { HebrewLetter, LocationId } from '../types';

const BACKGROUND_ART = 'map/background.svg';
const CLOUD_ART = 'map/cloud.svg';
const LOCK_ART = 'map/lock.svg';
/** Screen pixels kept clear above the map for the HUD buttons. */
const TOP_INSET = 40;
const ROAD = 0xead9b5;
const ROAD_EDGE = 0xd8c193;

/** The street that joins the places: along the top row, down, and back along the bottom. */
const ROAD_PATH: ReadonlyArray<[number, number]> = [
  [1160, 290],
  [1040, 290],
  [760, 290],
  [480, 272],
  [200, 290],
  [110, 380],
  [150, 470],
  [290, 568],
  [640, 568],
  [960, 568],
  [1110, 470],
  [1160, 290],
];

/**
 * The neighbourhood, all on one screen: open places to tap into, and places still to
 * come under a cloud with a small lock. Home is on the right, where Hebrew starts.
 */
export class NeighbourhoodMap {
  readonly view = new Container();
  private readonly background = new Sprite();
  private readonly world = new Container();
  private readonly places = new Map<LocationId, Container>();
  private sparkle: LetterSparkle | null = null;
  private readonly hints = new HintSystem(performance.now(), hintIdleMs());
  /** Hints wait until the child can see this, not while it loads behind the start screen. */
  private shown = false;

  /** Now on screen: the quiet time before a hint starts counting from here. */
  wake(): void {
    this.shown = true;
    this.hints.touched(performance.now());
  }
  private readonly onAnyTouch = (): void => this.hints.touched(performance.now());
  /** The place the last hint pointed at, for tests. */
  lastHint: LocationId | null = null;

  constructor(
    private readonly app: Application,
    private readonly isOpen: (id: LocationId) => boolean,
    /** A letter hiding on a place, such as bet on the house. */
    private readonly letterOn: (id: LocationId) => HebrewLetter | null,
    private readonly onTap: (place: PlaceInfo, open: boolean) => void,
  ) {}

  async open(): Promise<void> {
    // The background is 2400 wide: at 1.6x it stays inside the 4096px limit of older iPads.
    await Promise.all([
      loadArt([BACKGROUND_ART], 1.6),
      loadArt([CLOUD_ART, LOCK_ART, ...PLACES.map((p) => p.art)]),
    ]);
    this.background.texture = getArt(BACKGROUND_ART);
    this.background.anchor.set(0.5, 1);
    this.view.addChild(this.background, this.world);

    const road = new Graphics().poly(ROAD_PATH.flat(), false);
    road.stroke({ color: ROAD_EDGE, width: 54, join: 'round', cap: 'round' });
    road.poly(ROAD_PATH.flat(), false).stroke({ color: ROAD, width: 42, join: 'round', cap: 'round' });
    this.world.addChild(road);

    // The bottom row stands in front of the top row.
    for (const place of [...PLACES].sort((a, b) => a.y - b.y)) {
      const view = this.buildPlace(place);
      this.places.set(place.id, view);
      this.world.addChild(view);
    }
    this.app.renderer.on('resize', this.layout);
    this.app.ticker.add(this.animate);
    document.addEventListener('pointerdown', this.onAnyTouch, true);
    this.layout();
  }

  destroy(): void {
    this.app.renderer.off('resize', this.layout);
    this.app.ticker.remove(this.animate);
    document.removeEventListener('pointerdown', this.onAnyTouch, true);
    this.view.destroy({ children: true });
  }

  /** Screen point in the middle of a place, for tests and for the letter reveal. */
  center(id: LocationId): { x: number; y: number } | null {
    const view = this.places.get(id);
    if (!view) return null;
    const bounds = view.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  sparkleCenter(): { x: number; y: number } | null {
    return this.sparkle && !this.sparkle.destroyed ? this.sparkle.getGlobalPosition() : null;
  }

  /** The letter was found: the place is just a place again. */
  clearLetter(): void {
    this.sparkle?.destroy({ children: true });
    this.sparkle = null;
  }

  /** A locked place shakes its head, gently. */
  wiggle(id: LocationId): void {
    const inner = this.places.get(id)?.children[0];
    if (!inner) return;
    tween(inner, { rotation: 0.06 }, 90, undefined, () =>
      tween(inner, { rotation: -0.05 }, 120, undefined, () => tween(inner, { rotation: 0 }, 120)),
    );
  }

  private buildPlace(place: PlaceInfo): Container {
    const open = this.isOpen(place.id);
    const view = new Container();
    const inner = new Container();
    view.addChild(inner);
    view.position.set(place.x, place.y);

    const art = new Sprite(getArt(place.art));
    art.anchor.set(0.5, 1);
    inner.addChild(art);
    const { width, height } = art.texture;

    if (!open) {
      art.alpha = 0.55;
      const cloud = new Sprite(getArt(CLOUD_ART));
      cloud.anchor.set(0.5, 1);
      cloud.scale.set((width * 1.1) / cloud.texture.width);
      cloud.y = 12;
      const lock = new Sprite(getArt(LOCK_ART));
      lock.anchor.set(0.5);
      lock.position.set(width * 0.28, -height * 0.3);
      inner.addChild(cloud, lock);
    }

    const letter = this.letterOn(place.id);
    if (open && letter) {
      this.sparkle = new LetterSparkle(letter);
      this.sparkle.position.set(-width * 0.18, -height * 0.62);
      this.sparkle.scale.set(1.4);
      inner.addChild(this.sparkle);
    }

    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new Rectangle(-width / 2, -height, width, height);
    view.on('pointerdown', (event) => {
      event.stopPropagation();
      inner.scale.set(0.92);
      tween(inner.scale, { x: 1, y: 1 }, 220, easeOutBack);
      this.onTap(place, open);
    });
    return view;
  }

  private readonly animate = (ticker: Ticker): void => {
    if (this.sparkle && !this.sparkle.destroyed) this.sparkle.animate(ticker.deltaMS);
    if (this.shown && this.hints.due(performance.now())) this.showHint();
  };

  /** A quiet child is shown somewhere to go: an open place wiggles and twinkles. */
  private showHint(): void {
    const open = PLACES.filter((place) => this.isOpen(place.id));
    const place = open[Math.floor(Math.random() * open.length)];
    const view = place && this.places.get(place.id);
    if (!place || !view) return;
    const inner = view.children[0];
    if (inner) {
      inner.rotation = 0.06;
      tween(inner, { rotation: 0 }, 600, easeOutElastic);
    }
    const bounds = view.getBounds();
    starBurst(this.view, bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.3, {
      count: 6,
      radius: 50,
      size: 10,
      duration: 1200,
      colours: [0xffc23c, 0xfff1b8],
    });
    this.lastHint = place.id;
  }

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    const art = this.background.texture;
    this.background.scale.set(Math.max(width / art.width, height / art.height));
    this.background.position.set(width / 2, height);

    // The places stay clear of a notch and the rounded corners; the landscape runs under them.
    const safe = safeArea();
    const across = width - safe.left - safe.right;
    const top = TOP_INSET + safe.top;
    const down = height - top - safe.bottom;
    const scale = Math.min(across / MAP_WIDTH, down / MAP_HEIGHT);
    this.world.scale.set(scale);
    this.world.position.set(safe.left + (across - MAP_WIDTH * scale) / 2, top + (down - MAP_HEIGHT * scale) / 2);
  };
}
