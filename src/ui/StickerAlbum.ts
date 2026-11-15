import { Application, Container, Graphics, Rectangle, Sprite } from 'pixi.js';
import type { Story } from '../content/stories';
import type { SoundPlayer } from '../engine/AudioManager';
import { getArt, loadArt } from '../engine/art';
import { starBurst } from '../engine/effects';
import { easeOutBack, easeOutQuad, tween } from '../engine/tween';

const COLUMNS = 4;
const ROWS = 3;
/** A sticker as drawn, before it is scaled to the page. */
const SIZE = 140;
const HOLD_MS = 1500;

/**
 * The second page of the letter book: one sticker for each story. A finished story's sticker
 * is there in colour; the others wait as pale shapes. Touching one says the story's name.
 * Nothing is counted.
 */
export class StickerAlbum {
  readonly view = new Container();
  private readonly slots = new Map<string, Container>();
  private slotScale = 1;

  constructor(
    private readonly stories: readonly Story[],
    private readonly isDone: (storyId: string) => boolean,
    private readonly audio: SoundPlayer,
  ) {}

  async load(): Promise<void> {
    await loadArt(this.stories.map((story) => story.sticker));
    for (const story of this.stories) {
      const slot = this.buildSlot(story);
      this.slots.set(story.id, slot);
      this.view.addChild(slot);
    }
  }

  /** The middle of a story's sticker on screen, for tests. */
  center(storyId: string): { x: number; y: number } | null {
    const slot = this.slots.get(storyId);
    return slot && this.view.visible ? slot.getGlobalPosition() : null;
  }

  /** How a story's sticker is shown: in colour, or still waiting as a pale shape. */
  state(storyId: string): 'earned' | 'waiting' | null {
    const sticker = this.slots.get(storyId)?.children[1];
    if (!sticker) return null;
    // As it is drawn: a waiting sticker is see-through.
    return sticker.alpha === 1 ? 'earned' : 'waiting';
  }

  /** Lays the stickers out in `area`, from the top right. */
  layout(area: Rectangle): void {
    const cell = Math.min(area.width / COLUMNS, area.height / ROWS);
    // Never below the 64pt touch minimum.
    this.slotScale = Math.min(Math.max(64, cell - 20) / SIZE, 1.5);
    const gridWidth = cell * COLUMNS;
    const left = area.x + (area.width - gridWidth) / 2;
    this.stories.forEach((story, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const slot = this.slots.get(story.id);
      slot?.scale.set(this.slotScale);
      slot?.position.set(left + gridWidth - cell * (column + 0.5), area.y + cell * (row + 0.5));
    });
  }

  private buildSlot(story: Story): Container {
    const done = this.isDone(story.id);
    const slot = new Container();
    const place = new Graphics()
      .circle(0, 0, SIZE / 2 + 4)
      .fill(done ? 0xffffff : 0xf3e7cf)
      .stroke({ color: 0xe2cda3, width: 3 });
    const sticker = new Sprite(getArt(story.sticker));
    sticker.anchor.set(0.5);
    sticker.width = SIZE;
    sticker.height = SIZE;
    if (!done) {
      // Only its shape, until the story has been told.
      sticker.tint = 0x6b4c35;
      sticker.alpha = 0.22;
    }
    slot.addChild(place, sticker);
    slot.eventMode = 'static';
    slot.cursor = 'pointer';
    slot.hitArea = new Rectangle(-SIZE / 2, -SIZE / 2, SIZE, SIZE);
    slot.on('pointerdown', (event) => {
      event.stopPropagation();
      slot.scale.set(this.slotScale * 0.88);
      tween(slot.scale, { x: this.slotScale, y: this.slotScale }, 220, easeOutBack);
      this.audio.sfx('tap');
      this.audio.say(story.nameLine);
    });
    return slot;
  }
}

/**
 * A story just ended for the first time: its sticker grows in the middle of the screen among
 * stars, then flies into the book.
 */
export async function flySticker(
  app: Application,
  art: string,
  bookAt: () => { x: number; y: number },
): Promise<void> {
  await loadArt([art]);
  const { width, height } = app.screen;
  const unit = Math.min(height / 600, width / 900) * 1.6;
  const view = new Sprite(getArt(art));
  view.anchor.set(0.5);
  view.eventMode = 'none';
  view.position.set(width / 2, height / 2);
  view.scale.set(0.1);
  app.stage.addChild(view);
  return new Promise((resolve) => {
    tween(view.scale, { x: unit, y: unit }, 450, easeOutBack);
    starBurst(app.stage, width / 2, height / 2, { count: 14, radius: 190 * unit, size: 18 });
    app.stage.setChildIndex(view, app.stage.children.length - 1);
    setTimeout(() => {
      if (view.destroyed) return resolve();
      const target = bookAt();
      tween(view, { x: target.x, y: target.y, alpha: 0.3 }, 520, easeOutQuad);
      tween(view.scale, { x: 0.12 * unit, y: 0.12 * unit }, 520, easeOutQuad, () => {
        view.destroy();
        resolve();
      });
    }, HOLD_MS);
  });
}
