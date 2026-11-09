// Renders the source SVG into the PNG sizes the PWA manifest and iOS need.
import { copyFile, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile('assets/art/icon.svg');
const sizes: Array<[string, number]> = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
];
for (const [name, size] of sizes) {
  await sharp(svg, { density: 300 }).resize(size, size).png().toFile(`public/icons/${name}`);
}
await copyFile('assets/art/icon.svg', 'public/icons/icon.svg');
