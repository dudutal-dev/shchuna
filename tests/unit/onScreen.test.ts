import { describe, expect, it } from 'vitest';
import { keepOnScreen } from '../../src/ui/onScreen';

describe('keepOnScreen', () => {
  const phone = { width: 844, height: 390 };
  const notch = { top: 0, right: 47, bottom: 0, left: 47 };
  const none = { top: 0, right: 0, bottom: 0, left: 0 };

  it('leaves alone what is already clear', () => {
    expect(keepOnScreen({ x: 400, y: 250 }, 38, phone, notch, 106)).toEqual({ x: 400, y: 250 });
  });

  it('moves down what would sit under the buttons at the top', () => {
    // By the roof of the house on a phone: right where the book button is.
    expect(keepOnScreen({ x: 739, y: 70 }, 38, phone, notch, 106)).toEqual({ x: 739, y: 144 });
  });

  it('pulls in what would run off the side, past a notch too', () => {
    expect(keepOnScreen({ x: 646, y: 250 }, 38, { width: 640, height: 360 }, none, 106).x).toBe(598);
    expect(keepOnScreen({ x: 830, y: 250 }, 38, phone, notch, 106).x).toBe(755);
    expect(keepOnScreen({ x: 10, y: 250 }, 38, phone, notch, 106).x).toBe(89);
  });

  it('keeps it above the bottom edge', () => {
    expect(keepOnScreen({ x: 400, y: 385 }, 38, phone, none, 106).y).toBe(348);
  });
});
