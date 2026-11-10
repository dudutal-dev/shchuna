import { Application, Container, Graphics, Rectangle, Sprite, Text } from 'pixi.js';
import { LETTERS, type LetterInfo } from '../content/letters';
import type { GameStore } from '../app/store';
import { getArt, loadArt } from '../engine/art';
import type { SoundPlayer } from '../engine/AudioManager';
import { easeOutBack, tween } from '../engine/tween';
import { bookLines, isFound } from '../learning/LetterHunt';
import type { HebrewLetter, PropDef, PropInstance } from '../types';
import { makeButton } from './Hud';

const COLUMNS = 8;
const ROWS = 3;
const PANEL = 0xfff7e6;
const INK = 0x3b2f2f;
const MISSING = 0xd9ccb2;
/** Found letters take turns through the palette, so the page looks bright. */
const COLOURS = [0xe5508a, 0x3e8e7e, 0xe4573d, 0x58b8ea, 0x7faf6b, 0xa98bd6, 0xd99a1e];
const DONE_ART = 'ui/done.svg';

/** A full-screen book of the 22 letters: found ones bright, the rest waiting in grey. */
export class LetterBook {
  readonly view = new Container();
  private readonly slots = new Map<HebrewLetter, Container>();
  private readonly backdrop = new Graphics();
  private doneButton = new Container();

  constructor(
    private readonly app: Application,
    private readonly store: GameStore,
    private readonly audio: SoundPlayer,
    private readonly defs: Readonly<Record<string, PropDef>>,
    private readonly seedProps: readonly PropInstance[],
    private readonly onHeard: (letter: HebrewLetter) => void,
    private readonly onClose: () => void,
  ) {}

  async open(): Promise<void> {
    await loadArt([DONE_ART, ...LETTERS.flatMap((info) => this.pictureOf(info) ?? [])]);
    this.backdrop.eventMode = 'static';
    this.view.addChild(this.backdrop);
    LETTERS.forEach((info, index) => {
      const slot = this.buildSlot(info, index);
      this.slots.set(info.letter, slot);
      this.view.addChild(slot);
    });
    this.doneButton = makeButton(DONE_ART, 84, () => this.close());
    this.view.addChild(this.doneButton);
    this.app.renderer.on('resize', this.layout);
    this.layout();
    this.view.alpha = 0;
    tween(this.view, { alpha: 1 }, 200);
  }

  close(): void {
    this.audio.sfx('success');
    this.app.renderer.off('resize', this.layout);
    this.view.destroy({ children: true });
    this.onClose();
  }

  /** Screen centre of a letter's slot or the close button, for tests. */
  center(id: HebrewLetter | 'done'): { x: number; y: number } | null {
    const target = id === 'done' ? this.doneButton : this.slots.get(id);
    return target ? target.getGlobalPosition() : null;
  }

  /** The art of the prop a letter hides on, shown under it once found. */
  private pictureOf(info: LetterInfo): string | null {
    const instance = this.seedProps.find((p) => p.id === info.hidesOn);
    return instance ? (this.defs[instance.defId]?.art ?? null) : null;
  }

  private buildSlot(info: LetterInfo, index: number): Container {
    const found = isFound(this.store.state.letters, info.letter);
    const slot = new Container();
    const card = new Graphics()
      .roundRect(-50, -50, 100, 100, 22)
      .fill(found ? 0xffffff : 0xf3e7cf)
      .stroke({ color: found ? (COLOURS[index % COLOURS.length] ?? INK) : 0xe2cda3, width: found ? 6 : 3 });
    const label = new Text({
      text: info.letter,
      style: {
        fontFamily: 'Rubik',
        fontSize: found ? 52 : 58,
        fontWeight: '800',
        fill: found ? (COLOURS[index % COLOURS.length] ?? INK) : MISSING,
        padding: 10,
      },
    });
    label.anchor.set(0.5);
    slot.addChild(card, label);
    const picture = found ? this.pictureOf(info) : null;
    if (picture) {
      label.y = -14;
      const art = new Sprite(getArt(picture));
      art.anchor.set(0.5, 1);
      const fit = Math.min(44 / art.texture.width, 34 / art.texture.height);
      art.scale.set(fit);
      art.position.set(0, 44);
      slot.addChild(art);
    }
    slot.eventMode = 'static';
    slot.cursor = 'pointer';
    slot.hitArea = new Rectangle(-50, -50, 100, 100);
    slot.on('pointerdown', (event) => {
      event.stopPropagation();
      slot.scale.set(slot.scale.x * 0.88);
      const rest = this.slotScale;
      tween(slot.scale, { x: rest, y: rest }, 220, easeOutBack);
      this.audio.sfx('tap');
      this.audio.sayAll(bookLines(this.store.state.letters, info.letter));
      if (found) this.onHeard(info.letter);
    });
    return slot;
  }

  private slotScale = 1;

  private readonly layout = (): void => {
    const { width, height } = this.app.screen;
    this.backdrop.clear().rect(0, 0, width, height).fill(PANEL);
    const margin = 16;
    const top = 96;
    const cell = Math.min((width - 2 * margin) / COLUMNS, (height - top - margin) / ROWS);
    // Never below the 64pt touch minimum.
    this.slotScale = Math.max(64, cell - 10) / 100;
    const gridWidth = cell * COLUMNS;
    const left = (width - gridWidth) / 2;
    // Alef at the top right: the book reads right to left.
    LETTERS.forEach((info, index) => {
      const column = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      const slot = this.slots.get(info.letter);
      slot?.scale.set(this.slotScale);
      slot?.position.set(left + gridWidth - cell * (column + 0.5), top + cell * (row + 0.5));
    });
    this.doneButton.position.set(margin + 42, margin + 42);
  };
}
