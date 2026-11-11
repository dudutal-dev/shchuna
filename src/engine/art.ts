import { Assets, Texture } from 'pixi.js';

const urls = import.meta.glob('/assets/art/**/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Rasterised above 1x so art stays crisp at the largest scene scale on a retina iPad. */
const ART_RESOLUTION = 3;
/** Backgrounds are wide; 2x keeps them inside the 4096px texture limit of older iPads. */
const BACKGROUND_RESOLUTION = 2;

function urlOf(path: string): string {
  const url = urls[`/assets/art/${path}`];
  if (!url) throw new Error(`Unknown art: ${path}`);
  return url;
}

/**
 * Loads art so `getArt` can return it synchronously. Paths are relative to assets/art.
 * `background` lowers the resolution for wide art; a number sets it outright.
 */
export async function loadArt(paths: readonly string[], background: boolean | number = false): Promise<void> {
  const resolution =
    typeof background === 'number' ? background : background ? BACKGROUND_RESOLUTION : ART_RESOLUTION;
  await Promise.all(
    [...new Set(paths)].map((path) =>
      Assets.load({ alias: path, src: urlOf(path), data: { resolution } }),
    ),
  );
}

export function getArt(path: string): Texture {
  return Assets.get<Texture>(path);
}
