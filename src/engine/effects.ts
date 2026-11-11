import { Container, Graphics } from 'pixi.js';
import { easeOutQuad, tween } from './tween';

const COLOURS = [0xffc23c, 0xe5508a, 0x58b8ea, 0x7faf6b, 0xffffff];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface BurstOptions {
  /** How many stars. */
  count?: number;
  /** How far they fly, in the parent's units. */
  radius?: number;
  /** Size of one star. */
  size?: number;
  duration?: number;
  /** One soft colour for a quiet hint instead of the party mix. */
  colours?: readonly number[];
}

/**
 * The "ta-da!": stars pop out from a point and fade. Takes no touches, cleans itself up,
 * and shrinks to a few still stars when the device asks for less motion.
 */
export function starBurst(parent: Container, x: number, y: number, options: BurstOptions = {}): void {
  if (parent.destroyed) return;
  const count = reducedMotion ? 3 : (options.count ?? 10);
  const radius = reducedMotion ? 0 : (options.radius ?? 90);
  const size = options.size ?? 14;
  const duration = options.duration ?? 650;
  const colours = options.colours ?? COLOURS;
  const layer = new Container();
  layer.eventMode = 'none';
  layer.position.set(x, y);
  parent.addChild(layer);

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const distance = radius * (0.6 + Math.random() * 0.4);
    const star = new Graphics()
      .star(0, 0, 5, size, size * 0.45)
      .fill(colours[i % colours.length] ?? 0xffc23c)
      .stroke({ color: 0x3b2f2f, width: 2, alpha: 0.25 });
    star.scale.set(0.3);
    // A tween replaces any other on the same object: the holder flies, the star fades.
    const holder = new Container();
    holder.rotation = Math.random() * Math.PI;
    holder.addChild(star);
    layer.addChild(holder);
    tween(
      holder,
      { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance, rotation: holder.rotation + 1.2 },
      duration,
      easeOutQuad,
    );
    tween(star.scale, { x: 1, y: 1 }, duration * 0.4, easeOutQuad, () => {
      if (!star.destroyed) tween(star, { alpha: 0 }, duration * 0.6);
    });
  }
  setTimeout(() => {
    if (!layer.destroyed) layer.destroy({ children: true });
  }, duration * 1.1 + 50);
}
