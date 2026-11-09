import type { PropChange } from '../app/actions';
import type { PropDef, PropInstance } from '../types';
import type { Point } from './DragSystem';

export const LONG_PRESS_MS = 500;
export const DRAG_THRESHOLD_PX = 12;
export const USE_ON_RADIUS = 110;

/** Tells a tap, a long press and a drag apart for one pointer. Screen coordinates. */
export class GestureTracker {
  private start: Point = { x: 0, y: 0 };
  private downAt = 0;
  private dragging = false;
  private longPressed = false;

  down(x: number, y: number, now: number): void {
    this.start = { x, y };
    this.downAt = now;
    this.dragging = false;
    this.longPressed = false;
  }

  /** True on the single move that turns this press into a drag. */
  move(x: number, y: number): boolean {
    if (this.dragging) return false;
    if (Math.hypot(x - this.start.x, y - this.start.y) < DRAG_THRESHOLD_PX) return false;
    this.dragging = true;
    return true;
  }

  /** True on the single tick that turns this press into a long press. */
  tick(now: number): boolean {
    if (this.dragging || this.longPressed || now - this.downAt < LONG_PRESS_MS) return false;
    this.longPressed = true;
    return true;
  }

  /** True when the release completes a plain tap. */
  up(): boolean {
    return !this.dragging && !this.longPressed;
  }
}

/** What tapping this prop changes, if anything. */
export function resolveTap(def: PropDef, instance: PropInstance): PropChange | null {
  for (const interaction of def.interactions) {
    if (interaction.type === 'toggle') {
      const { key } = interaction;
      return { id: instance.id, state: { [key]: !instance.state?.[key] } };
    }
    if (interaction.type === 'tap') return { id: instance.id, state: interaction.set };
  }
  return null;
}

/** State changes from dropping `source` at `at` next to a prop it can be used on. */
export function resolveUseOn(
  source: PropInstance,
  at: Point,
  defs: Readonly<Record<string, PropDef>>,
  instances: readonly PropInstance[],
): PropChange[] {
  const def = defs[source.defId];
  if (!def) return [];
  let best: PropChange[] = [];
  let bestDistance = USE_ON_RADIUS;
  for (const interaction of def.interactions) {
    if (interaction.type !== 'useOn') continue;
    for (const other of instances) {
      if (other.id === source.id || other.defId !== interaction.target) continue;
      if (other.location !== source.location) continue;
      const point = defs[other.defId]?.useOnPoint ?? { x: 0, y: 0 };
      const distance = Math.hypot(other.x + point.x - at.x, other.y + point.y - at.y);
      if (distance > bestDistance) continue;
      bestDistance = distance;
      best = [];
      if (interaction.setSource) best.push({ id: source.id, state: interaction.setSource });
      if (interaction.setTarget) best.push({ id: other.id, state: interaction.setTarget });
    }
  }
  return best;
}

/** The art to show for a prop in its current state. */
export function artFor(def: PropDef, instance: PropInstance): string {
  const state = instance.state ?? {};
  const match = def.artStates?.find(({ when }) =>
    Object.entries(when).every(([key, value]) => state[key] === value),
  );
  return match?.art ?? def.art;
}
