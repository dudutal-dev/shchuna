// Fails the build if a child-facing string has no niqqud or a voice line has no audio.
import { existsSync, readFileSync } from 'node:fs';
import { strings } from '../src/content/strings.he.ts';
import {
  lintVoiceLines,
  linesMissingAudio,
  wordsMissingNiqqud,
  type Manifest,
  type VoiceLine,
} from './lib/voice.ts';

function leaves(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]];
  return Object.entries(value as object).flatMap(([key, child]) =>
    leaves(child, path ? `${path}.${key}` : key),
  );
}

const lines = JSON.parse(readFileSync('src/content/voice-lines.json', 'utf8')) as VoiceLine[];
const manifest = JSON.parse(readFileSync('public/audio/manifest.json', 'utf8')) as Manifest;

const problems = lintVoiceLines(lines);
for (const [path, text] of leaves(strings, '')) {
  for (const word of wordsMissingNiqqud(text)) problems.push(`strings.${path}: no niqqud on "${word}"`);
}

const missingAudio = linesMissingAudio(lines, manifest, existsSync);
if (missingAudio.length > 0) {
  const message = `${missingAudio.length} of ${lines.length} voice lines have no audio (run: npm run voice)`;
  // Only for tests and for deploys made before the voices exist. Real releases don't set it.
  if (process.env.SHCHUNA_ALLOW_MISSING_VOICE) console.warn(`Warning: ${message}`);
  else problems.push(message);
}

const unproofed = lines.filter((line) => line.proofread === false).length;
if (unproofed > 0) console.log(`${unproofed} voice lines still await niqqud proofreading`);

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
