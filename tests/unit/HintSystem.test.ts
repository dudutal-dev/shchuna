import { describe, expect, it } from 'vitest';
import { HINT_IDLE_MS, HINT_REPEAT_MS, HintSystem } from '../../src/engine/HintSystem';

describe('HintSystem', () => {
  it('waits 20 seconds of quiet before the first hint (SPEC §5.2)', () => {
    expect(HINT_IDLE_MS).toBe(20_000);
    const hints = new HintSystem(0);
    expect(hints.due(19_999)).toBe(false);
    expect(hints.due(20_000)).toBe(true);
  });

  it('gives one hint at a time, then repeats slowly while still quiet', () => {
    const hints = new HintSystem(0);
    expect(hints.due(20_000)).toBe(true);
    expect(hints.due(20_001)).toBe(false);
    expect(hints.due(20_000 + HINT_REPEAT_MS)).toBe(true);
  });

  it('starts the wait again on every touch', () => {
    const hints = new HintSystem(0);
    hints.touched(15_000);
    expect(hints.due(30_000)).toBe(false);
    expect(hints.due(35_000)).toBe(true);
  });
});
