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

/**
 * The story to offer on arriving somewhere: it starts here, hasn't been told to the end or
 * put away, and everyone it needs is here.
 */
export function nextStory(
  stories: readonly Story[],
  progress: StoryProgress,
  place: LocationId,
  whereIs: (characterId: string) => LocationId | undefined,
  skipped: ReadonlySet<string>,
): Story | null {
  const done = new Set(progress.done.map((entry) => entry.id));
  return (
    stories.find(
      (story) =>
        story.start === place &&
        !done.has(story.id) &&
        !skipped.has(story.id) &&
        story.needs.every((id) => whereIs(id) === place),
    ) ?? null
  );
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
    progress: { done: [...progress.done, { id: story.id, at: now }], offered: progress.offered },
    outcome: 'finished',
  };
}
