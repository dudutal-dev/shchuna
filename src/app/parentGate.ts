/** The parents' gate question (SPEC §12): a times table a young child can't read or solve. */
export interface GateQuestion {
  a: number;
  b: number;
  answer: number;
  /** Four different numbers, the answer among them, in random order. */
  choices: number[];
}

/** Two wrong answers send the player back to the game. */
export const MAX_MISTAKES = 2;
const LOWEST = 3;
const HIGHEST = 9;

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

export function makeQuestion(random: () => number = Math.random): GateQuestion {
  const pick = () => LOWEST + Math.floor(random() * (HIGHEST - LOWEST + 1));
  const a = pick();
  const b = pick();
  const answer = a * b;
  // Near misses, so the right answer doesn't stand out by size.
  const near = shuffle([answer + a, answer - a, answer + b, answer - b, answer + 1, answer - 1, answer + 10], random);
  const choices = new Set([answer]);
  for (const n of near) {
    if (choices.size === 4) break;
    if (n > 0) choices.add(n);
  }
  return { a, b, answer, choices: shuffle([...choices], random) };
}
