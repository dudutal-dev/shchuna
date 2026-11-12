import { Application, Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import type { SoundPlayer } from '../engine/AudioManager';
import { starBurst } from '../engine/effects';
import { easeOutBack, tween } from '../engine/tween';
import type { HebrewLetter } from '../types';
import { makeButton } from './Hud';

const PAPER = 0xfffdf6;
const GUIDE = 0xe2d8c4;
const CRAYONS = [0xe5508a, 0x3e8e7e, 0xffc23c, 0x58b8ea];
const DONE_ART = 'ui/done.svg';
/** How much of the letter has to be painted over for the "well done". */
export const PAINT_ENOUGH = 0.6;

type Point = { x: number; y: number };

/**
 * Painting a found letter with a finger: a big pale letter on a sheet, four crayons, and a
 * "well done!" once most of it is coloured in. Painting outside the lines is fine too; there
 * is no wrong way, only the cheer once the letter is mostly covered.
 */
export class LetterPainter {
  readonly view = new Container();
  private readonly paint = new Graphics();
  private readonly guide: Text;
  private readonly crayons: Container[] = [];
  private colour = CRAYONS[0]!;
  private brush = 30;
  /** Points inside the letter, on screen, and whether each has been painted over. */
  private targets: Point[] = [];
  private covered: boolean[] = [];
  private last: Point | null = null;
  private praised = false;
  private doneButton = new Container();

  constructor(
    private readonly app: Application,
    private readonly audio: SoundPlayer,
    private readonly letter: HebrewLetter,
    private readonly onClose: () => void,
  ) {
    this.guide = new Text({
      text: letter,
      style: { fontFamily: 'Rubik', fontSize: 400, fontWeight: '800', fill: GUIDE, padding: 40 },
    });
  }

  open(): void {
    const { width, height } = this.app.screen;
    const sheet = new Graphics().rect(0, 0, width, height).fill(PAPER);
    sheet.eventMode = 'static';
    sheet.hitArea = new Rectangle(0, 0, width, height);
    sheet.on('pointerdown', this.down);
    sheet.on('globalpointermove', this.move);
    sheet.on('pointerup', this.up);
    sheet.on('pointerupoutside', this.up);

    // As big as the screen allows, in the middle.
    const size = Math.min(height * 0.8, width * 0.55);
    this.guide.style.fontSize = size;
    this.guide.anchor.set(0.5);
    this.guide.position.set(width / 2, height / 2);
    this.guide.eventMode = 'none';
    this.paint.eventMode = 'none';
    this.brush = Math.max(18, size / 11);
    this.targets = this.sample(size);
    this.covered = this.targets.map(() => false);

    this.view.addChild(sheet, this.guide, this.paint);

    // Crayons down the right-hand side, where a Hebrew reader starts.
    CRAYONS.forEach((colour, index) => {
      const crayon = new Container();
      const tip = new Graphics().circle(0, 0, 30).fill(colour).stroke({ color: 0xffffff, width: 5 });
      crayon.addChild(tip);
      crayon.eventMode = 'static';
      crayon.cursor = 'pointer';
      crayon.hitArea = new Rectangle(-36, -36, 72, 72);
      crayon.position.set(width - 56, height / 2 + (index - 1.5) * 84);
      crayon.on('pointerdown', (event) => {
        event.stopPropagation();
        this.colour = colour;
        this.audio.sfx('tap');
        this.markCrayon();
      });
      this.crayons.push(crayon);
      this.view.addChild(crayon);
    });
    this.markCrayon();

    this.doneButton = makeButton(DONE_ART, 84, () => this.close());
    this.doneButton.position.set(16 + 42, 16 + 42);
    this.view.addChild(this.doneButton);
    this.view.alpha = 0;
    tween(this.view, { alpha: 1 }, 200);
  }

  close(): void {
    this.audio.sfx('success');
    this.view.destroy({ children: true });
    this.onClose();
  }

  /** How much of the letter is painted, from 0 to 1. */
  get progress(): number {
    if (this.targets.length === 0) return 0;
    return this.covered.filter(Boolean).length / this.targets.length;
  }

  /** Screen points inside the letter, for tests to paint along. */
  get points(): Point[] {
    return this.targets.map((p) => ({ ...p }));
  }

  get doneCenter(): Point {
    return { x: this.doneButton.x, y: this.doneButton.y };
  }

  private markCrayon(): void {
    this.crayons.forEach((crayon, index) => {
      crayon.scale.set(CRAYONS[index] === this.colour ? 1.2 : 1);
    });
  }

  /**
   * Points inside the letter: it is drawn once on a hidden canvas the same size, and a grid of
   * points is kept wherever the drawing has ink.
   */
  private sample(size: number): Point[] {
    const canvas = document.createElement('canvas');
    const box = Math.ceil(size * 1.4);
    canvas.width = box;
    canvas.height = box;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return [];
    context.font = `800 ${size}px Rubik`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#000';
    context.fillText(this.letter, box / 2, box / 2);
    const data = context.getImageData(0, 0, box, box).data;
    // Pixi's text sits a little lower than the canvas's "middle": line it up by the ink itself.
    const points: Point[] = [];
    const step = Math.max(6, Math.round(size / 22));
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < box; y += step) {
      for (let x = 0; x < box; x += step) {
        if (data[(y * box + x) * 4 + 3]! > 128) {
          points.push({ x, y });
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    if (points.length === 0) return [];
    // Centre the ink on the on-screen letter's ink.
    const bounds = this.guide.getBounds();
    const inkX = (minX + maxX) / 2;
    const inkY = (minY + maxY) / 2;
    const screenX = bounds.x + bounds.width / 2;
    const screenY = bounds.y + bounds.height / 2;
    return points.map((p) => ({ x: p.x - inkX + screenX, y: p.y - inkY + screenY }));
  }

  private readonly down = (event: FederatedPointerEvent): void => {
    this.last = { x: event.global.x, y: event.global.y };
    this.dab(this.last, this.last);
  };

  private readonly move = (event: FederatedPointerEvent): void => {
    if (!this.last) return;
    const at = { x: event.global.x, y: event.global.y };
    this.dab(this.last, at);
    this.last = at;
  };

  private readonly up = (): void => {
    this.last = null;
  };

  /** A stroke of the crayon, and the letter's points under it count as painted. */
  private dab(from: Point, to: Point): void {
    this.paint
      .moveTo(from.x, from.y)
      .lineTo(to.x + 0.01, to.y)
      .stroke({ color: this.colour, width: this.brush * 2, cap: 'round', join: 'round', alpha: 0.85 });
    const reach = this.brush;
    this.targets.forEach((p, index) => {
      if (this.covered[index]) return;
      if (distanceToSegment(p, from, to) <= reach) this.covered[index] = true;
    });
    if (!this.praised && this.progress >= PAINT_ENOUGH) {
      this.praised = true;
      this.audio.sfx('tada');
      this.audio.say('react.wellDone');
      const { width, height } = this.app.screen;
      starBurst(this.view, width / 2, height / 2, { count: 16, radius: Math.min(width, height) * 0.35, size: 20 });
      this.guide.style.fill = this.colour;
      this.guide.scale.set(0.9);
      tween(this.guide.scale, { x: 1, y: 1 }, 500, easeOutBack);
    }
  }
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
