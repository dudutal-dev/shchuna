import { describe, expect, it } from 'vitest';
import { fridgeSpots } from '../../src/locations/home/fridge';
import type { PropInstance } from '../../src/types';

const item = (x: number, y: number, on: string): PropInstance => ({
  id: `p${x}${on}`,
  defId: 'bread',
  location: 'home',
  x,
  y,
  on,
});

describe('fridgeSpots', () => {
  it('fills the top shelf first', () => {
    const [first] = fridgeSpots([], 1);
    expect(first?.on).toBe('fridge-1');
  });

  it('gives as many distinct spots as asked', () => {
    const spots = fridgeSpots([], 4);
    expect(spots).toHaveLength(4);
    expect(new Set(spots.map((s) => `${s.on}:${s.x}`)).size).toBe(4);
  });

  it('skips spots already taken', () => {
    const [first] = fridgeSpots([], 1);
    const taken = item(first!.x, first!.y, first!.on!);
    const [next] = fridgeSpots([taken], 1);
    expect(`${next?.on}:${next?.x}`).not.toBe(`${first?.on}:${first?.x}`);
  });

  it('spills onto the kitchen floor once the fridge is full', () => {
    const full = fridgeSpots([], 50);
    const shelfSpots = full.filter((s) => s.on);
    const floor = full.filter((s) => !s.on);
    expect(shelfSpots.length).toBeGreaterThan(5);
    expect(floor.length).toBe(50 - shelfSpots.length);
    expect(floor[0]!.y).toBeGreaterThan(440);
  });
});
