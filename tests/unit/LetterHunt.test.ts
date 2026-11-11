import { describe, expect, it } from 'vitest';
import { HIDDEN_LETTERS, LETTERS } from '../../src/content/letters';
import { PLACES } from '../../src/content/places';
import { gan } from '../../src/locations/gan/gan.data';
import { propDefs } from '../../src/content/props';
import voiceLines from '../../src/content/voice-lines.json';
import { createNewSave } from '../../src/engine/SaveManager';
import {
  bookLines,
  find,
  foundCount,
  hear,
  isFound,
  letterLines,
  letterOn,
} from '../../src/learning/LetterHunt';
import { home } from '../../src/locations/home/home.data';

const fresh = () => createNewSave().letters;

describe('letters content', () => {
  it('covers all 22 letters, in order, each word starting with its letter', () => {
    expect(LETTERS).toHaveLength(22);
    expect(LETTERS.map((l) => l.letter).join('')).toBe('אבגדהוזחטיכלמנסעפצקרשת');
    for (const l of LETTERS) expect(l.word.startsWith(l.letter)).toBe(true);
  });

  it('hides eleven letters on props in the home and the gan, or on a place on the map', () => {
    expect(HIDDEN_LETTERS.map((l) => l.letter).sort().join('')).toBe('בדחטכלסעפקת');
    const ids = new Set([
      ...home.props.map((p) => p.id),
      ...gan.props.map((p) => p.id),
      ...PLACES.map((p) => `map-${p.id}`),
    ]);
    for (const l of HIDDEN_LETTERS) expect(ids.has(l.hidesOn!), l.hidesOn).toBe(true);
  });

  it('has every voice line a phase-0 letter can say, in both genders where addressed', () => {
    const ids = new Set(voiceLines.map((line) => line.id));
    for (const { letter } of HIDDEN_LETTERS) {
      expect(ids.has(`${letterLines.found(letter)}.m`)).toBe(true);
      expect(ids.has(`${letterLines.found(letter)}.f`)).toBe(true);
      expect(ids.has(letterLines.name(letter))).toBe(true);
      expect(ids.has(letterLines.word(letter))).toBe(true);
    }
    for (const { letter } of LETTERS) expect(ids.has(letterLines.hint(letter)), letter).toBe(true);
  });

  it('uses prop lines for words only where the prop says exactly that word', () => {
    for (const l of LETTERS) {
      if (!l.wordLine.startsWith('prop.')) continue;
      const def = Object.values(propDefs).find((d) => d.voiceLine === l.wordLine);
      expect(def?.nameHe, l.wordLine).toBe(l.word);
    }
  });
});

describe('LetterHunt', () => {
  it('finds a letter once and records when', () => {
    const { progress, isNew } = find(fresh(), 'ל', 1000);
    expect(isNew).toBe(true);
    expect(isFound(progress, 'ל')).toBe(true);
    expect(progress.find((p) => p.letter === 'ל')?.foundAt).toBe(1000);
  });

  it('never counts the same letter twice', () => {
    const once = find(fresh(), 'ל', 1000).progress;
    const twice = find(once, 'ל', 2000);
    expect(twice.isNew).toBe(false);
    expect(foundCount(twice.progress)).toBe(1);
    expect(twice.progress.find((p) => p.letter === 'ל')?.foundAt).toBe(1000);
  });

  it('counts progress across letters', () => {
    let progress = fresh();
    for (const letter of ['ל', 'ח', 'ת'] as const) progress = find(progress, letter, 1).progress;
    expect(foundCount(progress)).toBe(3);
  });

  it('shows a letter on its prop until it is found', () => {
    expect(letterOn(fresh(), 'bread')).toBe('ל');
    expect(letterOn(find(fresh(), 'ל', 1).progress, 'bread')).toBeNull();
    expect(letterOn(fresh(), 'sofa')).toBeNull();
  });

  it('repairs a progress list that lacks some letters', () => {
    const { progress } = find([], 'ד', 1);
    expect(progress).toHaveLength(22);
  });

  it('counts replays from the book', () => {
    const progress = hear(hear(fresh(), 'ל'), 'ל');
    expect(progress.find((p) => p.letter === 'ל')?.timesHeard).toBe(2);
  });

  it('says name and word for a found letter, and a hint for a missing one', () => {
    const found = find(fresh(), 'ל', 1).progress;
    expect(bookLines(found, 'ל')).toEqual(['letter.name.lamed', 'prop.bread']);
    expect(bookLines(fresh(), 'ל')).toEqual(['letter.hint.kitchen']);
    expect(bookLines(fresh(), 'מ')).toEqual(['letter.hint.later']);
  });
});
