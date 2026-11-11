import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'gan';
/** Two 1100-unit background tiles. Right to left: the classroom, then the yard outside. */
const PART = 1100;
const YARD = 0;
const CLASS = PART;
const WALL_FEET = 480;

/** Instance ids are prefixed, so they never clash with the home's (its ball, its table). */
function prop(defId: string, x: number, y: number, on?: string): PropInstance {
  return { id: `gan-${defId}`, defId, location: LOCATION, x, y, ...(on ? { on } : {}) };
}

/** A surface across part of a piece of furniture, from art-space measurements. */
function across(
  id: string,
  feetX: number,
  feetY: number,
  art: { width: number; height: number },
  top: number,
  from: number,
  to: number,
  extra: Pick<Surface, 'container' | 'pose'> = {},
): Surface {
  const left = feetX - art.width / 2;
  return { id, x: left + from, y: feetY - art.height + top, width: to - from, ...extra };
}

// Classroom.
const THEATER_X = CLASS + 870;
const THEATER = { width: 260, height: 300 };
const EASEL_X = CLASS + 580;
const CUBBY_X = CLASS + 250;
const CUBBY = { width: 300, height: 200 };
const TABLE_X = CLASS + 430;
const TABLE_FEET = 560;
const CHAIR_X = CLASS + 300;

// Yard.
const SANDBOX_X = YARD + 200;
const SANDBOX_FEET = 560;
const SANDBOX = { width: 320, height: 110 };
const SLIDE_X = YARD + 470;
const SLIDE = { width: 320, height: 260 };
const SWING_X = YARD + 820;
const SWING = { width: 240, height: 300 };
const YARD_FEET = 520;

const surfaces: Surface[] = [
  // The puppets wait on the stage, seen only once the curtains open.
  across('theater-stage', THEATER_X, WALL_FEET, THEATER, 190, 40, 220, {
    container: { prop: 'gan-puppet-theater', key: 'open' },
  }),
  across('cubby', CUBBY_X, WALL_FEET, CUBBY, 6, 10, 290),
  across('gan-table', TABLE_X, TABLE_FEET, { width: 320, height: 160 }, 12, 15, 305),
  across('gan-chair', CHAIR_X, 570, { width: 110, height: 190 }, 100, 10, 100, { pose: 'sit' }),

  across('sandbox', SANDBOX_X, SANDBOX_FEET, SANDBOX, 40, 30, 290),
  across('slide-top', SLIDE_X, YARD_FEET, SLIDE, 70, 190, 290, { pose: 'sit' }),
  across('swing-seat', SWING_X, YARD_FEET, SWING, 220, 80, 160, { pose: 'sit' }),
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

function on(defId: string, x: number, surface: string): PropInstance {
  return prop(defId, x, surfaceY(surface), surface);
}

export const gan: LocationData = {
  id: LOCATION,
  width: PART * 2,
  background: ['gan/yard-bg.svg', 'gan/classroom-bg.svg'],
  floor: { top: 440, bottom: 570 },
  surfaces,
  props: [
    // Classroom.
    prop('puppet-theater', THEATER_X, WALL_FEET),
    prop('easel', EASEL_X, 500),
    prop('cubby', CUBBY_X, WALL_FEET),
    { ...prop('table', TABLE_X, TABLE_FEET), id: 'gan-table' },
    prop('chair', CHAIR_X, 570),
    on('peacock', THEATER_X, 'theater-stage'),
    on('monkey', CUBBY_X + 60, 'cubby'),
    prop('elephant', CLASS + 730, 520),
    prop('blocks', CLASS + 610, 555),

    // Yard.
    prop('sandbox', SANDBOX_X, SANDBOX_FEET),
    prop('slide', SLIDE_X, YARD_FEET),
    prop('swing', SWING_X, YARD_FEET),
    on('bucket', SANDBOX_X - 60, 'sandbox'),
    on('spade', SANDBOX_X + 50, 'sandbox'),
    prop('tricycle', YARD + 650, 560),
    prop('ball', YARD + 1000, 545),
  ],
};
