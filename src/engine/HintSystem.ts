/** SPEC §5.2: after 20 seconds with no touch, something nearby gently invites a tap. */
export const HINT_IDLE_MS = 20_000;
/** While the child stays away, the hint comes back now and then, never in a hurry. */
export const HINT_REPEAT_MS = 15_000;

/** Decides when a hint is due. Knows nothing of the screen, so it is easy to test. */
export class HintSystem {
  private nextAt: number;

  constructor(
    now: number,
    private readonly idleMs = HINT_IDLE_MS,
    private readonly repeatMs = HINT_REPEAT_MS,
  ) {
    this.nextAt = now + idleMs;
  }

  /** Any touch starts the wait again. */
  touched(now: number): void {
    this.nextAt = now + this.idleMs;
  }

  /** True once per hint; the next one is then scheduled. */
  due(now: number): boolean {
    if (now < this.nextAt) return false;
    this.nextAt = now + this.repeatMs;
    return true;
  }
}

/** Tests may shorten the wait with `?e2e&hintMs=`. */
export function hintIdleMs(): number {
  const params = new URLSearchParams(location.search);
  const asked = params.has('e2e') ? Number(params.get('hintMs')) : NaN;
  return asked > 0 ? asked : HINT_IDLE_MS;
}
