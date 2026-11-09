import { describe, expect, it } from 'vitest';
import {
  ACCESSORIES,
  BODY_ORDER,
  cycle,
  defaultFamily,
  HAIR_COLORS,
  HAIR_STYLES,
  OUTFITS,
  SKIN_TONES,
} from '../../src/characters/catalog';
import type { CharacterAppearance } from '../../src/types';

const base: CharacterAppearance = {
  body: 'kid',
  skinTone: 0,
  hair: 'short',
  hairColor: 'black',
  outfit: 'sunny',
};

function cycleTimes(category: Parameters<typeof cycle>[1], times: number) {
  let a = base;
  const seen: CharacterAppearance[] = [];
  for (let i = 0; i < times; i++) {
    a = cycle(a, category);
    seen.push(a);
  }
  return seen;
}

describe('cycle', () => {
  it('walks every body and comes back round', () => {
    const seen = cycleTimes('body', BODY_ORDER.length);
    expect(seen.at(-1)?.body).toBe(base.body);
    expect(new Set(seen.map((a) => a.body)).size).toBe(BODY_ORDER.length);
  });

  it('walks every skin tone', () => {
    const seen = cycleTimes('skin', SKIN_TONES.length);
    expect(new Set(seen.map((a) => a.skinTone)).size).toBe(SKIN_TONES.length);
  });

  it('reaches every outfit', () => {
    const count = Object.keys(OUTFITS).length;
    expect(new Set(cycleTimes('clothes', count).map((a) => a.outfit)).size).toBe(count);
  });

  it('includes no accessory as one of the options', () => {
    const seen = cycleTimes('accessory', ACCESSORIES.length + 1);
    expect(seen.at(-1)?.accessory).toBeUndefined();
    expect(seen.at(-1)).not.toHaveProperty('accessory');
  });

  it('changes hair colour after going through every style', () => {
    const seen = cycleTimes('hair', Object.keys(HAIR_STYLES).length);
    expect(seen.at(-1)?.hair).toBe(base.hair);
    expect(seen.at(-1)?.hairColor).not.toBe(base.hairColor);
  });

  it('never changes the original', () => {
    cycle(base, 'clothes');
    expect(base.outfit).toBe('sunny');
  });
});

describe('defaultFamily', () => {
  it('is four characters that all use catalogue values', () => {
    const family = defaultFamily();
    expect(family).toHaveLength(4);
    for (const { appearance: a } of family) {
      expect(a.hair in HAIR_STYLES).toBe(true);
      expect(a.hairColor in HAIR_COLORS).toBe(true);
      expect(a.outfit in OUTFITS).toBe(true);
      if (a.accessory) expect(ACCESSORIES).toContain(a.accessory);
    }
  });
});
