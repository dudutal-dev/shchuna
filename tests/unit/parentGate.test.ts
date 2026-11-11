import { describe, expect, it } from 'vitest';
import { makeQuestion, MAX_MISTAKES } from '../../src/app/parentGate';
import { parentStrings } from '../../src/content/parent.he';

/** A repeatable random sequence, so every seed is a different question. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2 ** 31;
    return state / 2 ** 31;
  };
}

describe('parents gate', () => {
  it('asks a times table from 3 to 9 with four different answers, one right', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const q = makeQuestion(seeded(seed));
      expect(q.a).toBeGreaterThanOrEqual(3);
      expect(q.b).toBeLessThanOrEqual(9);
      expect(q.answer).toBe(q.a * q.b);
      expect(new Set(q.choices).size).toBe(4);
      expect(q.choices).toContain(q.answer);
      for (const choice of q.choices) expect(choice).toBeGreaterThan(0);
    }
  });

  it('puts the right answer in different places', () => {
    const places = new Set<number>();
    for (let seed = 1; seed <= 100; seed++) {
      const q = makeQuestion(seeded(seed));
      places.add(q.choices.indexOf(q.answer));
    }
    expect(places.size).toBe(4);
  });

  it('writes the question in words, never digits', () => {
    for (let a = 3; a <= 9; a++) {
      for (let b = 3; b <= 9; b++) expect(parentStrings.gate.question(a, b)).not.toMatch(/\d/);
    }
  });

  it('sends the player back after two mistakes', () => {
    expect(MAX_MISTAKES).toBe(2);
  });
});
