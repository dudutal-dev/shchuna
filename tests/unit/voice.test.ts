import { describe, expect, it } from 'vitest';
import {
  costUsd,
  lineHash,
  linesMissingAudio,
  lintVoiceLines,
  wordsMissingNiqqud,
  type VoiceLine,
} from '../../scripts/lib/voice';
import { propDefs } from '../../src/content/props';
import voiceLines from '../../src/content/voice-lines.json';

const line: VoiceLine = { id: 'a', text: 'חָלָב', voice: 'narrator' };

describe('voice-lines.json', () => {
  it('has a line for every prop, with the same text the prop shows', () => {
    for (const def of Object.values(propDefs)) {
      const found = voiceLines.find((candidate) => candidate.id === def.voiceLine);
      expect(found, def.voiceLine).toBeDefined();
      expect(found?.text).toBe(def.nameHe);
    }
  });

  it('is valid: full niqqud and no duplicate ids', () => {
    expect(lintVoiceLines(voiceLines)).toEqual([]);
  });
});

describe('wordsMissingNiqqud', () => {
  it('flags a bare word and passes a pointed one', () => {
    expect(wordsMissingNiqqud('חלב')).toEqual(['חלב']);
    expect(wordsMissingNiqqud('חָלָב')).toEqual([]);
  });

  it('checks each word on its own', () => {
    expect(wordsMissingNiqqud('חָלָב טרי')).toEqual(['טרי']);
  });

  it('allows a lone letter and non-Hebrew text', () => {
    expect(wordsMissingNiqqud('ל 3!')).toEqual([]);
  });
});

describe('lintVoiceLines', () => {
  it('reports duplicate ids', () => {
    expect(lintVoiceLines([line, line])).toEqual(['a: duplicate id']);
  });
});

describe('lineHash', () => {
  const hash = lineHash(line, 'voice1', 'eleven_v4');

  it('is stable for the same input', () => {
    expect(lineHash({ ...line }, 'voice1', 'eleven_v4')).toBe(hash);
  });

  it('changes with the text, voice and model, so changed lines are regenerated', () => {
    expect(lineHash({ ...line, text: 'לֶחֶם' }, 'voice1', 'eleven_v4')).not.toBe(hash);
    expect(lineHash(line, 'voice2', 'eleven_v4')).not.toBe(hash);
    expect(lineHash(line, 'voice1', 'eleven_v3')).not.toBe(hash);
  });

  it('follows the spoken text, so editing only the displayed niqqud costs nothing', () => {
    const spoken = { ...line, spoken: 'חלב' };
    expect(lineHash(spoken, 'voice1', 'eleven_v4')).not.toBe(hash);
    expect(lineHash({ ...spoken, text: 'חָלָב!' }, 'voice1', 'eleven_v4')).toBe(
      lineHash(spoken, 'voice1', 'eleven_v4'),
    );
  });
});

describe('linesMissingAudio', () => {
  const entry = { file: 'a.mp3', text: line.text, durationMs: 1, hash: 'x' };

  it('lists a line whose text changed after it was recorded', () => {
    const stale = { ...entry, text: 'חָלָב יָשָׁן' };
    expect(linesMissingAudio([line], { lines: { a: stale } }, () => true)).toEqual(['a']);
  });

  it('compares against the spoken text when a line has one', () => {
    const spoken: VoiceLine = { ...line, spoken: 'חלב' };
    const recorded = { ...entry, text: 'חלב' };
    expect(linesMissingAudio([spoken], { lines: { a: recorded } }, () => true)).toEqual([]);
    expect(linesMissingAudio([spoken], { lines: { a: entry } }, () => true)).toEqual(['a']);
  });

  it('lists lines absent from the manifest or whose file is gone', () => {
    expect(linesMissingAudio([line], { lines: {} }, () => true)).toEqual(['a']);
    expect(linesMissingAudio([line], { lines: { a: entry } }, () => false)).toEqual(['a']);
    expect(linesMissingAudio([line], { lines: { a: entry } }, () => true)).toEqual([]);
  });
});

describe('costUsd', () => {
  it('prices known models and admits not knowing others', () => {
    expect(costUsd(1000, 'eleven_v4')).toBeCloseTo(0.08);
    expect(costUsd(1000, 'something_else')).toBeNull();
  });
});
