import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'station';
/** Two 1100-unit background tiles. Right to left: the bus stop, then the road. */
const PART = 1100;
const ROAD = 0;
const STOP = PART;

/** Instance ids are prefixed, so they never clash with another place's. */
function prop(defId: string, x: number, y: number, on?: string): PropInstance {
  return { id: `station-${defId}`, defId, location: LOCATION, x, y, ...(on ? { on } : {}) };
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

// The stop.
const SHELTER_X = STOP + 700;
const SHELTER_FEET = 500;
const SHELTER = { width: 380, height: 300 };
const SIGN_X = STOP + 420;

// The road.
const BUS_X = ROAD + 650;
const BUS_FEET = 560;
const LIGHT_X = ROAD + 1050;

const surfaces: Surface[] = [
  across('shelter-bench', SHELTER_X, SHELTER_FEET, SHELTER, 200, 60, 320, { pose: 'sit' }),
  // Passengers sit in the bus's windows; when the doors close, off it goes with them.
  {
    ...across('bus-seats', BUS_X, BUS_FEET, { width: 540, height: 300 }, 175, 70, 470, {
      pose: 'sit',
      container: { prop: 'station-bus', key: 'open' },
    }),
    activity: { kind: 'ride', prop: 'station-bus' },
  },
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

/** Where the traveller waits, on the shelter's bench. */
export const TRAVELLER_SEAT = { x: SHELTER_X - 50, y: surfaceY('shelter-bench'), on: 'shelter-bench' };

export const station: LocationData = {
  id: LOCATION,
  width: PART * 2,
  background: ['station/road-bg.svg', 'station/stop-bg.svg'],
  floor: { top: 440, bottom: 570 },
  surfaces,
  props: [
    // The stop.
    prop('bus-shelter', SHELTER_X, SHELTER_FEET),
    prop('bus-sign', SIGN_X, SHELTER_FEET),
    prop('ticket', SHELTER_X + 90, surfaceY('shelter-bench'), 'shelter-bench'),
    prop('suitcase', STOP + 300, 545),
    prop('backpack', STOP + 960, 545),

    // The road.
    prop('bus', BUS_X, BUS_FEET),
    prop('traffic-light', LIGHT_X, 520),
    // Clear of the undo and family buttons at the left end of the road.
    prop('car', ROAD + 240, 566),
  ],
};
