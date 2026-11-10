import { Container, Graphics, Text } from 'pixi.js';
import type { HebrewLetter } from '../types';

const HIGHLIGHT = 0xffc23c;
const INK = 0x3b2f2f;
const PULSE_MS = 1400;

/**
 * A small glowing letter tucked onto a prop, waiting to be found. It takes no touches
 * itself: a tap anywhere on the prop finds it, and the prop can still be dragged.
 */
export class LetterSparkle extends Container {
  private elapsed = Math.random() * PULSE_MS;
  private readonly glow = new Graphics();

  constructor(readonly letter: HebrewLetter) {
    super();
    this.glow.circle(0, 0, 30).fill({ color: HIGHLIGHT, alpha: 0.35 });
    const star = new Graphics()
      .star(0, 0, 8, 26, 18)
      .fill(0xfff6d8)
      .stroke({ color: HIGHLIGHT, width: 4 });
    const label = new Text({
      text: letter,
      style: { fontFamily: 'Rubik', fontSize: 30, fontWeight: '800', fill: INK, padding: 8 },
    });
    label.anchor.set(0.5, 0.55);
    this.addChild(this.glow, star, label);
    this.eventMode = 'none';
  }

  /** A gentle shimmer: no sound, no hurry. */
  animate(deltaMs: number): void {
    this.elapsed = (this.elapsed + deltaMs) % PULSE_MS;
    const phase = Math.sin((this.elapsed / PULSE_MS) * Math.PI * 2);
    this.glow.scale.set(1 + phase * 0.25);
    this.glow.alpha = 0.7 + phase * 0.3;
    this.rotation = phase * 0.08;
  }
}
