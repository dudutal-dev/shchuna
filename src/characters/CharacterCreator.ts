import { Application, Container, Graphics, Rectangle } from 'pixi.js';
import { safeArea } from '../engine/safeArea';
import type { Actions } from '../app/actions';
import type { GameStore } from '../app/store';
import { loadArt } from '../engine/art';
import type { SoundPlayer } from '../engine/AudioManager';
import { easeOutBack, tween } from '../engine/tween';
import type { Character, LocationId } from '../types';
import { makeButton } from '../ui/Hud';
import { cycle, type CreatorCategory } from './catalog';
import { CharacterEntity } from './CharacterEntity';

const CATEGORIES: Array<{ id: CreatorCategory; art: string }> = [
  { id: 'body', art: 'ui/cat-body.svg' },
  { id: 'skin', art: 'ui/cat-skin.svg' },
  { id: 'hair', art: 'ui/cat-hair.svg' },
  { id: 'clothes', art: 'ui/cat-clothes.svg' },
  { id: 'accessory', art: 'ui/cat-accessory.svg' },
];
const DONE_ART = 'ui/done.svg';
/** Screen pixels. Category buttons are larger than the HUD's: they are the whole game here. */
const CATEGORY_SIZE = 92;
const SLOT = 120;
const PANEL = 0xfff7e6;
const SELECTED = 0xffc23c;

/** Full-screen dress-up: pick a family member on top, change them with the icons on the side. */
export class CharacterCreator {
  readonly view = new Container();
  private selected: string;
  private preview: CharacterEntity | null = null;
  private readonly slots = new Container();
  private readonly categoryButtons = new Map<CreatorCategory, Container>();
  private doneButton = new Container();
  private readonly backdrop = new Graphics();
  private readonly previewHolder = new Container();
  private unsubscribe: (() => void) | undefined;
  private slotEntities = new Map<string, { frame: Graphics; entity: CharacterEntity; holder: Container }>();

  constructor(
    private readonly app: Application,
    private readonly store: GameStore,
    private readonly actions: Actions,
    private readonly audio: SoundPlayer,
    private readonly location: LocationId,
    private readonly onDone: () => void,
    selected?: string,
  ) {
    this.selected = selected ?? this.family()[0]?.id ?? '';
  }

  static art(): string[] {
    return [...CATEGORIES.map((c) => c.art), DONE_ART];
  }

  async open(): Promise<void> {
    await loadArt(CharacterCreator.art());
    // Made only now: a button needs its art loaded first.
    this.doneButton = makeButton(DONE_ART, CATEGORY_SIZE, () => this.close());
    // Swallows every touch so nothing reaches the scene underneath.
    this.backdrop.eventMode = 'static';
    this.view.addChild(this.backdrop, this.previewHolder, this.slots);
    for (const { id, art } of CATEGORIES) {
      const button = makeButton(art, CATEGORY_SIZE, () => this.change(id));
      this.categoryButtons.set(id, button);
      this.view.addChild(button);
    }
    this.view.addChild(this.doneButton);
    this.buildSlots();
    this.showPreview();
    this.unsubscribe = this.store.subscribe(() => this.refresh());
    this.app.renderer.on('resize', this.layout);
    this.layout();
    this.view.alpha = 0;
    tween(this.view, { alpha: 1 }, 200);
  }

  close(): void {
    this.audio.sfx('success');
    this.unsubscribe?.();
    this.app.renderer.off('resize', this.layout);
    this.view.destroy({ children: true });
    this.onDone();
  }

  /** Screen centre of a control, for tests. */
  center(id: CreatorCategory | 'done' | `slot:${string}`): { x: number; y: number } | null {
    let target: Container | undefined;
    if (id === 'done') target = this.doneButton;
    else if (id.startsWith('slot:')) target = this.slotEntities.get(id.slice(5))?.holder;
    else target = this.categoryButtons.get(id as CreatorCategory);
    if (!target) return null;
    const bounds = target.getBounds();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }

  private family(): Character[] {
    return this.store.state.characters.filter((c) => c.location === this.location);
  }

  private current(): Character | undefined {
    return this.store.state.characters.find((c) => c.id === this.selected);
  }

  private change(category: CreatorCategory): void {
    const character = this.current();
    if (!character) return;
    this.actions.commit(this.location, [
      { id: character.id, appearance: cycle(character.appearance, category) },
    ]);
    this.audio.sfx('tada');
    this.preview?.taDa();
  }

