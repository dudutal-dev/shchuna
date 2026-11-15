import type { Invitation } from '../content/invitations';
import type { StepDone, Story, StoryEvent, StoryStep } from '../content/stories';
import type { LocationId, StoryLevel, StoryProgress } from '../types';

/** Ages 5–6, until the parents choose. */
export const DEFAULT_LEVEL: StoryLevel = 2;

export function stepsOf(story: Story, level: StoryLevel): readonly StoryStep[] {
  return story.steps[level];
}

/** Whether what just happened is what the step was waiting for. */
export function matches(done: StepDone, event: StoryEvent): boolean {
  if ('tap' in done) return event.kind === 'tap' && event.prop === done.tap;
  if ('state' in done) {
    return (
      event.kind === 'state' &&
      event.prop === done.state.prop &&
      event.key === done.state.key &&
      event.value === done.state.value
    );
  }
  if ('used' in done) {
    return (
      event.kind === 'used' &&
      event.target === done.used.target &&
      (done.used.source === undefined || event.source === done.used.source)
    );
  }
  if ('fed' in done) {
    if (event.kind !== 'fed' || event.who !== done.fed.who || event.food !== done.fed.food) return false;
    return Object.entries(done.fed.state ?? {}).every(([key, value]) => event.state[key] === value);
  }
  if ('surface' in done) return event.kind === 'surface' && event.id === done.surface;
  return event.kind === 'activity' && event.activity === done.activity;
}

/** What to say and show for a step now: the step itself, or what it needs first. */
export function guidance(
  step: StoryStep,
  stateOf: (prop: string, key: string) => unknown,
): { line: string; show: Invitation['show'] } {
  const ready = step.ready;
  if (ready && stateOf(ready.prop, ready.key) !== ready.value) return { line: ready.line, show: ready.show };
  return { line: step.line, show: step.show };
}

/** A story that can't go on: someone it needs has left the place it is told in. */
export function stranded(story: Story, whereIs: (characterId: string) => LocationId | undefined): boolean {
  return story.needs.some((id) => whereIs(id) !== story.start);
}

/**
 * The story on offer in the neighbourhood: it wasn't put away, and everyone it needs is where
 * it starts. New stories come first, in their order; once every story has been told, the one
 * told longest ago comes back. It begins when the child walks into the place it starts in.
 */
export function nextStory(
  stories: readonly Story[],
  progress: StoryProgress,
  whereIs: (characterId: string) => LocationId | undefined,
  skipped: ReadonlySet<string>,
): Story | null {
  const doneAt = new Map(progress.done.map((entry) => [entry.id, entry.at]));
  const ready = stories.filter((story) => !skipped.has(story.id) && !stranded(story, whereIs));
  const fresh = ready.find((story) => !doneAt.has(story.id));
  if (fresh) return fresh;
  if (!stories.every((story) => doneAt.has(story.id))) return null;
  return [...ready].sort((a, b) => (doneAt.get(a.id) ?? 0) - (doneAt.get(b.id) ?? 0))[0] ?? null;
}

/**
 * A record that still makes sense: a story that no longer exists is dropped, and one whose
 * step is past the end (the level changed) starts again.
 */
export function sanitize(stories: readonly Story[], progress: StoryProgress, level: StoryLevel): StoryProgress {
  const active = progress.active;
  if (!active) return progress;
  const story = stories.find((candidate) => candidate.id === active.id);
  if (!story) return { done: progress.done, offered: progress.offered };
  const inRange = Number.isInteger(active.step) && active.step >= 0 && active.step < stepsOf(story, level).length;
  return inRange ? progress : { ...progress, active: { id: story.id, step: 0 } };
}

/** Moves the story on if the event finishes its current step. Never changes `progress`. */
export function advance(
  stories: readonly Story[],
  progress: StoryProgress,
  level: StoryLevel,
  event: StoryEvent,
  now: number,
): { progress: StoryProgress; outcome: 'none' | 'step' | 'finished' } {
  const active = progress.active;
  const story = active && stories.find((candidate) => candidate.id === active.id);
  if (!active || !story) return { progress, outcome: 'none' };
  const steps = stepsOf(story, level);
  const step = steps[active.step];
  if (!step || !matches(step.done, event)) return { progress, outcome: 'none' };
  if (active.step + 1 < steps.length) {
    return { progress: { ...progress, active: { id: story.id, step: active.step + 1 } }, outcome: 'step' };
  }
  return {
    // Told again, it is still one story: only the time moves on.
    progress: {
      done: [...progress.done.filter((entry) => entry.id !== story.id), { id: story.id, at: now }],
      offered: progress.offered,
    },
    outcome: 'finished',
  };
}
