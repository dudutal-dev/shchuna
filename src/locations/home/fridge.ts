import type { PropInstance } from '../../types';
import { home } from './home.data';

const SHELVES = ['fridge-1', 'fridge-2', 'fridge-3'];
/** About the width of a carton or a loaf, so things don't pile on top of each other. */
const SLOT_WIDTH = 65;
/** Where things go once the fridge is full: the kitchen floor in front of it. */
const OVERFLOW = { x: 3020, y: 545, step: 40 };

/** Free spots in the home fridge, top shelf first, given what is already there. */
export function fridgeSpots(
  props: readonly PropInstance[],
  count: number,
): Array<{ x: number; y: number; on?: string }> {
  const spots: Array<{ x: number; y: number; on?: string }> = [];
  for (const id of SHELVES) {
    const shelf = home.surfaces.find((s) => s.id === id);
    if (!shelf) continue;
    const slots = Math.floor(shelf.width / SLOT_WIDTH);
    for (let i = 0; i < slots; i++) {
      const x = shelf.x + SLOT_WIDTH / 2 + i * SLOT_WIDTH;
      const taken = props.some(
        (p) => p.location === 'home' && p.on === id && Math.abs(p.x - x) < SLOT_WIDTH / 2,
      );
      if (!taken && spots.length < count) spots.push({ x, y: shelf.y, on: id });
    }
  }
  for (let i = 0; spots.length < count; i++) {
    spots.push({ x: OVERFLOW.x - i * OVERFLOW.step, y: OVERFLOW.y });
  }
  return spots;
}
