import type { HebrewLetter } from '../types.ts';

/** Where in the neighbourhood a letter hides, for the "maybe in the kitchen?" hint. */
export type LetterArea =
  | 'kitchen'
  | 'living'
  | 'kids'
  | 'makolet'
  | 'map'
  | 'gan'
  | 'beach'
  | 'later';

export interface LetterInfo {
  letter: HebrewLetter;
  /** Latin id for voice lines and files. */
  id: string;
  /** The letter's name, pointed. */
  name: string;
  /** The anchor word, pointed; it starts with the letter. */
  word: string;
  /** Voice line for the word on its own. Reuses the prop's line where they match. */
  wordLine: string;
  area: LetterArea;
  /**
   * Where it hides in phase 0, if it is one of the phase-0 letters: a prop instance, or
   * `map-<place>` for a place on the neighbourhood map.
   */
  hidesOn?: string;
  /** The picture in the letter book, when it doesn't hide on a prop. */
  picture?: string;
}

// TODO: proofread — every name and word below (SPEC §7.3).
export const LETTERS: readonly LetterInfo[] = [
  { letter: 'א', id: 'alef', name: 'אָלֶף', word: 'אֲבַטִּיחַ', wordLine: 'prop.watermelon', area: 'makolet', hidesOn: 'mk-watermelon' },
  { letter: 'ב', id: 'bet', name: 'בֵּית', word: 'בַּיִת', wordLine: 'letter.word.bet', area: 'map', hidesOn: 'map-home', picture: 'map/home.svg' },
  { letter: 'ג', id: 'gimel', name: 'גִּימֶל', word: 'גְּלִידָה', wordLine: 'prop.icecream', area: 'makolet', hidesOn: 'mk-icecream' },
  { letter: 'ד', id: 'dalet', name: 'דָּלֶת', word: 'דָּג', wordLine: 'letter.word.dalet', area: 'living', hidesOn: 'aquarium' },
  { letter: 'ה', id: 'he', name: 'הֵא', word: 'הִפּוֹפּוֹטָם', wordLine: 'prop.hippo', area: 'kids', hidesOn: 'hippo' },
  { letter: 'ו', id: 'vav', name: 'וָו', word: 'וֶרֶד', wordLine: 'letter.word.vav', area: 'living', hidesOn: 'plant' },
  { letter: 'ז', id: 'zayin', name: 'זַיִן', word: 'זַיִת', wordLine: 'letter.word.zayin', area: 'makolet', hidesOn: 'mk-olives' },
  { letter: 'ח', id: 'het', name: 'חֵית', word: 'חָלָב', wordLine: 'prop.milk', area: 'kitchen', hidesOn: 'milk' },
  { letter: 'ט', id: 'tet', name: 'טֵית', word: 'טַוָּס', wordLine: 'prop.peacock', area: 'gan', hidesOn: 'gan-peacock' },
  { letter: 'י', id: 'yod', name: 'יוֹד', word: 'יָרֵחַ', wordLine: 'letter.word.yod', area: 'later' },
  { letter: 'כ', id: 'kaf', name: 'כַּף', word: 'כַּדּוּר', wordLine: 'prop.ball', area: 'kids', hidesOn: 'ball' },
  { letter: 'ל', id: 'lamed', name: 'לָמֶד', word: 'לֶחֶם', wordLine: 'prop.bread', area: 'kitchen', hidesOn: 'bread' },
  { letter: 'מ', id: 'mem', name: 'מֵם', word: 'מְכוֹנִית', wordLine: 'letter.word.mem', area: 'later' },
  { letter: 'נ', id: 'nun', name: 'נוּן', word: 'נֵר', wordLine: 'letter.word.nun', area: 'living', hidesOn: 'candles' },
  { letter: 'ס', id: 'samekh', name: 'סָמֶךְ', word: 'סֵפֶר', wordLine: 'prop.book', area: 'kids', hidesOn: 'book' },
  { letter: 'ע', id: 'ayin', name: 'עַיִן', word: 'עוּגָה', wordLine: 'prop.cake', area: 'kitchen', hidesOn: 'cake' },
  { letter: 'פ', id: 'pe', name: 'פֵּא', word: 'פִּיל', wordLine: 'prop.elephant', area: 'gan', hidesOn: 'gan-elephant' },
  { letter: 'צ', id: 'tsadi', name: 'צָדִי', word: 'צָב', wordLine: 'prop.turtle', area: 'beach', hidesOn: 'beach-turtle' },
  { letter: 'ק', id: 'qof', name: 'קוֹף', word: 'קוֹף', wordLine: 'prop.monkey', area: 'gan', hidesOn: 'gan-monkey' },
  { letter: 'ר', id: 'resh', name: 'רֵישׁ', word: 'רַכֶּבֶת', wordLine: 'prop.train', area: 'kids', hidesOn: 'train' },
  { letter: 'ש', id: 'shin', name: 'שִׁין', word: 'שֶׁמֶשׁ', wordLine: 'prop.sun', area: 'beach', hidesOn: 'beach-sun' },
  { letter: 'ת', id: 'tav', name: 'תָּו', word: 'תַּפּוּחַ', wordLine: 'prop.apple', area: 'kitchen', hidesOn: 'apple' },
];

export function letterInfo(letter: HebrewLetter): LetterInfo {
  const info = LETTERS.find((l) => l.letter === letter);
  if (!info) throw new Error(`Unknown letter ${letter}`);
  return info;
}

/** The phase-0 letters a child can find now. */
export const HIDDEN_LETTERS: readonly LetterInfo[] = LETTERS.filter((l) => l.hidesOn);
