// Records a few typical lines in several ways, side by side, so a person can hear which
// way reads Hebrew best: with or without niqqud, on more than one model. Build-time tool
// only; the key stays in .env and is never printed.
//
//   node scripts/voice-compare.ts
//
// Writes .voice-samples/compare/*.mp3 and index.html (git-ignored) to listen to.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { config } from 'dotenv';
import { VOICE_SETTINGS, type VoiceLine } from './lib/voice.ts';

config({ quiet: true });

const OUT = '.voice-samples/compare';
const LINE_IDS = [
  'ui.welcome',
  'letter.found.lamed.m',
  'count.shekels.3',
  'letter.hint.kitchen',
  'prop.puppet-theater',
  'prop.hippo',
  'map.where',
];
const MODELS = ['eleven_v3', 'eleven_v4'];
const NIQQUD = /[֑-ׇֽֿׁׂׅׄ]/g;

const apiKey = process.env.ELEVENLABS_API_KEY ?? '';
const voice = process.env.ELEVENLABS_VOICE_NARRATOR ?? '';
const scrub = (message: string) => (apiKey ? message.replaceAll(apiKey, '***') : message);

async function speak(text: string, model: string): Promise<Buffer> {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model, language_code: 'he', voice_settings: VOICE_SETTINGS }),
    },
  );
  if (!response.ok) throw new Error(`HTTP ${response.status} ${scrub(await response.text()).slice(0, 200)}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main(): Promise<void> {
  if (!apiKey || !voice) throw new Error('ELEVENLABS_API_KEY and ELEVENLABS_VOICE_NARRATOR are needed in .env');
  const all = JSON.parse(await readFile('src/content/voice-lines.json', 'utf8')) as VoiceLine[];
  const lines = LINE_IDS.map((id) => all.find((line) => line.id === id)).filter((l): l is VoiceLine => !!l);
  await mkdir(OUT, { recursive: true });

  const variants = MODELS.flatMap((model) => [
    { key: `${model}-niqqud`, label: `${model}, עם ניקוד`, model, plain: false },
    { key: `${model}-plain`, label: `${model}, בלי ניקוד`, model, plain: true },
  ]);
  const failed = new Set<string>();
  const rows: string[] = [];
  for (const line of lines) {
    const cells: string[] = [];
    for (const variant of variants) {
      const file = `${line.id}--${variant.key}.mp3`;
      if (failed.has(variant.model)) {
        cells.push('<td>—</td>');
        continue;
      }
      try {
        const text = variant.plain ? line.text.replace(NIQQUD, '') : line.text;
        await writeFile(`${OUT}/${file}`, await speak(text, variant.model));
        cells.push(`<td><audio controls preload="none" src="${file}"></audio></td>`);
        console.log(`ok   ${line.id} ${variant.key}`);
      } catch (error) {
        // A model this key can't use: skip it for the rest of the run.
        failed.add(variant.model);
        console.log(`skip ${variant.model}: ${scrub(String(error))}`);
        cells.push('<td>—</td>');
      }
    }
    rows.push(`<tr><th>${line.text}</th>${cells.join('')}</tr>`);
  }
  const html = `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8"><title>השוואת קולות</title>
<style>body{font:18px system-ui;margin:24px;background:#fff7e6;color:#3b2f2f}table{border-collapse:collapse}
td,th{border:1px solid #e2cda3;padding:8px;text-align:right}th{font-size:22px}audio{width:200px}</style>
<h1>השוואת קולות</h1><p>אותו קול (Matilda), אותן הגדרות. רק הניקוד והמודל משתנים.</p>
<table><tr><th>שורה</th>${variants.map((v) => `<th>${v.label}</th>`).join('')}</tr>${rows.join('')}</table></html>`;
  await writeFile(`${OUT}/index.html`, html);
  console.log(`\n${OUT}/index.html`);
}

main().catch((error: unknown) => {
  console.error(scrub(String(error)));
  process.exit(1);
});
