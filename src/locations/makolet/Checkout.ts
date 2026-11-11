import {
  Application,
  Container,
  Rectangle,
  Sprite,
  Text,
  type FederatedPointerEvent,
} from 'pixi.js';
import { safeArea } from '../../engine/safeArea';
import type { Actions, EntityChange } from '../../app/actions';
import type { GameStore } from '../../app/store';
import { CharacterEntity, characterArt } from '../../characters/CharacterEntity';
import { strings } from '../../content/strings.he';
import { getArt, loadArt } from '../../engine/art';
import type { SoundPlayer } from '../../engine/AudioManager';
import type { Scene } from '../../engine/Scene';
import { rtl } from '../../engine/text';
import { easeOutBack, easeOutQuad, tween } from '../../engine/tween';
import {
  COINS,
  CoinCounter,
  MAX_TOTAL,
  shekelsLine,
  spend,
  type Coin,
  type PayResult,
} from '../../learning/CoinCounter';
import type { PropDef, PropInstance } from '../../types';
import { fridgeSpots } from '../home/fridge';
import { BAG_ID, BELT, CASHIER, makolet, SIGN, TRAY_ID } from './makolet.data';

/** Screen pixels: coins are buttons a small finger must hit, so never below 64. */
const COIN_SIZE = 76;
const COIN_SIZE_SMALL = 64;
const STRIP_GAP = 14;
/** How close to the tray, in screen pixels, a dropped coin counts as paid. */
const TRAY_CATCH_PX = 110;
const BAG_FULL_MS = 2600;
const coinArt = (coin: Coin) => `makolet/coin-${coin}.svg`;

interface CoinDrag {
  pointerId: number;
  coin: Coin;
  view: Container;
  startX: number;
  startY: number;
  moved: boolean;
}

/** A coin: its art with the value printed on it, because the art has no numerals. */
function coinView(coin: Coin, size: number): Container {
  const view = new Container();
  const sprite = new Sprite(getArt(coinArt(coin)));
  sprite.anchor.set(0.5);
  sprite.width = size;
  sprite.height = size;
  const label = new Text({
    text: String(coin),
    style: { fontFamily: 'Rubik', fontSize: size * 0.42, fontWeight: '800', fill: 0x3b2f2f },
  });
  label.anchor.set(0.5);
  view.addChild(sprite, label);
  return view;
}

/**
 * The shop's checkout: products on the belt are named and priced, coins dropped on
 * the tray are counted aloud, change comes back counted too, and what was bought
 * goes to the fridge at home.
 */
export class Checkout {
  /** Coins along the bottom of the screen: the purse. */
  readonly strip = new Container();
  private readonly purseLabel = new Text({
    text: '',
    style: { fontFamily: 'Rubik', fontSize: 34, fontWeight: '700', fill: 0x3b2f2f },
  });
  private readonly sources = new Map<Coin, Container>();
  private coinSize = COIN_SIZE;
  private readonly trayCoins = new Container();
  private cashier: CharacterEntity | null = null;
  private counter: CoinCounter | null = null;
  private belt = new Set<string>();
  private drag: CoinDrag | null = null;
  private unsubscribe: (() => void) | undefined;
  private bagTimer: ReturnType<typeof setTimeout> | undefined;
  private finishing = false;

  constructor(
    private readonly app: Application,
    private readonly scene: Scene,
    private readonly store: GameStore,
    private readonly actions: Actions,
    private readonly audio: SoundPlayer,
    private readonly defs: Readonly<Record<string, PropDef>>,
  ) {}

  static art(): string[] {
    return [...COINS.map(coinArt), ...characterArt()];
  }

  async attach(): Promise<void> {
    await loadArt(Checkout.art());

    this.cashier = new CharacterEntity({
      id: 'cashier',
      appearance: { body: 'adult', skinTone: 3, hair: 'bun', hairColor: 'black', outfit: 'shutters' },
      location: 'makolet',
      x: CASHIER.x,
      y: CASHIER.y,
      pose: 'stand',
    });
    this.cashier.eventMode = 'none';
    this.scene.addToWorld(this.cashier, 'behindFurniture');

    const sign = new Text({
      text: rtl(strings.makolet.sign),
      style: { fontFamily: 'Rubik', fontSize: 50, fontWeight: '800', fill: 0x2f7264, padding: 16 },
    });
    sign.anchor.set(0.5);
    sign.position.set(SIGN.x, SIGN.y);
    this.scene.addToWorld(sign, 'wall');

    const tray = this.trayPoint();
    this.trayCoins.position.set(tray.x, tray.y - 10);
    this.scene.addToWorld(this.trayCoins, 'front');

    for (const coin of COINS) {
      const source = coinView(coin, COIN_SIZE);
      source.eventMode = 'static';
      source.cursor = 'pointer';
      source.hitArea = new Rectangle(-COIN_SIZE / 2, -COIN_SIZE / 2, COIN_SIZE, COIN_SIZE);
      source.on('pointerdown', (event) => this.startCoin(coin, event));
      this.sources.set(coin, source);
      this.strip.addChild(source);
    }
    this.purseLabel.anchor.set(0.5);
    this.strip.addChild(this.purseLabel);

    this.app.stage.on('globalpointermove', this.onMove);
    this.app.stage.on('pointerup', this.onUp);
    this.app.stage.on('pointerupoutside', this.onUp);
    this.app.renderer.on('resize', this.layout);
    // Things left on the belt last time are still waiting to be paid for.
    const waiting = this.beltItems();
    this.belt = new Set(waiting.map((p) => p.id));
    const total = this.total(waiting);
    if (total > 0 && total <= MAX_TOTAL) this.counter = new CoinCounter(total);
    this.unsubscribe = this.store.subscribe(() => this.onStore());
    this.updatePurse();
    this.layout();
  }

