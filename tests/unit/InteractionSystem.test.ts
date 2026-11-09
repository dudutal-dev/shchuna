import { describe, expect, it } from 'vitest';
import {
  artFor,
  GestureTracker,
  LONG_PRESS_MS,
  resolveTap,
  resolveUseOn,
} from '../../src/engine/InteractionSystem';
import type { PropDef, PropInstance } from '../../src/types';

const base = { nameHe: '', voiceLine: '', art: 'a.svg', layer: 'item', draggable: true } as const;
const lamp: PropDef = { ...base, id: 'lamp', interactions: [{ type: 'toggle', key: 'on' }] };
const faucet: PropDef = { ...base, id: 'faucet', interactions: [] };
const cup: PropDef = {
  ...base,
  id: 'cup',
  artStates: [{ when: { filled: true }, art: 'cup-full.svg' }],
  interactions: [{ type: 'useOn', target: 'faucet', setSource: { filled: true } }],
};
const defs = { lamp, faucet, cup };

function instance(id: string, defId: string, x = 0, y = 0): PropInstance {
  return { id, defId, location: 'playground', x, y };
}

describe('GestureTracker', () => {
  it('reports a quick release as a tap', () => {
    const gesture = new GestureTracker();
    gesture.down(0, 0, 0);
    expect(gesture.tick(100)).toBe(false);
    expect(gesture.up()).toBe(true);
  });

  it('reports a long press once, and no tap after it', () => {
    const gesture = new GestureTracker();
    gesture.down(0, 0, 0);
    expect(gesture.tick(LONG_PRESS_MS)).toBe(true);
    expect(gesture.tick(LONG_PRESS_MS + 16)).toBe(false);
    expect(gesture.up()).toBe(false);
  });

  it('ignores finger jitter but starts a drag on real movement', () => {
    const gesture = new GestureTracker();
    gesture.down(0, 0, 0);
    expect(gesture.move(5, 5)).toBe(false);
    expect(gesture.move(20, 0)).toBe(true);
    expect(gesture.move(30, 0)).toBe(false);
    expect(gesture.tick(LONG_PRESS_MS * 2)).toBe(false);
    expect(gesture.up()).toBe(false);
  });
});

describe('resolveTap', () => {
  it('flips a toggle both ways', () => {
    expect(resolveTap(lamp, instance('l', 'lamp'))?.state).toEqual({ on: true });
    const lit = { ...instance('l', 'lamp'), state: { on: true } };
    expect(resolveTap(lamp, lit)?.state).toEqual({ on: false });
  });

  it('returns null for a prop with nothing to tap', () => {
    expect(resolveTap(faucet, instance('f', 'faucet'))).toBeNull();
  });
});

describe('resolveUseOn', () => {
  const source = instance('c', 'cup', 500, 500);

  it('applies the effect when dropped near the target', () => {
    const all = [source, instance('f', 'faucet', 100, 100)];
    expect(resolveUseOn(source, { x: 120, y: 100 }, defs, all)).toEqual([
      { id: 'c', state: { filled: true } },
    ]);
  });

  it('measures from the target use point on tall furniture', () => {
    const tall = { faucet: { ...faucet, useOnPoint: { x: 0, y: -200 } }, cup };
    const all = [source, instance('f', 'faucet', 100, 400)];
    expect(resolveUseOn(source, { x: 100, y: 200 }, tall, all)).toHaveLength(1);
    expect(resolveUseOn(source, { x: 100, y: 400 }, tall, all)).toEqual([]);
  });

  it('does nothing when dropped far away', () => {
    const all = [source, instance('f', 'faucet', 100, 100)];
    expect(resolveUseOn(source, { x: 900, y: 900 }, defs, all)).toEqual([]);
  });

  it('ignores targets in another location', () => {
    const far: PropInstance = { ...instance('f', 'faucet', 100, 100), location: 'home' };
    expect(resolveUseOn(source, { x: 100, y: 100 }, defs, [source, far])).toEqual([]);
  });
});

describe('artFor', () => {
  it('uses the art matching the state, else the default', () => {
    expect(artFor(cup, instance('c', 'cup'))).toBe('a.svg');
    expect(artFor(cup, { ...instance('c', 'cup'), state: { filled: true } })).toBe('cup-full.svg');
  });
});
