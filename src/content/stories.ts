import type { Activity } from '../engine/DragSystem';
import type { LocationId, PropState, StoryLevel } from '../types';
import type { Invitation } from './invitations';

/** What the child just did, reported by the scene. */
export type StoryEvent =
  | { kind: 'tap'; prop: string }
  | { kind: 'state'; prop: string; key: string; value: unknown }
  | { kind: 'used'; source: string; target: string }
  /** `state` is the food's state as it was handed over (a pita, stuffed or not). */
  | { kind: 'fed'; who: string; food: string; state: PropState }
  | { kind: 'surface'; id: string }
  | { kind: 'activity'; activity: Activity['kind'] };

/** What finishes a step. It counts only while the step is the current one. */
export type StepDone =
  | { tap: string }
  | { state: { prop: string; key: string; value: unknown } }
  /** Without a source, anything used on the target counts. */
  | { used: { source?: string; target: string } }
  | { fed: { who: string; food: string; state?: PropState } }
  | { surface: string }
  | { activity: Activity['kind'] };

export interface StoryStep {
  id: string;
  place: LocationId;
  /** The picture in the strip: a path under assets/art. */
  art: string;
  /** A prop def whose pointed name is written in the strip instead of the picture. */
  word?: string;
  /** The voice line. */
  line: string;
  /** What the see-through hand shows. */
  show: Invitation['show'];
  done: StepDone;
}

/**
 * A small story the guide offers: a beginning, a few steps and an end, told for three ages.
 * Nothing in it can go wrong, and the child may ignore it altogether.
 */
export interface Story {
  id: string;
  start: LocationId;
  /** Characters that must be at `start` for the story to be offered. */
  needs: readonly string[];
  /** Props put back as the place first had them when the story starts. */
  resets: readonly string[];
  openLine: string;
  doneLine: string;
  steps: Record<StoryLevel, readonly StoryStep[]>;
}

const PITA = 'falafel-falafel-pita';
const GRANDPA = 'falafel-2';
const pita = { prop: [PITA] } as const;
/** Grandpa's table on the terrace: food put there is eaten by whoever sits at it. */
const table = { surface: 'terrace-table-1' } as const;

const fill: StoryStep = {
  id: 'fill',
  place: 'falafel',
  art: 'falafel/pita-full.svg',
  line: 'story.pita.fill',
  show: { drag: { prop: ['falafel-falafel-bowl'] }, to: pita },
  done: { used: { target: PITA } },
};
const falafel: StoryStep = {
  ...fill,
  id: 'falafel',
  art: 'falafel/falafel-bowl.svg',
  done: { used: { source: 'falafel-falafel-bowl', target: PITA } },
};
const salad: StoryStep = {
  id: 'salad',
  place: 'falafel',
  art: 'falafel/salad-bowl.svg',
  line: 'story.pita.salad',
  show: { drag: { prop: ['falafel-salad-bowl'] }, to: pita },
  done: { used: { source: 'falafel-salad-bowl', target: PITA } },
};
const serve: StoryStep = {
  id: 'serve',
  place: 'falafel',
  art: 'falafel/pita-full.svg',
  line: 'story.pita.serve',
  show: { drag: pita, to: table },
  done: { fed: { who: GRANDPA, food: PITA, state: { stuffed: true } } },
};
const fridge: StoryStep = {
  id: 'fridge',
  place: 'falafel',
  art: 'falafel/drinks-fridge.svg',
  line: 'story.pita.fridge',
  show: { tap: { prop: ['falafel-drinks-fridge'] } },
  done: { state: { prop: 'falafel-drinks-fridge', key: 'open', value: true } },
};
const drink: StoryStep = {
  id: 'drink',
  place: 'falafel',
  art: 'falafel/lemonade.svg',
  word: 'lemonade',
  line: 'story.pita.drink',
  show: { drag: { prop: ['falafel-lemonade'] }, to: table },
  done: { fed: { who: GRANDPA, food: 'falafel-lemonade' } },
};

export const STORIES: readonly Story[] = [
  {
    id: 'pita',
    start: 'falafel',
    needs: [GRANDPA],
    resets: [PITA, 'falafel-drinks-fridge', 'falafel-lemonade'],
    openLine: 'story.pita.open',
    doneLine: 'story.pita.done',
    steps: {
      1: [fill, serve],
      2: [falafel, salad, serve],
      // The oldest read grandpa's order: the words stand in for the pictures.
      3: [falafel, { ...serve, word: 'falafel-pita' }, fridge, drink],
    },
  },
];
