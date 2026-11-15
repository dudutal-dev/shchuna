import { describe, expect, it } from 'vitest';
import { parentStrings } from '../../src/content/parent.he';
import { STORIES } from '../../src/content/stories';
import { daysAgo, storyRows } from '../../src/ui/ProgressPanel';

describe('parents progress', () => {
  const noon = new Date(2026, 10, 12, 12, 0).getTime();
  const day = 24 * 60 * 60 * 1000;

  it('says when a letter was found in plain words', () => {
    expect(daysAgo(noon - 60 * 60 * 1000, noon)).toBe('היום');
    expect(daysAgo(noon - day, noon)).toBe('אתמול');
    expect(daysAgo(noon - 5 * day, noon)).toBe('לפני 5 ימים');
  });

  it('counts calendar days, not 24-hour spans', () => {
    // Found late last night, looked at early this morning: that was yesterday.
    const lateLastNight = new Date(2026, 10, 11, 23, 30).getTime();
    const earlyMorning = new Date(2026, 10, 12, 7, 0).getTime();
    expect(daysAgo(lateLastNight, earlyMorning)).toBe('אתמול');
  });
});

describe('the stories a child finished, for parents', () => {
  const noon = new Date(2026, 10, 12, 12, 0).getTime();
  const day = 24 * 60 * 60 * 1000;

  it('is empty before any story was finished', () => {
    expect(storyRows([], noon)).toEqual([]);
  });

  it('names each finished story and the day, newest first, with no counting', () => {
    expect(storyRows([{ id: 'pita', at: noon - day }], noon)).toEqual([{ name: 'פיתה לסבא', when: 'אתמול' }]);
  });

  it('has a name for every story, so none goes missing from the list', () => {
    for (const story of STORIES) expect(parentStrings.progress.stories.names[story.id]).toBeTruthy();
  });

  it('leaves out a story the game no longer has', () => {
    expect(storyRows([{ id: 'gone', at: noon }], noon)).toEqual([]);
  });
});
