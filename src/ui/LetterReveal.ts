import { Application, Container, Graphics, Text } from 'pixi.js';
import { rtl } from '../engine/text';
import { easeOutBack, easeOutQuad, tween } from '../engine/tween';
import type { HebrewLetter } from '../types';

const HIGHLIGHT = 0xffc23c;
const INK = 0x3b2f2f;
const HOLD_MS = 2600;

/** Splits off the first letter with its niqqud marks, so it can be coloured on its own. */
export function splitFirstLetter(word: string): [first: string, rest: string] {
  const match = word.match(/^[א-ת][֑-ׇ]*/);
  const first = match?.[0] ?? word.slice(0, 1);
  return [first, word.slice(first.length)];
}

/**
 * The found letter grows from where it was tapped to the middle of the screen, over
 * its word with that letter highlighted, then flies into the letter book.
 */
export function revealLetter(
  app: Application,
  letter: HebrewLetter,
  word: string,
  from: { x: number; y: number },
  bookAt: () => { x: number; y: number },
): Promise<void> {
  const view = new Container();
  view.eventMode = 'none';
  const { width, height } = app.screen;
  const unit = Math.min(height / 600, width / 900) * 1.2;

  const card = new Graphics()
    .roundRect(-150, -170, 300, 300, 48)
    .fill(0xfff7e6)
    .stroke({ color: HIGHLIGHT, width: 10 });
  const big = new Text({
    text: letter,
    style: { fontFamily: 'Rubik', fontSize: 190, fontWeight: '800', fill: HIGHLIGHT, stroke: { color: INK, width: 8 }, padding: 20 },
  });
  big.anchor.set(0.5);
  big.y = -40;

  // The word, right to left: the highlighted first letter, then the rest beside it.
  const [first, rest] = splitFirstLetter(word);
  const style = { fontFamily: 'Rubik', fontSize: 56, fontWeight: '800' as const, padding: 16 };
  const firstText = new Text({ text: rtl(first), style: { ...style, fill: HIGHLIGHT, stroke: { color: INK, width: 4 } } });
  const restText = new Text({ text: rtl(rest), style: { ...style, fill: INK } });
  const total = firstText.width + restText.width;
  firstText.anchor.set(1, 0.5);
  restText.anchor.set(1, 0.5);
  firstText.position.set(total / 2, 90);
  restText.position.set(total / 2 - firstText.width, 90);

  view.addChild(card, big, firstText, restText);
  view.position.copyFrom(from);
  view.scale.set(0.15 * unit);
  app.stage.addChild(view);

  return new Promise((resolve) => {
    tween(view, { x: width / 2, y: height / 2 }, 450, easeOutQuad);
    tween(view.scale, { x: unit, y: unit }, 450, easeOutBack);
    setTimeout(() => {
      if (view.destroyed) return resolve();
      const target = bookAt();
      tween(view, { x: target.x, y: target.y, alpha: 0.3 }, 520, easeOutQuad);
      tween(view.scale, { x: 0.08 * unit, y: 0.08 * unit }, 520, easeOutQuad, () => {
        view.destroy({ children: true });
        resolve();
      });
    }, HOLD_MS);
  });
}
