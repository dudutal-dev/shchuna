// Lets Pixi run under a strict CSP (no `unsafe-eval`).
import 'pixi.js/unsafe-eval';
import './styles.css';
import { Game } from './app/Game';

async function main(): Promise<void> {
  const host = document.getElementById('app');
  if (!host) throw new Error('Missing #app element');
  // Canvas text does not re-render on font swap, so wait for the font first.
  await document.fonts.load('700 96px Rubik', 'שכונה');
  await new Game().start(host);
}

void main();
