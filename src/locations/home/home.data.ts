import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'home';
/** Each room is one 1100-unit background tile. Right to left: kitchen, living room, kids' room. */
const ROOM = 1100;
const KIDS = 0;
const LIVING = ROOM;
const KITCHEN = ROOM * 2;
const WALL_FEET = 480;

function prop(id: string, x: number, y: number, on?: string): PropInstance {
  return { id, defId: id, location: LOCATION, x, y, ...(on ? { on } : {}) };
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
  container?: Surface['container'],
  pose?: Surface['pose'],
): Surface {
  const left = feetX - art.width / 2;
  return {
    id,
    x: left + from,
    y: feetY - art.height + top,
    width: to - from,
    ...(container ? { container } : {}),
    ...(pose ? { pose } : {}),
  };
}

// Kitchen.
const FRIDGE_X = KITCHEN + 980;
const FRIDGE = { width: 200, height: 330 };
const fridgeOpen = { prop: 'fridge', key: 'open' };
// The table stands by the fridge, so food goes straight from one to the other.
const TABLE_X = KITCHEN + 715;
const TABLE_FEET = 490;
const CHAIR_X = KITCHEN + 775;
const STOVE_X = KITCHEN + 420;
// In front of the tiled backsplash.
const SINK_X = KITCHEN + 155;
// On the counter, left of the sink.
const BOWL_X = SINK_X - 80;
const BOWL_FEET = WALL_FEET - 220 + 82;

// Living room.
const CABINET_X = LIVING + 230;
const AQUARIUM_X = LIVING + 470;
const SOFA_X = LIVING + 780;
const WALL_SHELF_X = LIVING + 740;
const WALL_SHELF_FEET = 240;

// Kids' room.
const WARDROBE_X = KIDS + 160;
const WARDROBE = { width: 220, height: 340 };
const KIDS_SHELF_X = KIDS + 450;
const BED_X = KIDS + 820;

const surfaces: Surface[] = [
  across('fridge-1', FRIDGE_X, WALL_FEET, FRIDGE, 120, 50, 185, fridgeOpen),
  across('fridge-2', FRIDGE_X, WALL_FEET, FRIDGE, 200, 50, 185, fridgeOpen),
  across('fridge-3', FRIDGE_X, WALL_FEET, FRIDGE, 280, 50, 185, fridgeOpen),
  across('stove', STOVE_X, WALL_FEET, { width: 220, height: 250 }, 40, 20, 200),
  // The counter starts right of the fruit bowl, so a drop over the bowl lands in it.
  across('counter', SINK_X, WALL_FEET, { width: 300, height: 220 }, 82, 175, 290),
  across('table', TABLE_X, TABLE_FEET, { width: 320, height: 160 }, 12, 15, 305),
  // Food put in the fruit bowl is counted aloud.
  { ...across('fruit-bowl', BOWL_X, BOWL_FEET, { width: 150, height: 60 }, 22, 22, 128), counts: true },
  { ...across('chair', CHAIR_X, 550, { width: 110, height: 190 }, 100, 10, 100, undefined, 'sit'), activity: { kind: 'eat', table: 'table' } },

  across('tv-cabinet', CABINET_X, WALL_FEET, { width: 260, height: 110 }, 8, 10, 250),
  {
    ...across('sofa', SOFA_X, WALL_FEET, { width: 380, height: 190 }, 95, 40, 340, undefined, 'sit'),
    activity: { kind: 'watch', prop: 'tv', key: 'on' },
  },
  across('living-shelf', WALL_SHELF_X, WALL_SHELF_FEET, { width: 260, height: 44 }, 4, 10, 250),

  across('wardrobe', WARDROBE_X, WALL_FEET, WARDROBE, 250, 30, 190, {
    prop: 'wardrobe',
    key: 'open',
  }),
  across('kids-shelf', KIDS_SHELF_X, WALL_SHELF_FEET, { width: 260, height: 44 }, 4, 10, 250),
  { ...across('bed', BED_X, 490, { width: 360, height: 170 }, 60, 20, 300, undefined, 'lie'), activity: { kind: 'sleep' } },
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

function on(id: string, defId: string, x: number, surface: string): PropInstance {
  return { ...prop(defId, x, surfaceY(surface), surface), id };
}

export const home: LocationData = {
  id: LOCATION,
  width: ROOM * 3,
  background: ['home/kids-bg.svg', 'home/living-bg.svg', 'home/kitchen-bg.svg'],
  floor: { top: 440, bottom: 570 },
  // Someone in bed turns the kids' room down for the night.
  dim: { surface: 'bed', x: KIDS, width: ROOM },
  surfaces,
  props: [
    // Kitchen.
    prop('fridge', FRIDGE_X, WALL_FEET),
    prop('stove', STOVE_X, WALL_FEET),
    { ...prop('sink', SINK_X, WALL_FEET), id: 'kitchen-sink' },
    { ...prop('table', TABLE_X, TABLE_FEET), id: 'kitchen-table' },
    prop('chair', CHAIR_X, 550),
    on('milk', 'milk', FRIDGE_X - 10, 'fridge-2'),
    on('cake', 'cake', FRIDGE_X, 'fridge-1'),
    on('apple', 'apple', FRIDGE_X + 20, 'fridge-3'),
    on('pot', 'pot', SINK_X + 100, 'counter'),
    prop('fruit-bowl', BOWL_X, BOWL_FEET),
    on('cup', 'cup', TABLE_X - 100, 'table'),
    on('plate', 'plate', TABLE_X, 'table'),
    on('bread', 'bread', TABLE_X + 100, 'table'),

    // Living room.
    prop('tv-cabinet', CABINET_X, WALL_FEET),
    { ...prop('tv', CABINET_X, surfaceY('tv-cabinet')), on: 'tv-cabinet' },
    prop('aquarium', AQUARIUM_X, WALL_FEET),
    prop('sofa', SOFA_X, WALL_FEET),
    { ...prop('shelf', WALL_SHELF_X, WALL_SHELF_FEET), id: 'living-shelf' },
    prop('lamp', LIVING + 1030, WALL_FEET),
    on('cat', 'cat', SOFA_X + 90, 'sofa'),
    on('candles', 'candles', WALL_SHELF_X, 'living-shelf'),
    prop('plant', LIVING + 50, 500),

    // Kids' room.
    prop('wardrobe', WARDROBE_X, WALL_FEET),
    // Exactly over the crescent in kids-bg.svg's night window.
    prop('moon', KIDS + 856, 142),
    { ...prop('shelf', KIDS_SHELF_X, WALL_SHELF_FEET), id: 'kids-shelf' },
    prop('bed', BED_X, 490),
    on('book', 'book', KIDS_SHELF_X, 'kids-shelf'),
    on('teddy', 'teddy', BED_X + 90, 'bed'),
    on('hippo', 'hippo', WARDROBE_X, 'wardrobe'),
    prop('ball', KIDS + 420, 540),
    prop('train', KIDS + 560, 520),
    // Tapping it puts coins in the purse for the shop.
    prop('piggy', KIDS + 300, 520),
  ],
};
