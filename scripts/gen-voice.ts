// Generates public/audio from voice-lines.json with ElevenLabs. Build-time only:
// the key stays in .env and nothing here ships to the client.
//
//   npm run voice                  generate what's missing or changed
//   npm run voice --dry-run        show what that would cost (needs no key)
//   npm run voice --only=prop      only lines whose id starts with "prop"
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import {
  costUsd,
  DEFAULT_MODEL,
  lineHash,
  spokenText,
  VOICE_SETTINGS,
  type Manifest,
  type VoiceLine,
} from './lib/voice.ts';

config({ quiet: true });

const LINES_PATH ='src/content/voice-lines.json';
const AUDIO_DIR = 'public/audio';
const LINES_DIR = `${AUDIO_DIR}/lines`;
const MANIFEST_PATH = `${AUDIO_DIR}/manifest.json`;
const TARGET_LUFS = -16;
const MP3_BITRATE_KBPS = 128;
const MAX_ATTEMPTS = 4;

const args = process.argv.slice(2);
function flag(name: string): boolean {
  // `npm run voice --dry-run` is taken by npm, which passes it on as an env var.
  return args.includes(`--${name}`) || process.env[`npm_config_${name.replace('-', '_')}`] === 'true';
}
function option(name: string): string | undefined {
  const inline = args.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1];
  return process.env[`npm_config_${name}`] || undefined;
}

const dryRun = flag('dry-run');
const only = option('only');
const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;

function voiceId(voice: string): string {
  return process.env[`ELEVENLABS_VOICE_${voice.toUpperCase()}`] ?? '';
}

function scrub(message: string): string {
  return apiKey ? message.replaceAll(apiKey, '***') : message;
}

function hasTool(tool: string): boolean {
  return spawnSync(tool, ['-version'], { stdio: 'ignore' }).status === 0;
}

async function loadManifest(): Promise<Manifest> {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as Manifest;
  } catch {
    return { lines: {} };
  }
}

async function synthesize(line: VoiceLine): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId(line.voice)}?output_format=mp3_44100_128`;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: spokenText(line),
        model_id: model,
        language_code: 'he',
        voice_settings: VOICE_SETTINGS,
      }),
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`${line.id}: HTTP ${response.status} ${scrub(await response.text())}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

async function normalize(file: string): Promise<void> {
  const temp = `${file}.tmp.mp3`;
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-i', file, '-af', `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11`, '-ar', '44100', '-b:a', `${MP3_BITRATE_KBPS}k`, temp],
    { stdio: 'pipe' },
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${result.stderr}`);
  await rename(temp, file);
}

async function durationMs(file: string, canProbe: boolean): Promise<number> {
  if (canProbe) {
    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
      { encoding: 'utf8' },
    );
    const seconds = Number.parseFloat(probe.stdout);
    if (probe.status === 0 && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  }
  const { size } = await stat(file);
  return Math.round((size * 8) / MP3_BITRATE_KBPS);
}

async function main(): Promise<void> {
  const all = JSON.parse(await readFile(LINES_PATH, 'utf8')) as VoiceLine[];
  const manifest = await loadManifest();
  const selected = only ? all.filter((line) => line.id.startsWith(only)) : all;
  const pending = selected.filter((line) => {
    const entry = manifest.lines[line.id];
    return !entry || entry.hash !== lineHash(line, voiceId(line.voice), model) || !existsSync(entry.file);
  });
  const characters = pending.reduce((sum, line) => sum + spokenText(line).length, 0);
  const cost = costUsd(characters, model);

  console.log(`Model: ${model}`);
  console.log(`Lines: ${selected.length} selected, ${pending.length} to generate`);
  console.log(`Characters to bill: ${characters}`);
  console.log(cost === null ? 'Cost: unknown for this model' : `Cost: about $${cost.toFixed(3)}`);

  const missingVoices = [...new Set(pending.map((line) => line.voice))].filter((v) => !voiceId(v));
  if (dryRun) {
    if (missingVoices.length) console.log(`Voice IDs not set yet: ${missingVoices.join(', ')}`);
    return;
  }
  if (pending.length === 0) return;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is missing from .env (see .env.example)');
  if (missingVoices.length) {
    throw new Error(`Voice IDs missing from .env for: ${missingVoices.join(', ')}`);
  }

  await mkdir(LINES_DIR, { recursive: true });
  const canNormalize = hasTool('ffmpeg');
  const canProbe = hasTool('ffprobe');
  if (!canNormalize) console.warn('ffmpeg not found: skipping loudness normalization');

  for (const [index, line] of pending.entries()) {
    const file = `${LINES_DIR}/${line.id}.mp3`;
    await writeFile(file, await synthesize(line));
    if (canNormalize) await normalize(file);
    manifest.lines[line.id] = {
      file,
      text: spokenText(line),
      durationMs: await durationMs(file, canProbe),
      hash: lineHash(line, voiceId(line.voice), model),
    };
    // Written after every line, so a failed run keeps what was already paid for.
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[${index + 1}/${pending.length}] ${line.id}`);
  }

  if (!only) await pruneRemoved(all, manifest);
}

async function pruneRemoved(all: readonly VoiceLine[], manifest: Manifest): Promise<void> {
  const known = new Set(all.map((line) => line.id));
  for (const [id, entry] of Object.entries(manifest.lines)) {
    if (known.has(id)) continue;
    await rm(entry.file, { force: true });
    delete manifest.lines[id];
    console.log(`Removed ${id}`);
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(scrub(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
