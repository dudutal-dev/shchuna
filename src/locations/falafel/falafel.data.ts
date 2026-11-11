import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'falafel';
/** Two 1100-unit background tiles. Right to left: inside the stand, then the terrace. */
const PART = 1100;
const TERRACE = 0;
const KITCHEN = PART;
const WALL_FEET = 480;

/** Instance ids are prefixed, so they never clash with another place's. */
function prop(defId: string, x: number, y: number, on?: string, id = `falafel-${defId}`): PropInstance {
  return { id, defId, location: LOCATION, x, y, ...(on ? { on } : {}) };
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

// Inside.
const COUNTER_X = KITCHEN + 380;
const COUNTER_FEET = 510;
const COUNTER = { width: 380, height: 170 };
const FRYER_X = KITCHEN + 680;
const FRIDGE_X = KITCHEN + 1000;
const FRIDGE = { width: 170, height: 310 };

// The terrace: two tables, each with a stool either side.
const TABLES = [TERRACE + 350, TERRACE + 800];
const TABLE_FEET = 530;
const TABLE = { width: 260, height: 330 };
const STOOL_FEET = 545;
const STOOL = { width: 90, height: 110 };
const STOOLS = TABLES.flatMap((x) => [x - 120, x + 120]);

const fridgeOpen = { prop: 'falafel-drinks-fridge', key: 'open' };

const surfaces: Surface[] = [
  across('falafel-counter', COUNTER_X, COUNTER_FEET, COUNTER, 10, 20, 360),
  across('drinks-1', FRIDGE_X, WALL_FEET, FRIDGE, 120, 20, 150, { container: fridgeOpen }),
  across('drinks-2', FRIDGE_X, WALL_FEET, FRIDGE, 200, 20, 150, { container: fridgeOpen }),
  ...TABLES.map((x, i) => across(`terrace-table-${i + 1}`, x, TABLE_FEET, TABLE, 240, 70, 190)),
  ...STOOLS.map((x, i) => ({
    ...across(`stool-${i + 1}`, x, STOOL_FEET, STOOL, 15, 5, 85, { pose: 'sit' }),
    // Two stools to a table.
    activity: { kind: 'eat' as const, table: `terrace-table-${Math.floor(i / 2) + 1}` },
  })),
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

/** Where the customer sits, on the stool to the right of the first table. */
export const CUSTOMER_SEAT = { x: STOOLS[1]!, y: surfaceY('stool-2'), on: 'stool-2' };

function on(defId: string, x: number, surface: string): PropInstance {
  return prop(defId, x, surfaceY(surface), surface);
}

export const falafel: LocationData = {
  id: LOCATION,
  width: PART * 2,
  background: ['falafel/terrace-bg.svg', 'falafel/kitchen-bg.svg'],
  floor: { top: 440, bottom: 570 },
  surfaces,
  props: [
    // Inside.
    prop('falafel-counter', COUNTER_X, COUNTER_FEET),
    prop('fryer', FRYER_X, WALL_FEET),
    prop('drinks-fridge', FRIDGE_X, WALL_FEET),
    on('tahini', COUNTER_X - 150, 'falafel-counter'),
    on('falafel-pita', COUNTER_X - 70, 'falafel-counter'),
    on('falafel-bowl', COUNTER_X + 60, 'falafel-counter'),
    on('salad-bowl', COUNTER_X + 150, 'falafel-counter'),
    on('lemonade', FRIDGE_X - 30, 'drinks-1'),
    on('juice', FRIDGE_X + 30, 'drinks-2'),

    // The terrace.
    ...TABLES.map((x, i) => prop('umbrella-table', x, TABLE_FEET, undefined, `falafel-table-${i + 1}`)),
    ...STOOLS.map((x, i) => prop('stool', x, STOOL_FEET, undefined, `falafel-stool-${i + 1}`)),
  ],
};
