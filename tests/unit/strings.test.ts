import { describe, expect, it } from 'vitest';
import { strings } from '../../src/content/strings.he';

const NIQQUD = /[ְ-ׇּׁׂ]/;

function leaves(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Object.values(value as object).flatMap(leaves);
}

describe('child strings', () => {
  it('all carry niqqud', () => {
    const all = leaves(strings);
    expect(all.length).toBeGreaterThan(0);
    for (const value of all) expect(value).toMatch(NIQQUD);
  });
});
