import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'beach';
/** Two 1100-unit background tiles. Right to left: the sand, then the water's edge. */
const PART = 1100;
const SHORE = 0;
const SAND = PART;

/** Instance ids are prefixed, so they never clash with another place's. */
function prop(defId: string, x: number, y: number, on?: string): PropInstance {
  return { id: `beach-${defId}`, defId, location: LOCATION, x, y, ...(on ? { on } : {}) };
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

// The sand.
const UMBRELLA_X = SAND + 260;
const CHAIR_X = SAND + 200;
const CHAIR_FEET = 545;
const TOWEL_X = SAND + 520;
const TOWEL_FEET = 560;
const MOUND_X = SAND + 800;
const COOLER_X = SAND + 990;
const COOLER_FEET = 550;
/** The sun hangs in the sky above the sea. */
const SUN_X = SAND + 700;
const SUN_FEET = 240;

// The water's edge.
const TOWER_X = SHORE + 250;
const TOWER_FEET = 520;
const TOWER = { width: 240, height: 360 };

const coolerOpen = { prop: 'beach-cooler', key: 'open' };

const surfaces: Surface[] = [
  across('beach-chair', CHAIR_X, CHAIR_FEET, { width: 170, height: 120 }, 45, 20, 150, { pose: 'sit' }),
  across('towel', TOWEL_X, TOWEL_FEET, { width: 230, height: 30 }, 6, 10, 220, { pose: 'lie' }),
  // Measured on the open cool box, the only time anything goes in.
  across('cooler-inside', COOLER_X, COOLER_FEET, { width: 150, height: 130 }, 70, 20, 130, {
    container: coolerOpen,
  }),
  across('tower-seat', TOWER_X, TOWER_FEET, TOWER, 120, 60, 180, { pose: 'sit' }),
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

/** Where the lifeguard sits, up on the tower. */
export const LIFEGUARD_SEAT = { x: TOWER_X, y: surfaceY('tower-seat'), on: 'tower-seat' };

function on(defId: string, x: number, surface: string, id?: string): PropInstance {
  return { ...prop(defId, x, surfaceY(surface), surface), ...(id ? { id } : {}) };
}

export const beach: LocationData = {
  id: LOCATION,
  width: PART * 2,
  background: ['beach/shore-bg.svg', 'beach/sand-bg.svg'],
  floor: { top: 440, bottom: 570 },
  surfaces,
  props: [
    // The sand.
    prop('sun', SUN_X, SUN_FEET),
    prop('umbrella', UMBRELLA_X, 520),
    prop('beach-chair', CHAIR_X, CHAIR_FEET),
    prop('towel', TOWEL_X, TOWEL_FEET),
    prop('sand-mound', MOUND_X, 550),
    prop('cooler', COOLER_X, COOLER_FEET),
    on('ice-pop', COOLER_X - 25, 'cooler-inside', 'beach-ice-pop-1'),
    on('ice-pop', COOLER_X + 25, 'cooler-inside', 'beach-ice-pop-2'),
    prop('bucket', SAND + 920, 562),
    prop('matkot', SAND + 690, 566),

    // The water's edge.
    prop('lifeguard-tower', TOWER_X, TOWER_FEET),
    prop('turtle', SHORE + 620, 548),
    prop('shell', SHORE + 820, 562),
    prop('ball', SHORE + 960, 552),
  ],
};
