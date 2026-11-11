// Makes the parents' video guide, docs/media/shchuna-guide.mp4:
//   1. records each narration segment with ElevenLabs (cached, so a re-run costs nothing),
//   2. plays the game in a browser and records it (tests/video/guide.video.ts),
//   3. lays the narration over the video, each segment where it started, with ffmpeg.
// Build-time tool only: the key stays in .env and is never printed.
//
//   node scripts/guide-video.ts
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from 'dotenv';
import { DEFAULT_MODEL, VOICE_SETTINGS } from './lib/voice.ts';
import { SEGMENTS } from './guide-video/narration.ts';

config({ quiet: true });

const DIR = '.voice-samples/guide';
const OUT = 'docs/media/shchuna-guide.mp4';
const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
const voice = process.env.ELEVENLABS_VOICE_NARRATOR ?? '';
const model = process.env.ELEVENLABS_MODEL || DEFAULT_MODEL;
const scrub = (message: string) => (apiKey ? message.replaceAll(apiKey, '***') : message);

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} failed: ${scrub(result.stderr ?? '')}`);
  return result.stdout;
}

async function speak(text: string, file: string): Promise<void> {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: model, language_code: 'he', voice_settings: VOICE_SETTINGS }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${scrub(await response.text()).slice(0, 200)}`);
  const raw = `${file}.raw.mp3`;
  writeFileSync(raw, Buffer.from(await response.arrayBuffer()));
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'loudnorm=I=-16:TP=-1.5', '-ar', '44100', file]);
}

function durationMs(file: string): number {
  const out = run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return Math.round(Number.parseFloat(out) * 1000);
}

function findVideo(dir: string): string | null {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      const found = findVideo(path);
      if (found) return found;
    } else if (name.endsWith('.webm')) return path;
  }
  return null;
}

async function main(): Promise<void> {
  if (!apiKey || !voice) throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_NARRATOR are needed in .env');
  mkdirSync(DIR, { recursive: true });

  // 1. Narration.
  const narration = [];
  for (const segment of SEGMENTS) {
    const hash = createHash('sha256').update(`${segment.text}|${voice}|${model}`).digest('hex').slice(0, 10);
    const file = `${DIR}/${segment.id}-${hash}.mp3`;
    if (!existsSync(file)) {
      console.log(`voice ${segment.id}`);
      await speak(segment.text, file);
    }
    narration.push({ ...segment, file, durationMs: durationMs(file) });
  }
  writeFileSync(`${DIR}/narration.json`, JSON.stringify(narration, null, 2));

  // 2. The recording.
  const test = spawnSync('npx', ['playwright', 'test', '-c', 'playwright.video.config.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (test.status !== 0) throw new Error('The recording failed');
  const video = findVideo(`${DIR}/run`);
  if (!video) throw new Error('No video was recorded');
  const timeline = JSON.parse(readFileSync(`${DIR}/timeline.json`, 'utf8')) as Array<{ id: string; atMs: number }>;

  // 3. Narration over the video, each segment from the moment its caption appeared.
  const inputs = ['-i', video];
  const delays: string[] = [];
  narration.forEach((line, index) => {
    const at = timeline.find((t) => t.id === line.id)?.atMs ?? 0;
    inputs.push('-i', line.file);
    delays.push(`[${index + 1}:a]adelay=${at}|${at}[a${index}]`);
  });
  const mix = `${delays.join(';')};${narration.map((_, i) => `[a${i}]`).join('')}amix=inputs=${narration.length}:normalize=0[a]`;
  mkdirSync('docs/media', { recursive: true });
  run('ffmpeg', [
    '-y', '-loglevel', 'error', ...inputs,
    '-filter_complex', `"${mix}"`,
    '-map', '0:v', '-map', '"[a]"',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
    OUT,
  ]);
  console.log(`\n${OUT} (${(statSync(OUT).size / 1e6).toFixed(1)} MB, ${(durationMs(OUT) / 1000).toFixed(0)}s)`);
}

main().catch((error: unknown) => {
  console.error(scrub(String(error)));
  process.exit(1);
});
