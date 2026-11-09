// Fails the build if anything ElevenLabs-related, above all the key, reached dist/.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';

config({ quiet: true });

const TEXT_FILE = /\.(js|css|html|json|webmanifest|svg|map)$/;
const forbidden = ['ELEVENLABS', 'xi-api-key', 'api.elevenlabs.io'];
const key = process.env.ELEVENLABS_API_KEY;
if (key) forbidden.push(key);

function* walk(directory: string): Generator<string> {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else yield path;
  }
}

let failed = false;
for (const file of walk('dist')) {
  if (!TEXT_FILE.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [index, needle] of forbidden.entries()) {
    if (!text.includes(needle)) continue;
    // Never print the key itself.
    console.error(`${file} contains ${needle === key ? 'the API key' : `forbidden text #${index}`}`);
    failed = true;
  }
}
if (failed) process.exit(1);
