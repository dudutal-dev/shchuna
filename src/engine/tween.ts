import { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;

export const easeOutQuad: Ease = (t) => 1 - (1 - t) * (1 - t);
export const easeOutBack: Ease = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export const easeOutElastic: Ease = (t) =>
  t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;

interface Tween {
  target: Record<string, number>;
  from: Record<string, number>;
  to: Record<string, number>;
  elapsed: number;
  duration: number;
  ease: Ease;
  onDone?: () => void;
}

const active = new Set<Tween>();
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function step(ticker: Ticker): void {
  for (const tween of active) {
    tween.elapsed += ticker.deltaMS;
    const t = Math.min(tween.elapsed / tween.duration, 1);
    const eased = tween.ease(t);
    for (const key of Object.keys(tween.to)) {
      const from = tween.from[key] ?? 0;
      tween.target[key] = from + ((tween.to[key] ?? 0) - from) * eased;
    }
    if (t === 1) {
      active.delete(tween);
      tween.onDone?.();
    }
  }
}

let started = false;

/** Stops running tweens of this object; it keeps its current values. */
export function killTweens(target: object): void {
  for (const tween of active) if (tween.target === target) active.delete(tween);
}

/** Animates numeric properties, replacing any tween already running on `target`. */
export function tween(
  target: object,
  to: Record<string, number>,
  duration: number,
  ease: Ease = easeOutQuad,
  onDone?: () => void,
): void {
  if (!started) {
    Ticker.shared.add(step);
    started = true;
  }
  killTweens(target);
  const record = target as Record<string, number>;
  const from: Record<string, number> = {};
  for (const key of Object.keys(to)) from[key] = record[key] ?? 0;
  active.add({
    target: record,
    from,
    to,
    elapsed: 0,
    duration: reducedMotion ? 1 : Math.max(duration, 1),
    ease,
    onDone,
  });
}
