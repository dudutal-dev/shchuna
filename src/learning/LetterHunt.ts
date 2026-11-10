import { HIDDEN_LETTERS, letterInfo, LETTERS } from '../content/letters.ts';
import type { HebrewLetter, LetterProgress } from '../types.ts';

/** Voice lines for the letter hunt. Lines addressed to the child have `.m`/`.f` recordings. */
export const letterLines = {
  found: (letter: HebrewLetter) => `letter.found.${letterInfo(letter).id}`,
  name: (letter: HebrewLetter) => `letter.name.${letterInfo(letter).id}`,
  word: (letter: HebrewLetter) => letterInfo(letter).wordLine,
  hint: (letter: HebrewLetter) => `letter.hint.${letterInfo(letter).area}`,
};

export function isFound(progress: readonly LetterProgress[], letter: HebrewLetter): boolean {
  return progress.some((p) => p.letter === letter && p.found);
}

/** The letter still waiting to be found on this prop instance, if any. */
export function letterOn(
  progress: readonly LetterProgress[],
  instanceId: string,
): HebrewLetter | null {
  const info = HIDDEN_LETTERS.find((l) => l.hidesOn === instanceId);
  return info && !isFound(progress, info.letter) ? info.letter : null;
}

/** Marks a letter found. A letter is found once only: `isNew` is false the second time. */
export function find(
  progress: readonly LetterProgress[],
  letter: HebrewLetter,
  now: number,
): { progress: LetterProgress[]; isNew: boolean } {
  const isNew = !isFound(progress, letter);
  const next = LETTERS.map(({ letter: l }) => {
    const existing = progress.find((p) => p.letter === l) ?? { letter: l, found: false, timesHeard: 0 };
    if (l !== letter || !isNew) return { ...existing };
    return { ...existing, found: true, foundAt: now };
  });
  return { progress: next, isNew };
}

/** Counts a replay from the letter book, for the parents' screen later on. */
export function hear(progress: readonly LetterProgress[], letter: HebrewLetter): LetterProgress[] {
  return progress.map((p) => (p.letter === letter ? { ...p, timesHeard: p.timesHeard + 1 } : { ...p }));
}

export function foundCount(progress: readonly LetterProgress[]): number {
  return progress.filter((p) => p.found).length;
}

/** What tapping a letter in the book says. */
export function bookLines(progress: readonly LetterProgress[], letter: HebrewLetter): string[] {
  return isFound(progress, letter)
    ? [letterLines.name(letter), letterLines.word(letter)]
    : [letterLines.hint(letter)];
}
