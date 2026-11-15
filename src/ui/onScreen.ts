interface Point {
  x: number;
  y: number;
}

/**
 * Moves a round thing of radius `half` (in screen points) so that all of it shows: below
 * `top` (where the buttons end), inside the safe area at the sides, and above the bottom edge.
 */
export function keepOnScreen(
  at: Point,
  half: number,
  screen: { width: number; height: number },
  safe: { top: number; right: number; bottom: number; left: number },
  top: number,
): Point {
  const edge = 4;
  const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
  return {
    x: clamp(at.x, safe.left + half + edge, screen.width - safe.right - half - edge),
    y: clamp(at.y, top + half, screen.height - safe.bottom - half - edge),
  };
}
