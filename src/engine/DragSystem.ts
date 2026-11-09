export const SNAP_RADIUS = 80;
const WORLD_MARGIN = 40;

export interface Point {
  x: number;
  y: number;
}

/** A horizontal line props can rest on, such as a tabletop or a shelf. */
export interface Surface {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Fixed x positions, for example spots on a shop shelf. */
  slots?: number[];
}

/** The strip of floor props can stand on; it has depth because the room has perspective. */
export interface FloorBand {
  top: number;
  bottom: number;
}

export interface DropResult extends Point {
  surfaceId: string | null;
}

function landOn(surface: Surface, x: number): DropResult {
  if (surface.slots?.length) {
    const nearest = surface.slots.reduce((best, slot) =>
      Math.abs(slot - x) < Math.abs(best - x) ? slot : best,
    );
    return { x: nearest, y: surface.y, surfaceId: surface.id };
  }
  const clampedX = Math.min(Math.max(x, surface.x), surface.x + surface.width);
  return { x: clampedX, y: surface.y, surfaceId: surface.id };
}

function distanceTo(surface: Surface, point: Point): number {
  const clampedX = Math.min(Math.max(point.x, surface.x), surface.x + surface.width);
  return Math.hypot(point.x - clampedX, point.y - surface.y);
}

/**
 * Where a released prop comes to rest. It always lands somewhere reachable:
 * the nearest surface in snap range, otherwise whatever is below it, otherwise the floor.
 */
export function resolveDrop(
  drop: Point,
  surfaces: readonly Surface[],
  floor: FloorBand,
  worldWidth: number,
  snapRadius: number = SNAP_RADIUS,
): DropResult {
  const x = Math.min(Math.max(drop.x, WORLD_MARGIN), worldWidth - WORLD_MARGIN);
  const point = { x, y: drop.y };

  let nearest: Surface | undefined;
  let nearestDistance = snapRadius;
  for (const surface of surfaces) {
    const distance = distanceTo(surface, point);
    if (distance <= nearestDistance) {
      nearest = surface;
      nearestDistance = distance;
    }
  }
  if (nearest) return landOn(nearest, x);

  if (drop.y < floor.top) {
    const below = surfaces
      .filter((s) => s.y > drop.y && x >= s.x && x <= s.x + s.width)
      .sort((a, b) => a.y - b.y)[0];
    if (below) return landOn(below, x);
  }

  return { x, y: Math.min(Math.max(drop.y, floor.top), floor.bottom), surfaceId: null };
}
