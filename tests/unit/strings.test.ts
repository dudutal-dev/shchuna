import { describe, expect, it } from 'vitest';
import { strings } from '../../src/content/strings.he';

const NIQQUD = /[ְ-ׇּׁׂ]/;

describe('child strings', () => {
  it('all carry niqqud', () => {
    for (const value of Object.values(strings)) expect(value).toMatch(NIQQUD);
  });
});
