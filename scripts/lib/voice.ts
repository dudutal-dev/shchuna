// Shared by the voice scripts. Node runs this file directly, so no bundler-only syntax.
import { createHash } from 'node:crypto';

export interface VoiceLine {
  id: string;
  text: string;
  voice: string;
  /** False until Dudu has approved the niqqud. */
  proofread?: boolean;
  /** What to send to the voice model when `text` doesn't sound right. `text` stays pointed. */
  spoken?: string;
}

export function spokenText(line: VoiceLine): string {
  return line.spoken ?? line.text;
}

export interface ManifestEntry {
  file: string;
  /** The text this audio was made from, so the build can spot stale recordings without a voice ID. */
  text: string;
  durationMs: number;
  hash: string;
}

export interface Manifest {
  lines: Record<string, ManifestEntry>;
}

// Dudu compared v3 and v4, each with and without niqqud: v4 with niqqud read Hebrew best.
export const DEFAULT_MODEL = 'eleven_v4';
export const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 0.95 };

/** USD per 1,000 characters, from elevenlabs.io/pricing/api (November 2026). */
const PRICE_PER_1000_CHARS: Record<string, number> = {
  eleven_v4: 0.08,
  eleven_v3: 0.08,
  eleven_v4_turbo: 0.04,
};

export function costUsd(characters: number, model: string): number | null {
  const price = PRICE_PER_1000_CHARS[model];
  return price === undefined ? null : (characters / 1000) * price;
}

/** Changes whenever the audio would come out different, so unchanged lines cost nothing. */
export function lineHash(line: VoiceLine, voiceId: string, model: string): string {
  return createHash('sha256')
    .update(JSON.stringify([spokenText(line), line.voice, voiceId, model, VOICE_SETTINGS]))
    .digest('hex');
}

// Letters and combining marks, alternated because one character class can't hold both.
const HEBREW_WORD = /(?:[א-ת]|[֑-ׇ])+/g;
const NIQQUD = /[ְ-ׇּׁׂ]/;

/** Words of two or more letters with no niqqud. A lone letter (such as ל) needs none. */
export function wordsMissingNiqqud(text: string): string[] {
  const words = text.match(HEBREW_WORD) ?? [];
  return words.filter((word) => {
    const letters = word.match(/[א-ת]/g)?.length ?? 0;
    return letters >= 2 && !NIQQUD.test(word);
  });
}

/** Problems that make the line file itself invalid, with no regard to audio. */
export function lintVoiceLines(lines: readonly VoiceLine[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    if (seen.has(line.id)) problems.push(`${line.id}: duplicate id`);
    seen.add(line.id);
    for (const word of wordsMissingNiqqud(line.text)) {
      problems.push(`${line.id}: no niqqud on "${word}"`);
    }
  }
  return problems;
}

/** Lines whose audio is absent from the manifest, or was made from different text. */
export function linesMissingAudio(
  lines: readonly VoiceLine[],
  manifest: Manifest,
  fileExists: (file: string) => boolean,
): string[] {
  return lines
    .filter((line) => {
      const entry = manifest.lines[line.id];
      return !entry || entry.text !== spokenText(line) || !fileExists(entry.file);
    })
    .map((line) => line.id);
}
