import type { Surface } from '../../engine/DragSystem';
import type { LocationData } from '../../engine/Scene';
import type { PropInstance } from '../../types';

const LOCATION = 'clinic';
/** Two 1100-unit background tiles. Right to left: the waiting room, then the doctor's room. */
const PART = 1100;
const EXAM = 0;
const WAITING = PART;

/** Instance ids are prefixed, so they never clash with another place's. */
function prop(defId: string, x: number, y: number, on?: string): PropInstance {
  return { id: `clinic-${defId}`, defId, location: LOCATION, x, y, ...(on ? { on } : {}) };
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

// Waiting room.
const COOLER_X = WAITING + 90;
const BENCH_X = WAITING + 330;
const BENCH_FEET = 520;
const BENCH = { width: 340, height: 120 };
const TOY_BOX_X = WAITING + 610;
const TOY_BOX_FEET = 530;
const DESK_X = WAITING + 880;
const DESK_FEET = 500;
const DESK = { width: 320, height: 150 };

// Doctor's room.
const SCALE_X = EXAM + 80;
const CABINET_X = EXAM + 330;
const CABINET_FEET = 330;
const CABINET = { width: 180, height: 220 };
const TABLE_X = EXAM + 330;
const TABLE_FEET = 540;
const BED_X = EXAM + 760;
const BED_FEET = 520;
const BED = { width: 340, height: 150 };

const cabinetOpen = { prop: 'clinic-cabinet', key: 'open' };

const surfaces: Surface[] = [
  across('reception', DESK_X, DESK_FEET, DESK, 8, 20, 300),
  across('bench', BENCH_X, BENCH_FEET, BENCH, 50, 20, 320, { pose: 'sit' }),
  across('toy-box', TOY_BOX_X, TOY_BOX_FEET, { width: 160, height: 100 }, 6, 10, 150),

  across('cabinet-1', CABINET_X, CABINET_FEET, CABINET, 80, 20, 160, { container: cabinetOpen }),
  across('cabinet-2', CABINET_X, CABINET_FEET, CABINET, 150, 20, 160, { container: cabinetOpen }),
  across('clinic-desk', TABLE_X, TABLE_FEET, { width: 320, height: 160 }, 12, 15, 305),
  across('exam-bed', BED_X, BED_FEET, BED, 60, 30, 310, { pose: 'lie' }),
];

function surfaceY(id: string): number {
  const surface = surfaces.find((s) => s.id === id);
  if (!surface) throw new Error(`No surface ${id}`);
  return surface.y;
}

/** Where a character sits on the bench. */
export const BENCH_SEAT = { x: BENCH_X + 60, y: surfaceY('bench') };

function on(defId: string, x: number, surface: string): PropInstance {
  return prop(defId, x, surfaceY(surface), surface);
}

export const clinic: LocationData = {
  id: LOCATION,
  width: PART * 2,
  background: ['clinic/exam-bg.svg', 'clinic/waiting-bg.svg'],
  floor: { top: 440, bottom: 570 },
  surfaces,
  props: [
    // Waiting room.
    prop('water-cooler', COOLER_X, 500),
    prop('bench', BENCH_X, BENCH_FEET),
    prop('toy-box', TOY_BOX_X, TOY_BOX_FEET),
    prop('reception-desk', DESK_X, DESK_FEET),
    on('bell', DESK_X + 70, 'reception'),
    on('cup', DESK_X - 80, 'reception'),
    on('teddy', TOY_BOX_X, 'toy-box'),

    // Doctor's room.
    prop('doctor-scale', SCALE_X, 520),
    prop('cabinet', CABINET_X, CABINET_FEET),
    { ...prop('table', TABLE_X, TABLE_FEET), id: 'clinic-desk-table' },
    prop('exam-bed', BED_X, BED_FEET),
    prop('light-box', BED_X, 300),
    on('computer', TABLE_X - 70, 'clinic-desk'),
    on('stethoscope', TABLE_X + 80, 'clinic-desk'),
    on('bandage', CABINET_X - 30, 'cabinet-1'),
    on('thermometer', CABINET_X - 30, 'cabinet-2'),
    on('medicine', CABINET_X + 35, 'cabinet-2'),
    prop('doctor-bag', EXAM + 570, 555),
  ],
};