  destroy(): void {
    this.unsubscribe?.();
    clearTimeout(this.bagTimer);
    this.app.stage.off('globalpointermove', this.onMove);
    this.app.stage.off('pointerup', this.onUp);
    this.app.stage.off('pointerupoutside', this.onUp);
    this.app.renderer.off('resize', this.layout);
    this.drag?.view.destroy({ children: true });
    this.strip.destroy({ children: true });
  }

  /** Screen centres, for tests. */
  coinCenter(coin: Coin): { x: number; y: number } {
    const source = this.sources.get(coin);
    return source ? source.getGlobalPosition() : { x: 0, y: 0 };
  }

  trayCenter(): { x: number; y: number } {
    return this.scene.toScreen(this.trayPoint());
  }

  private trayPoint(): { x: number; y: number } {
    const tray = makolet.props.find((p) => p.id === TRAY_ID);
    return { x: tray?.x ?? 0, y: (tray?.y ?? 0) - 12 };
  }

  private beltItems(): PropInstance[] {
    return this.store.state.props.filter((p) => p.location === 'makolet' && p.on === BELT);
  }

  private priceOf(prop: PropInstance): number {
    return this.defs[prop.defId]?.price ?? 0;
  }

  private total(items: readonly PropInstance[]): number {
    return items.reduce((sum, p) => sum + this.priceOf(p), 0);
  }

  /** Reacts to products arriving on, or leaving, the belt. */
  private onStore(): void {
    this.updatePurse();
    // A purchase moves things around on purpose; that is not someone using the belt.
    if (this.finishing) return;
    const items = this.beltItems();
    const now = new Set(items.map((p) => p.id));
    const added = items.filter((p) => !this.belt.has(p.id));
    const removed = [...this.belt].filter((id) => !now.has(id));
    this.belt = now;
    if (added.length === 0 && removed.length === 0) return;

    const total = this.total(items);
    // A belt adds up to at most MAX_TOTAL, so every amount has a recording. Extra goes back.
    if (total > MAX_TOTAL && added.length > 0) {
      this.audio.sfx('drop');
      this.returnToShelf(added);
      return;
    }
    const paid = this.counter?.paid ?? 0;
    for (const item of added) {
      const def = this.defs[item.defId];
      if (def) this.audio.sayAll([def.voiceLine, shekelsLine(this.priceOf(item))]);
    }
    if (total === 0) {
      // Everything taken back off the belt: any coins already paid go back to the purse.
      this.counter = null;
      if (paid > 0) this.refund(paid);
      return;
    }
    this.counter = new CoinCounter(total, Math.min(paid, total));
    if (this.counter.done) this.finish({ kind: 'done', paid: total, change: [] });
  }

  private startCoin(coin: Coin, event: FederatedPointerEvent): void {
    event.stopPropagation();
    this.audio.sfx('lift');
    const view = coinView(coin, this.coinSize);
    view.position.copyFrom(event.global);
    view.scale.set(1.1);
    this.app.stage.addChild(view);
    this.drag?.view.destroy({ children: true });
    this.drag = {
      pointerId: event.pointerId,
      coin,
      view,
      startX: event.global.x,
      startY: event.global.y,
      moved: false,
    };
  }

  private readonly onMove = (event: FederatedPointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.view.position.copyFrom(event.global);
    if (Math.hypot(event.global.x - drag.startX, event.global.y - drag.startY) > 12) drag.moved = true;
  };

  private readonly onUp = (event: FederatedPointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    this.drag = null;
    const tray = this.trayCenter();
    const onTray = Math.hypot(event.global.x - tray.x, event.global.y - tray.y) < TRAY_CATCH_PX;
    // A tap on a coin pays it too: easier for small hands than a drag.
    if ((onTray || !drag.moved) && this.counter) {
      tween(drag.view.position, { x: tray.x, y: tray.y }, 180, easeOutQuad, () => {
        drag.view.destroy({ children: true });
      });
      this.pay(drag.coin);
      return;
    }
    // Nothing to pay for, or dropped elsewhere: the coin slips back into the purse.
    this.audio.sfx('drop');
    const home = this.coinCenter(drag.coin);
    tween(drag.view.position, { x: home.x, y: home.y }, 220, easeOutQuad, () => {
      drag.view.destroy({ children: true });
    });
  };

