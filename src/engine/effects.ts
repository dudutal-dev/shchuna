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

/** A little orange fish leaps out of the water and dives back in. */
export function fishJump(parent: Container, x: number, y: number, scale: number): void {
  if (parent.destroyed) return;
  const fish = new Graphics()
    .ellipse(0, 0, 22, 12)
    .fill(0xf28a3a)
    .stroke({ color: 0xc4621f, width: 3 })
    .poly([18, 0, 34, -12, 34, 12])
    .fill(0xf28a3a)
    .stroke({ color: 0xc4621f, width: 3 })
    .circle(-10, -3, 3)
    .fill(0x3b2f2f);
  fish.eventMode = 'none';
  fish.scale.set(scale);
  fish.position.set(x, y);
  parent.addChild(fish);
  const height = 110 * scale;
  const across = 70 * scale;
  let t = 0;
  const step = () => {
    if (fish.destroyed) return;
    t += 1 / 40;
    fish.x = x + across * t;
    fish.y = y - height * 4 * t * (1 - t);
    fish.rotation = (t - 0.5) * 2.4;
    if (t < 1) requestAnimationFrame(step);
    else {
      starBurst(parent, fish.x, fish.y, { count: 6, radius: 30 * scale, size: 6, colours: [0x58b8ea, 0xffffff] });
      fish.destroy();
    }
  };
  requestAnimationFrame(step);
}

/** A few pink hearts float up and fade, for a stroked cat. */
export function hearts(parent: Container, x: number, y: number, scale: number): void {
  if (parent.destroyed) return;
  for (let i = 0; i < 4; i++) {
    const heart = new Graphics()
      .moveTo(0, 6)
      .bezierCurveTo(-14, -6, -6, -18, 0, -8)
      .bezierCurveTo(6, -18, 14, -6, 0, 6)
      .fill(0xe5508a);
    heart.eventMode = 'none';
    heart.scale.set(scale * (0.9 + Math.random() * 0.5));
    heart.position.set(x + (i - 1.5) * 22 * scale, y);
    heart.alpha = 0;
    parent.addChild(heart);
    setTimeout(() => {
      if (heart.destroyed) return;
      heart.alpha = 1;
      tween(heart, { y: y - 90 * scale, alpha: 0 }, 1300, easeOutQuad, () => heart.destroy());
    }, i * 160);
  }
}

/** A butterfly flutters up out of the plant and away across the room. */
export function butterfly(parent: Container, x: number, y: number, scale: number, width: number): void {
  if (parent.destroyed) return;
  const body = new Container();
  const wings = new Graphics()
    .ellipse(-11, -6, 11, 9)
    .ellipse(11, -6, 11, 9)
    .fill(0xffc23c)
    .ellipse(-8, 7, 7, 6)
    .ellipse(8, 7, 7, 6)
    .fill(0xe5508a);
  const middle = new Graphics().roundRect(-2.5, -10, 5, 22, 3).fill(0x3b2f2f);
  body.addChild(wings, middle);
  body.eventMode = 'none';
  body.scale.set(scale * 1.3);
  body.position.set(x, y);
  parent.addChild(body);
  // Away towards the nearer side of the screen, with a bit of a wobble.
  const away = x > width / 2 ? -1 : 1;
  let t = 0;
  const step = () => {
    if (body.destroyed) return;
    t += 1 / 150;
    body.x = x + away * t * 420 * scale;
    body.y = y - t * 260 * scale + Math.sin(t * 18) * 14 * scale;
    wings.scale.x = 0.35 + Math.abs(Math.sin(t * 60)) * 0.65;
    body.alpha = t > 0.8 ? (1 - t) * 5 : 1;
    if (t < 1) requestAnimationFrame(step);
    else body.destroy({ children: true });
  };
  requestAnimationFrame(step);
}
