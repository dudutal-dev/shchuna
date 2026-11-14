import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { propDefs } from '../../src/content/props';
import { STORIES, type StoryEvent } from '../../src/content/stories';
import voiceLines from '../../src/content/voice-lines.json';
import { advance, guidance, matches, nextStory, sanitize, stepsOf, stranded } from '../../src/learning/StoryEngine';
import type { LocationId, StoryProgress } from '../../src/types';

const PITA = 'falafel-falafel-pita';
const filled: StoryEvent = { kind: 'used', source: 'falafel-falafel-bowl', target: PITA };
const servedFull: StoryEvent = { kind: 'fed', who: 'falafel-2', food: PITA, state: { stuffed: true } };
const servedEmpty: StoryEvent = { kind: 'fed', who: 'falafel-2', food: PITA, state: {} };

const fresh = (): StoryProgress => ({ done: [], offered: [] });
const active = (step: number): StoryProgress => ({ active: { id: 'pita', step }, done: [], offered: ['pita'] });
const everyoneAt = (place: LocationId) => () => place;

describe('matches', () => {
  it('takes any source when none is named, and only the named one otherwise', () => {
    const salad: StoryEvent = { kind: 'used', source: 'falafel-salad-bowl', target: PITA };
    expect(matches({ used: { target: PITA } }, salad)).toBe(true);
    expect(matches({ used: { source: 'falafel-falafel-bowl', target: PITA } }, salad)).toBe(false);
    expect(matches({ used: { source: 'falafel-falafel-bowl', target: PITA } }, filled)).toBe(true);
  });

  it('does not count an empty pita as the full one that was asked for', () => {
    const done = { fed: { who: 'falafel-2', food: PITA, state: { stuffed: true } } };
    expect(matches(done, servedEmpty)).toBe(false);
    expect(matches(done, servedFull)).toBe(true);
    expect(matches(done, { ...servedFull, who: 'falafel-1' })).toBe(false);
  });

  it('needs the prop, the key and the value of a state to agree', () => {
    const done = { state: { prop: 'fridge', key: 'open', value: true } };
    expect(matches(done, { kind: 'state', prop: 'fridge', key: 'open', value: true })).toBe(true);
    expect(matches(done, { kind: 'state', prop: 'fridge', key: 'open', value: false })).toBe(false);
    expect(matches(done, { kind: 'state', prop: 'tv', key: 'open', value: true })).toBe(false);
    expect(matches(done, { kind: 'tap', prop: 'fridge' })).toBe(false);
  });
});

describe('nextStory', () => {
  it('offers the pita story at the falafel stand only', () => {
    expect(nextStory(STORIES, fresh(), 'falafel', everyoneAt('falafel'), new Set())?.id).toBe('pita');
    expect(nextStory(STORIES, fresh(), 'home', everyoneAt('falafel'), new Set())).toBeNull();
  });

  it('is not offered while grandpa is somewhere else', () => {
    expect(nextStory(STORIES, fresh(), 'falafel', everyoneAt('home'), new Set())).toBeNull();
    expect(nextStory(STORIES, fresh(), 'falafel', () => undefined, new Set())).toBeNull();
  });

  it('is not offered after being put away', () => {
    expect(nextStory(STORIES, fresh(), 'falafel', everyoneAt('falafel'), new Set(['pita']))).toBeNull();
  });
});

describe('advance', () => {
  it('walks level 1 from the first step to the end', () => {
    const start = active(0);
    const ignored = advance(STORIES, start, 1, { kind: 'tap', prop: 'falafel-fryer' }, 5);
    expect(ignored.outcome).toBe('none');
    expect(ignored.progress).toBe(start);

    const stepped = advance(STORIES, start, 1, filled, 5);
    expect(stepped.outcome).toBe('step');
    expect(stepped.progress.active).toEqual({ id: 'pita', step: 1 });
    expect(start.active).toEqual({ id: 'pita', step: 0 });

    const finished = advance(STORIES, stepped.progress, 1, servedFull, 9);
    expect(finished.outcome).toBe('finished');
    expect(finished.progress.active).toBeUndefined();
    expect(finished.progress.done).toEqual([{ id: 'pita', at: 9 }]);
  });

  it('does nothing without a story in progress', () => {
    expect(advance(STORIES, fresh(), 1, filled, 5).outcome).toBe('none');
  });

  it('keeps a finished step finished, whatever happens next', () => {
    const { progress } = advance(STORIES, active(0), 1, filled, 5);
    for (const event of [filled, servedEmpty, { kind: 'tap', prop: PITA } as StoryEvent]) {
      expect(advance(STORIES, progress, 1, event, 6).progress.active?.step).toBe(1);
    }
  });

  it('at level 2 the salad counts only once the falafel is in', () => {
    const salad: StoryEvent = { kind: 'used', source: 'falafel-salad-bowl', target: PITA };
    expect(advance(STORIES, active(0), 2, salad, 5).outcome).toBe('none');
    expect(advance(STORIES, active(1), 2, salad, 5).progress.active?.step).toBe(2);
  });
});

