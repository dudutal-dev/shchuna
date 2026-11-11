import type { BodyType, Character, CharacterAppearance, SkinTone } from '../types.ts';

/** Six skin tones, light to deep. Index = SkinTone. */
export const SKIN_TONES: readonly number[] = [
  0xffe0c7, 0xf5c9a3, 0xe0a97e, 0xc68a5c, 0x9a6440, 0x6e4529,
];

export const HAIR_COLORS: Readonly<Record<string, number>> = {
  black: 0x3a2c28,
  brown: 0x7a4b2a,
  chestnut: 0xa8592e,
  blonde: 0xe8c063,
  red: 0xd0632c,
  grey: 0xc9c4bd,
};

export interface HairStyle {
  front: string | null;
  back: string | null;
}

export const HAIR_STYLES: Readonly<Record<string, HairStyle>> = {
  short: { front: 'hair-short-front', back: null },
  curly: { front: 'hair-curly-front', back: null },
  long: { front: 'hair-long-front', back: 'hair-long-back' },
  ponytail: { front: 'hair-ponytail-front', back: 'hair-ponytail-back' },
  bun: { front: 'hair-bun-front', back: null },
  bald: { front: 'hair-bald-front', back: null },
};

export interface Outfit {
  top: 'tshirt' | 'sweater' | 'dress';
  /** Ignored under a dress. */
  bottom: 'pants' | 'shorts' | 'skirt';
  topColor: number;
  bottomColor: number;
  shoesColor: number;
}

export const OUTFITS: Readonly<Record<string, Outfit>> = {
  sunny: { top: 'tshirt', bottom: 'shorts', topColor: 0xffc23c, bottomColor: 0x3e7cb1, shoesColor: 0xe4573d },
  sea: { top: 'tshirt', bottom: 'pants', topColor: 0x58b8ea, bottomColor: 0x3b4a6b, shoesColor: 0xf3f3f3 },
  bougainvillea: { top: 'dress', bottom: 'pants', topColor: 0xe5508a, bottomColor: 0xe5508a, shoesColor: 0xffc23c },
  olive: { top: 'sweater', bottom: 'pants', topColor: 0x7faf6b, bottomColor: 0x6b4c35, shoesColor: 0x3b2f2f },
  shutters: { top: 'sweater', bottom: 'skirt', topColor: 0x3e8e7e, bottomColor: 0x8a6fb3, shoesColor: 0x6b4c35 },
  sand: { top: 'tshirt', bottom: 'skirt', topColor: 0xf7f1e3, bottomColor: 0xe4573d, shoesColor: 0x3e8e7e },
  lilac: { top: 'dress', bottom: 'pants', topColor: 0xa98bd6, bottomColor: 0xa98bd6, shoesColor: 0xf3f3f3 },
  stripes: { top: 'sweater', bottom: 'shorts', topColor: 0xe4573d, bottomColor: 0x3b4a6b, shoesColor: 0x58b8ea },
};

/** Optional extras. The headscarf replaces the hair. */
export const ACCESSORIES: readonly string[] = ['glasses', 'kippa', 'headscarf', 'cap', 'bow'];

export interface BodySpec {
  /** Size of the whole figure. */
  scale: number;
  /** Head size relative to the figure, so toddlers get big heads. */
  head: number;
}

export const BODIES: Readonly<Record<BodyType, BodySpec>> = {
  small: { scale: 0.52, head: 1.15 },
  kid: { scale: 0.64, head: 1 },
  adult: { scale: 0.8, head: 0.85 },
  elder: { scale: 0.78, head: 0.85 },
};

export const BODY_ORDER: readonly BodyType[] = ['small', 'kid', 'adult', 'elder'];

/** Cycles through a list, wrapping around. */
export function next<T>(list: readonly T[], current: T): T {
  const index = list.indexOf(current);
  return list[(index + 1) % list.length] as T;
}

/** The next value for one creator category. */
export function cycle(appearance: CharacterAppearance, category: CreatorCategory): CharacterAppearance {
  const a = { ...appearance };
  switch (category) {
    case 'body':
      a.body = next(BODY_ORDER, a.body);
      break;
    case 'skin':
      a.skinTone = ((a.skinTone + 1) % SKIN_TONES.length) as SkinTone;
      break;
    case 'hair': {
      // Style first; after the last style, the colour changes too.
      const styles = Object.keys(HAIR_STYLES);
      const style = next(styles, a.hair);
      if (styles.indexOf(style) === 0) a.hairColor = next(Object.keys(HAIR_COLORS), a.hairColor);
      a.hair = style;
      break;
    }
    case 'hairColor':
      a.hairColor = next(Object.keys(HAIR_COLORS), a.hairColor);
      break;
    case 'clothes':
      a.outfit = next(Object.keys(OUTFITS), a.outfit);
      break;
    case 'accessory': {
      const options: Array<string | undefined> = [undefined, ...ACCESSORIES];
      const value = next(options, a.accessory);
      if (value) a.accessory = value;
      else delete a.accessory;
      break;
    }
  }
  return a;
}

export type CreatorCategory = 'body' | 'skin' | 'hair' | 'hairColor' | 'clothes' | 'accessory';

/** The family a new game starts with, standing in the living room. */
export function defaultFamily(): Character[] {
  const member = (id: string, x: number, appearance: CharacterAppearance): Character => ({
    id,
    appearance,
    location: 'home',
    x,
    y: 540,
    pose: 'stand',
  });
  return [
    member('family-1', 1960, { body: 'adult', skinTone: 2, hair: 'long', hairColor: 'brown', outfit: 'shutters' }),
    member('family-2', 1840, { body: 'adult', skinTone: 2, hair: 'short', hairColor: 'black', outfit: 'olive', accessory: 'glasses' }),
    member('family-3', 1720, { body: 'kid', skinTone: 2, hair: 'ponytail', hairColor: 'brown', outfit: 'sunny' }),
    member('family-4', 1620, { body: 'small', skinTone: 2, hair: 'curly', hairColor: 'chestnut', outfit: 'sea' }),
  ];
}

/** The gan's people: the teacher (the ganenet) and two children. */
export function ganPeople(): Character[] {
  const person = (id: string, x: number, appearance: CharacterAppearance): Character => ({
    id,
    appearance,
    location: 'gan',
    x,
    y: 545,
    pose: 'stand',
  });
  return [
    // The teacher by the puppet theatre, a child in the yard, one by the cubby: nobody
    // stands in front of the toys.
    person('gan-1', 2120, { body: 'adult', skinTone: 4, hair: 'curly', hairColor: 'black', outfit: 'lilac' }),
    person('gan-2', 720, { body: 'kid', skinTone: 1, hair: 'short', hairColor: 'blonde', outfit: 'sea', accessory: 'cap' }),
    person('gan-3', 1240, { body: 'kid', skinTone: 5, hair: 'long', hairColor: 'black', outfit: 'sunny', accessory: 'bow' }),
  ];
}
