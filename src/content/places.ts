import type { LocationId } from '../types.ts';

/** Places in the neighbourhood: its map, and the subscription flag for later (SPEC §13). */
export interface PlaceInfo {
  id: Exclude<LocationId, 'playground'>;
  /** Voice line for the place's name, said when it is tapped on the map. */
  line: string;
  art: string;
  /** Where it stands on the map, in map units (1200 × 600), by its feet. */
  x: number;
  y: number;
}

/** Map size in map units. The map scales to fit the screen. */
export const MAP_WIDTH = 1200;
export const MAP_HEIGHT = 600;

// Right to left, the way a Hebrew reader walks the street: home first.
export const PLACES: readonly PlaceInfo[] = [
  { id: 'home', line: 'place.home', art: 'map/home.svg', x: 1040, y: 280 },
  { id: 'makolet', line: 'place.makolet', art: 'map/makolet.svg', x: 760, y: 280 },
  { id: 'gan', line: 'place.gan', art: 'map/gan.svg', x: 480, y: 260 },
  { id: 'clinic', line: 'place.clinic', art: 'map/clinic.svg', x: 200, y: 280 },
  { id: 'falafel', line: 'place.falafel', art: 'map/falafel.svg', x: 960, y: 560 },
  { id: 'station', line: 'place.station', art: 'map/station.svg', x: 640, y: 560 },
  { id: 'beach', line: 'place.beach', art: 'map/beach.svg', x: 290, y: 560 },
];

/** Places built so far. The others stay under a cloud. */
const BUILT: ReadonlySet<LocationId> = new Set(['home', 'makolet', 'gan', 'clinic']);

/** Paid places, once there is a subscription (SPEC §13). Nothing is paid in phase 0. */
export function isPremium(id: LocationId): boolean {
  void id;
  return false;
}

/** A place a child can go into now: built, unlocked in the save, and not behind a subscription. */
export function isOpen(id: LocationId, unlocked: readonly LocationId[], premium = false): boolean {
  return BUILT.has(id) && unlocked.includes(id) && (premium || !isPremium(id));
}
