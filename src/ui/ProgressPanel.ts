import { LETTERS } from '../content/letters';
import { parentStrings } from '../content/parent.he';
import type { LetterProgress } from '../types';
import { el } from './ParentGate';

const text = parentStrings.progress;

/**
 * What the child has found so far, for parents (SPEC §8): the letters found out of 22, each
 * with the day it was found and how often it was listened to in the letter book. No scores,
 * no streaks and no time played: just what there is to talk about together.
 */
export function progressPanel(letters: readonly LetterProgress[], now = Date.now()): HTMLElement {
  const group = el('div', 'parent-group progress');
  const found = letters.filter((l) => l.found).length;
  group.append(
    el('h3', '', text.title),
    el('p', 'progress-count', text.found(found, LETTERS.length)),
  );
  const grid = el('div', 'progress-grid');
  grid.setAttribute('role', 'list');
  for (const info of LETTERS) {
    const progress = letters.find((l) => l.letter === info.letter);
    const cell = el('div', progress?.found ? 'progress-cell found' : 'progress-cell');
    cell.setAttribute('role', 'listitem');
    cell.append(el('span', 'progress-letter', info.letter));
    if (progress?.found) {
      const when = progress.foundAt ? daysAgo(progress.foundAt, now) : '';
      cell.append(el('span', 'progress-detail', when));
      if (progress.timesHeard > 0) cell.append(el('span', 'progress-detail', text.heard(progress.timesHeard)));
      cell.setAttribute('aria-label', `${info.letter}: ${text.foundLabel} ${when}`);
    } else {
      cell.setAttribute('aria-label', `${info.letter}: ${text.notYet}`);
    }
    grid.append(cell);
  }
  group.append(grid, el('p', 'parent-hint', text.hint));
  return group;
}

/** "today", "yesterday", or "N days ago". */
export function daysAgo(at: number, now: number): string {
  const day = 24 * 60 * 60 * 1000;
  const startOf = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((startOf(now) - startOf(at)) / day);
  if (days <= 0) return text.today;
  if (days === 1) return text.yesterday;
  return text.daysAgo(days);
}
