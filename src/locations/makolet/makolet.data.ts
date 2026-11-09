import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'makolet';
const ROOM = 1100;
const WALL_FEET = 480;

// Shelves (the right half, seen first).
const SHELF = { width: 380, height: 330 };
const PLANKS = [110, 200, 290];
// The shelves-bg window (x 452–648 of the tile) shows in the gap between the two units.
const UNIT_A = 1360;
const UNIT_B = 1940;
const FREEZER_X = 1035;

// Checkout (the left half).
const COUNTER_X = 600;
const COUNTER_FEET = 520;
const COUNTER = { width: 560, height: 210 };
const COUNTER_TOP = COUNTER_FEET - COUNTER.height + 40;
const COUNTER_LEFT = COUNTER_X - COUNTER.width / 2;

/** Fixed product spots along a plank, so the shop always looks tidy. */
function planks(unit: string, centreX: number): Surface[] {
  const left = centreX - SHELF.width / 2;
  const slots = [60, 150, 240, 320].map((offset) => left + offset);
  return PLANKS.map((plank, index) => ({
    id: `${unit}-${index + 1}`,
    x: left + 20,
    y: WALL_FEET - SHELF.height + plank,
    width: 340,
    slots,
  }));
}

const surfaces: Surface[] = [
  ...planks('shelf-a', UNIT_A),
  ...planks('shelf-b', UNIT_B),
  { id: 'freezer', x: FREEZER_X - 110, y: WALL_FEET - 150 + 30, width: 220 },
  // The conveyor belt: what lands here is being bought.
  { id: 'belt', x: COUNTER_LEFT + 120, y: COUNTER_TOP, width: 210 },
  { id: 'counter-end', x: COUNTER_LEFT + 350, y: COUNTER_TOP, width: 60 },
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

function product(defId: string, x: number, surface: string): PropInstance {
  return { id: `mk-${defId}`, defId, location: LOCATION, x, y: surfaceY(surface), on: surface };
}

function fixture(id: string, defId: string, x: number, y: number): PropInstance {
  return { id, defId, location: LOCATION, x, y };
}

const slotsA = [60, 150, 240, 320].map((offset) => UNIT_A - SHELF.width / 2 + offset);
const slotsB = [60, 150, 240, 320].map((offset) => UNIT_B - SHELF.width / 2 + offset);

export const BELT = 'belt';
export const TRAY_ID = 'mk-tray';
export const BAG_ID = 'mk-bag';
/** Where the cashier stands, behind the counter. */
export const CASHIER = { x: COUNTER_X + 40, y: COUNTER_TOP + 120 };
/** Where the shop name is painted on the sign in the background art. */
export const SIGN = { x: 550, y: 66 };

export const makolet: LocationData = {
  id: LOCATION,
  width: ROOM * 2,
  background: ['makolet/checkout-bg.svg', 'makolet/shelves-bg.svg'],
  // Shallower than at home: the coin strip covers the bottom of the screen here.
  floor: { top: 440, bottom: 515 },
  surfaces,
  props: [
    fixture('mk-shelf-a', 'shelf-unit', UNIT_A, WALL_FEET),
    fixture('mk-shelf-b', 'shelf-unit', UNIT_B, WALL_FEET),
    fixture('mk-freezer', 'freezer', FREEZER_X, WALL_FEET),
    fixture('mk-counter', 'counter', COUNTER_X, COUNTER_FEET),
    fixture('mk-register', 'register', COUNTER_LEFT + 470, COUNTER_TOP),
    fixture(TRAY_ID, 'tray', COUNTER_LEFT + 380, COUNTER_TOP),
    fixture(BAG_ID, 'bag', COUNTER_LEFT + 60, COUNTER_TOP),

    product('milk', slotsB[0]!, 'shelf-b-1'),
    product('choco', slotsB[1]!, 'shelf-b-1'),
    product('eggs', slotsB[2]!, 'shelf-b-1'),
    product('cheese', slotsB[3]!, 'shelf-b-1'),
    product('hummus', slotsB[0]!, 'shelf-b-2'),
    product('olives', slotsB[1]!, 'shelf-b-2'),
    product('pita', slotsB[2]!, 'shelf-b-2'),
    product('bread', slotsB[3]!, 'shelf-b-2'),
    product('apple', slotsA[0]!, 'shelf-a-1'),
    product('banana', slotsA[1]!, 'shelf-a-1'),
    product('tomato', slotsA[2]!, 'shelf-a-1'),
    product('snack', slotsA[3]!, 'shelf-a-1'),
    // Tall things go on top shelves; lower planks have about 74 units of headroom.
    product('cucumber', slotsA[1]!, 'shelf-a-2'),
    product('icecream', FREEZER_X, 'freezer'),
    // Too big for a shelf: it sits on the floor by the shelves.
    fixture('mk-watermelon', 'watermelon', 1650, 505),
  ],
};
