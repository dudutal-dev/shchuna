/** When wishes come: the first after a while in a place, then now and then, each for a while. */
export interface WishTiming {
  first: number;
  every: number;
  lasts: number;
}

const DEFAULT: WishTiming = { first: 25_000, every: 40_000, lasts: 30_000 };

/** Tests can speed wishes up with `?e2e&wishMs=`. */
export function wishTiming(): WishTiming {
  const params = new URLSearchParams(location.search);
  if (!params.has('e2e')) return DEFAULT;
  // In tests, wishes come only in the tests that ask for them.
  const asked = Number(params.get('wishMs'));
  return asked > 0 ? { first: asked, every: asked * 2, lasts: 60_000 } : { ...DEFAULT, first: Infinity };
}