  /** Puts a coin on the tray. Returns false when there is nothing to pay for. */
  pay(coin: Coin): boolean {
    const counter = this.counter;
    if (!counter) return false;
    const purse = spend(this.store.state.wallet, coin);
    this.actions.setWallet(purse.wallet);
    this.audio.sfx('tap');
    this.addTrayCoin(coin);
    const result = counter.pay(coin);
    if (!result) return false;
    if (result.kind === 'counting') this.audio.say(shekelsLine(result.paid));
    else this.finish(result);
    return true;
  }

  private finish(result: Extract<PayResult, { kind: 'done' }>): void {
    const lines = [shekelsLine(result.paid)];
    if (result.change.length > 0) {
      lines.push('shop.change');
      let running = 0;
      for (const coin of result.change) {
        running += coin;
        lines.push(shekelsLine(running));
      }
    }
    lines.push('shop.thanks');
    this.audio.sayAll(lines);
    this.audio.sfx('success');
    this.cashier?.hop();

    const change = result.change.reduce((sum, coin) => sum + coin, 0);
    this.actions.setWallet(this.store.state.wallet + change);
    this.flyChangeHome(result.change);

    // The bought things go home, and the shelves are restocked with the same ones.
    const items = this.beltItems();
    this.counter = null;
    const spots = fridgeSpots(this.store.state.props, items.length);
    const stamp = Date.now().toString(36);
    const bought: PropInstance[] = items.map((item, index) => {
      const spot = spots[index]!;
      return {
        id: `bought-${stamp}-${index}`,
        defId: item.defId,
        location: 'home',
        x: spot.x,
        y: spot.y,
        ...(spot.on ? { on: spot.on } : {}),
      };
    });
    this.finishing = true;
    try {
      this.actions.applyFinal(
        [...this.restock(items), { id: BAG_ID, state: { full: true } }],
        bought,
      );
    } finally {
      this.finishing = false;
    }
    this.belt = new Set(this.beltItems().map((p) => p.id));
    // The full bag gets its "ta-da!".
    this.scene.celebrate(BAG_ID);
    clearTimeout(this.bagTimer);
    this.bagTimer = setTimeout(() => {
      this.actions.applyFinal([{ id: BAG_ID, state: { full: undefined } }]);
      this.clearTray();
    }, BAG_FULL_MS);
  }

  private restock(items: readonly PropInstance[]): EntityChange[] {
    return items.map((item) => {
      const origin = makolet.props.find((p) => p.id === item.id) ?? item;
      return { id: item.id, x: origin.x, y: origin.y, on: origin.on ?? null };
    });
  }

  private returnToShelf(items: readonly PropInstance[]): void {
    this.finishing = true;
    try {
      this.actions.applyFinal(this.restock(items));
    } finally {
      this.finishing = false;
    }
    this.belt = new Set(this.beltItems().map((p) => p.id));
  }

  private refund(amount: number): void {
    this.actions.setWallet(this.store.state.wallet + amount);
    this.clearTray();
  }

  private addTrayCoin(coin: Coin): void {
    const view = coinView(coin, 40);
    const index = this.trayCoins.children.length;
    view.position.set(((index % 4) - 1.5) * 18, -Math.floor(index / 4) * 8);
    view.scale.set(0.3);
    tween(view.scale, { x: 1, y: 1 }, 200, easeOutBack);
    this.trayCoins.addChild(view);
  }

  private clearTray(): void {
    this.trayCoins.removeChildren().forEach((child) => child.destroy({ children: true }));
  }

  /** Change coins hop from the tray back to the purse, one after another. */
  private flyChangeHome(change: readonly Coin[]): void {
    const from = this.trayCenter();
    change.forEach((coin, index) => {
      const view = coinView(coin, COIN_SIZE * 0.8);
      view.position.set(from.x, from.y);
      view.alpha = 0;
      this.app.stage.addChild(view);
      const target = this.coinCenter(coin);
      setTimeout(() => {
        if (view.destroyed) return;
        view.alpha = 1;
        tween(view.position, { x: target.x, y: target.y }, 520, easeOutQuad, () => {
          view.destroy({ children: true });
        });
      }, 400 + index * 450);
    });
  }

  private updatePurse(): void {
    this.purseLabel.text = rtl(`${this.store.state.wallet} ₪`);
  }

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    const size = height < 500 ? COIN_SIZE_SMALL : COIN_SIZE;
    this.coinSize = size;
    const count = COINS.length;
    const rowWidth = count * size + (count - 1) * STRIP_GAP;
    // Largest coin on the right, where a Hebrew reader starts.
    [...COINS].reverse().forEach((coin, index) => {
      const source = this.sources.get(coin);
      source?.scale.set(size / COIN_SIZE);
      source?.position.set(rowWidth / 2 - size / 2 - index * (size + STRIP_GAP), 0);
    });
    this.purseLabel.position.set(-rowWidth / 2 - 60, 0);
    // Above the home bar on an iPhone.
    this.strip.position.set(width / 2 + 30, height - safeArea().bottom - size / 2 - 8);
  };
}
