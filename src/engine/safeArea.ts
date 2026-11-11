/**
 * The parts of the screen that a notch, rounded corners or the home bar may cover, in CSS
 * pixels (the same units as the canvas's screen). Buttons stay inside; the scene itself still
 * fills the whole screen, so a room's art can run under the notch.
 */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

/** Tests can pretend to be a phone with a notch: `?e2e&notch=47` pads the left and right. */
function testNotch(): number {
  const params = new URLSearchParams(location.search);
  return params.has('e2e') ? Number(params.get('notch')) || 0 : 0;
}

export function safeArea(): Insets {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;visibility:hidden;pointer-events:none;inset:0;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const style = getComputedStyle(probe);
  const notch = testNotch();
  return {
    top: parseFloat(style.paddingTop) || 0,
    right: Math.max(parseFloat(style.paddingRight) || 0, notch),
    bottom: parseFloat(style.paddingBottom) || 0,
    left: Math.max(parseFloat(style.paddingLeft) || 0, notch),
  };
}

/** Button size for this screen: smaller on a short phone, never under the 64pt touch minimum. */
export function buttonSize(screenHeight: number): number {
  return screenHeight < 450 ? 64 : 72;
}
