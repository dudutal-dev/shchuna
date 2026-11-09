import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'playground';

function prop(id: string, defId: string, x: number, y: number): PropInstance {
  return { id, defId, location: LOCATION, x, y };
}

/** Exercises every engine system. Opens at its right end, so the sink starts off-screen. */
export const playground: LocationData = {
  id: LOCATION,
  width: 1500,
  background: 'playground/room.svg',
  floor: { top: 440, bottom: 570 },
  surfaces: [
    { id: 'table', x: 915, y: 322, width: 270 },
    { id: 'shelf', x: 590, y: 200, width: 230 },
    { id: 'sink', x: 110, y: 342, width: 260 },
  ],
  props: [
    prop('table', 'table', 1050, 470),
    prop('shelf', 'shelf', 705, 240),
    prop('sink', 'sink', 240, 480),
    prop('lamp', 'lamp', 1400, 480),
    prop('apple', 'apple', 1000, 322),
    prop('ball', 'ball', 1270, 530),
    prop('cup', 'cup', 800, 520),
  ],
};