describe('a story told before', () => {
  const told: StoryProgress = { done: [{ id: 'pita', at: 1 }], offered: ['pita'] };

  it('comes back once every story has been told', () => {
    expect(nextStory(STORIES, told, 'falafel', everyoneAt('falafel'), new Set())?.id).toBe('pita');
    // But not one the child put away today.
    expect(nextStory(STORIES, told, 'falafel', everyoneAt('falafel'), new Set(['pita']))).toBeNull();
  });

  it('is recorded once, with the latest time, however often it is finished', () => {
    const again: StoryProgress = { ...told, active: { id: 'pita', step: 1 } };
    const { progress, outcome } = advance(STORIES, again, 1, servedFull, 7);
    expect(outcome).toBe('finished');
    expect(progress.done).toEqual([{ id: 'pita', at: 7 }]);
  });
});

describe('guidance', () => {
  const pita = STORIES.find((story) => story.id === 'pita')!;
  const serve = stepsOf(pita, 1)[1]!;
  const drink = stepsOf(pita, 3)[3]!;

  it('is the step itself when the step can be done', () => {
    expect(guidance(serve, () => true)).toEqual({ line: serve.line, show: serve.show });
  });

  it('goes back to filling the pita when the pita to serve is empty', () => {
    const empty = guidance(serve, () => undefined);
    expect(empty.line).toBe('story.pita.fill');
    expect(empty.show).toEqual(stepsOf(pita, 1)[0]!.show);
  });

  it('goes back to opening the fridge when the lemonade is shut inside', () => {
    expect(guidance(drink, () => false).line).toBe('story.pita.fridge');
    expect(guidance(drink, (prop, key) => prop === 'falafel-drinks-fridge' && key === 'open').line).toBe('story.pita.drink');
  });

  it('shows the food going to grandpa himself, wherever he sits', () => {
    expect(serve.show).toMatchObject({ to: { prop: ['falafel-2'] } });
    expect(drink.show).toMatchObject({ to: { prop: ['falafel-2'] } });
  });
});

describe('stranded', () => {
  const pita = STORIES.find((story) => story.id === 'pita')!;

  it('is a story whose people have left the place it is told in', () => {
    expect(stranded(pita, everyoneAt('falafel'))).toBe(false);
    expect(stranded(pita, everyoneAt('home'))).toBe(true);
    expect(stranded(pita, () => undefined)).toBe(true);
  });
});

describe('sanitize', () => {
  it('drops a story that no longer exists', () => {
    const lost: StoryProgress = { active: { id: 'gone', step: 0 }, done: [], offered: [] };
    expect(sanitize(STORIES, lost, 2).active).toBeUndefined();
  });

  it('starts again when the step is past the end of this level', () => {
    expect(sanitize(STORIES, active(3), 1).active).toEqual({ id: 'pita', step: 0 });
  });

  it('leaves a good record alone', () => {
    const good = active(1);
    expect(sanitize(STORIES, good, 2)).toBe(good);
    const idle = fresh();
    expect(sanitize(STORIES, idle, 2)).toBe(idle);
  });
});

describe('story content', () => {
  const lines = new Set(voiceLines.map((line) => line.id));

  it('has the three levels of the pita story', () => {
    const pita = STORIES.find((story) => story.id === 'pita')!;
    expect(stepsOf(pita, 1).map((step) => step.id)).toEqual(['fill', 'serve']);
    expect(stepsOf(pita, 2).map((step) => step.id)).toEqual(['falafel', 'salad', 'serve']);
    expect(stepsOf(pita, 3).map((step) => step.id)).toEqual(['falafel', 'serve', 'fridge', 'drink']);
    // Only the oldest children get written words.
    expect(stepsOf(pita, 1).every((step) => step.word === undefined)).toBe(true);
    expect(stepsOf(pita, 3).filter((step) => step.word).map((step) => step.word)).toEqual(['falafel-pita', 'lemonade']);
  });

  it('every line is recorded, every picture exists, every word is a prop', () => {
    for (const story of STORIES) {
      expect(lines.has(story.openLine), story.openLine).toBe(true);
      expect(lines.has(story.doneLine), story.doneLine).toBe(true);
      for (const level of [1, 2, 3] as const) {
        for (const step of stepsOf(story, level)) {
          expect(lines.has(step.line), step.line).toBe(true);
          expect(existsSync(`assets/art/${step.art}`), step.art).toBe(true);
          if (step.word) expect(propDefs[step.word], step.word).toBeDefined();
        }
      }
    }
    expect(lines.has('story.later')).toBe(true);
  });
});
