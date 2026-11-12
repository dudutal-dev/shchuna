import { describe, expect, it } from 'vitest';
import { daysAgo } from '../../src/ui/ProgressPanel';

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
