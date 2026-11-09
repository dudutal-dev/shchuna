export type LocationId =
  | 'home'
  | 'makolet'
  | 'gan'
  | 'clinic'
  | 'falafel'
  | 'beach'
  | 'station'
  /** Engine test scene, not part of the neighbourhood. */
  | 'playground';

export type HebrewLetter =
  | 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו' | 'ז' | 'ח' | 'ט' | 'י' | 'כ'
  | 'ל' | 'מ' | 'נ' | 'ס' | 'ע' | 'פ' | 'צ' | 'ק' | 'ר' | 'ש' | 'ת';

export type SkinTone = 0 | 1 | 2 | 3 | 4 | 5;
export type AddressGender = 'm' | 'f';

export interface CharacterAppearance {
  body: 'small' | 'kid' | 'adult' | 'elder';
  skinTone: SkinTone;
  hair: string;
  hairColor: string;
  top: string;
  bottom: string;
  shoes: string;
  accessory?: string;
}

export interface Character {
  id: string;
  appearance: CharacterAppearance;
  location: LocationId;
  x: number;
  y: number;
  pose: 'stand' | 'sit' | 'lie';
  holding?: string;
}

export type PropState = Record<string, unknown>;

export type Interaction =
  /** Tapping applies a fixed state. */
  | { type: 'tap'; set: PropState }
  /** Tapping flips a boolean state key. */
  | { type: 'toggle'; key: string }
  /**
   * Dropping this prop near a target prop changes either or both of them. With
   * `whileNear`, moving it away again clears the `setSource` keys (a pot leaving the stove).
   */
  | {
      type: 'useOn';
      target: string;
      setSource?: PropState;
      setTarget?: PropState;
      whileNear?: boolean;
    }
  /** Tapping gets a reaction but changes nothing, like stroking the cat. */
  | { type: 'pet'; sfx: 'purr' }
  | { type: 'holdIn' }
  | { type: 'sitOn' }
  | { type: 'lieOn' };

export interface PropDef {
  id: string;
  nameHe: string;
  voiceLine: string;
  /** Path under assets/art. */
  art: string;
  /**
   * Alternate art by state. The first entry whose `when` matches wins. With
   * `frames`, the art cycles through them instead (a boiling pot, a TV that's on).
   */
  artStates?: Array<{ when: PropState; art: string; frames?: string[] }>;
  /** Furniture draws behind items, so an apple on a table is in front of the table. */
  layer: 'furniture' | 'item';
  draggable: boolean;
  interactions: Interaction[];
  /** Where other props get used on this one, relative to its feet. Tall furniture needs this. */
  useOnPoint?: { x: number; y: number };
  letter?: HebrewLetter;
  price?: number;
}

export interface PropInstance {
  id: string;
  defId: string;
  location: LocationId;
  x: number;
  y: number;
  /** The surface it rests on, if any. Props in a closed fridge are hidden. */
  on?: string;
  state?: PropState;
}

export interface LetterProgress {
  letter: HebrewLetter;
  found: boolean;
  foundAt?: number;
  timesHeard: number;
}

export interface Settings {
  music: number;
  voice: number;
  sfx: number;
  showNiqqud: boolean;
  addressGender: AddressGender;
}

export interface SaveGame {
  version: number;
  createdAt: number;
  updatedAt: number;
  characters: Character[];
  props: PropInstance[];
  letters: LetterProgress[];
  wallet: number;
  settings: Settings;
  unlocked: LocationId[];
}
