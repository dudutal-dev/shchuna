import { Application, Container, Graphics, Rectangle } from 'pixi.js';
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

    // Category icons down the right side, the start of a Hebrew reading line. On a short
    // phone screen they shrink to fit, but never below the 64pt touch minimum.
    const gap = 8;
    const size = Math.max(64, Math.min(CATEGORY_SIZE, (height - 2 * margin) / CATEGORIES.length - gap));
    const step = size + gap;
    CATEGORIES.forEach(({ id }, index) => {
      const button = this.categoryButtons.get(id);
      button?.scale.set(size / CATEGORY_SIZE);
      button?.position.set(width - margin - size / 2, margin + size / 2 + index * step);
    });
    this.doneButton.scale.set(size / CATEGORY_SIZE);
    this.doneButton.position.set(margin + size / 2, height - margin - size / 2);

    // Family along the top, right to left.
    const slotScale = Math.min(1, height / 600);
    this.slots.scale.set(slotScale);
    [...this.slotEntities.values()].forEach(({ holder }, index) => {
      holder.position.set(-index * (SLOT + 14), 0);
    });
    this.slots.position.set(width - margin * 2 - CATEGORY_SIZE - (SLOT / 2) * slotScale - 10, margin + (SLOT / 2) * slotScale);

    // The character, big, in the space that's left.
    if (this.preview) {
      const top = margin + SLOT * slotScale + 10;
      const available = height - top - margin;
      const scale = available / 330;
      this.preview.scale.set(scale);
      const left = margin + CATEGORY_SIZE;
      const right = width - margin * 2 - CATEGORY_SIZE;
      this.preview.position.set((left + right) / 2, height - margin);
    }
  };
}