  private select(id: string): void {
    if (id === this.selected) return;
    this.selected = id;
    this.audio.sfx('tap');
    this.showPreview();
    this.highlightSlots();
    this.preview?.taDa();
  }

  /** The preview always stands, whatever the character is doing in the scene. */
  private standing(character: Character): Character {
    return { ...character, pose: 'stand', x: 0, y: 0 };
  }

  private showPreview(): void {
    this.previewHolder.removeChildren().forEach((child) => child.destroy({ children: true }));
    const character = this.current();
    if (!character) return;
    this.preview = new CharacterEntity(this.standing(character));
    this.preview.eventMode = 'none';
    this.previewHolder.addChild(this.preview);
    this.layout();
  }

  private buildSlots(): void {
    for (const character of this.family()) {
      const holder = new Container();
      const frame = new Graphics();
      const entity = new CharacterEntity(this.standing(character));
      entity.eventMode = 'none';
      entity.scale.set(0.42);
      entity.y = SLOT / 2 - 8;
      holder.addChild(frame, entity);
      holder.eventMode = 'static';
      holder.cursor = 'pointer';
      holder.hitArea = new Rectangle(-SLOT / 2, -SLOT / 2, SLOT, SLOT);
      holder.on('pointerdown', (event) => {
        event.stopPropagation();
        holder.scale.set(0.9);
        tween(holder.scale, { x: 1, y: 1 }, 180, easeOutBack);
        this.select(character.id);
      });
      this.slots.addChild(holder);
      this.slotEntities.set(character.id, { frame, entity, holder });
    }
    this.highlightSlots();
  }

  private highlightSlots(): void {
    for (const [id, { frame }] of this.slotEntities) {
      frame
        .clear()
        .roundRect(-SLOT / 2, -SLOT / 2, SLOT, SLOT, 26)
        .fill(0xffffff)
        .stroke({ color: id === this.selected ? SELECTED : 0xe2cda3, width: id === this.selected ? 7 : 4 });
    }
  }

  private refresh(): void {
    const character = this.current();
    if (character) this.preview?.apply(this.standing(character));
    for (const member of this.family()) {
      this.slotEntities.get(member.id)?.entity.apply(this.standing(member));
    }
  }

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    this.backdrop.clear().rect(0, 0, width, height).fill(PANEL);
    const margin = 16;
    // Clear of a notch and the rounded corners.
    const safe = safeArea();
    const top = safe.top + margin;
    const bottom = height - safe.bottom - margin;
    const leftEdge = safe.left + margin;
    const rightEdge = width - safe.right - margin;

    // Category icons down the right side, the start of a Hebrew reading line. They shrink to
    // fit a short phone, never below the 64pt touch minimum; when even that is too tall,
    // they go in two columns.
    const gap = 8;
    const fits = (rows: number) => (bottom - top) / rows - gap;
    const columns = fits(CATEGORIES.length) >= 64 ? 1 : 2;
    const rows = Math.ceil(CATEGORIES.length / columns);
    const size = Math.max(64, Math.min(CATEGORY_SIZE, fits(rows)));
    const step = size + gap;
    CATEGORIES.forEach(({ id }, index) => {
      const button = this.categoryButtons.get(id);
      // Down the first column, then the next one inwards (to the left).
      const column = Math.floor(index / rows);
      const row = index % rows;
      button?.scale.set(size / CATEGORY_SIZE);
      button?.position.set(rightEdge - size / 2 - column * step, top + size / 2 + row * step);
    });
    const categoriesWidth = columns * step;
    this.doneButton.scale.set(size / CATEGORY_SIZE);
    this.doneButton.position.set(leftEdge + size / 2, bottom - size / 2);

    // Family along the top, right to left, between the categories and the left edge.
    const slotScale = Math.min(1, height / 600);
    this.slots.scale.set(slotScale);
    [...this.slotEntities.values()].forEach(({ holder }, index) => {
      holder.position.set(-index * (SLOT + 14), 0);
    });
    this.slots.position.set(rightEdge - categoriesWidth - (SLOT / 2) * slotScale - 10, top + (SLOT / 2) * slotScale);

    // The character, big, in the space that's left.
    if (this.preview) {
      const previewTop = top + SLOT * slotScale + 10;
      const scale = (bottom - previewTop) / 330;
      this.preview.scale.set(scale);
      const left = leftEdge + size;
      const right = rightEdge - categoriesWidth;
      this.preview.position.set((left + right) / 2, bottom);
    }
  };
}
