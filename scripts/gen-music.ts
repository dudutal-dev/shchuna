// Composes and renders the background music: one quiet loop per place, written to
// public/audio/music/<name>.mp3. Build-time only, no network, no samples: every sound is
// synthesised here, so the music is original and can be regenerated at will.
//
//   npm run music
//
// Needs ffmpeg on the PATH for the MP3 encoding and loudness normalisation.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RATE = 44_100;
/** Quieter than the voices (-16 LUFS), so speech always sits on top. */
const LOUDNESS = -24;
const OUT_DIR = 'public/audio/music';

interface Track {
  name: string;
  bpm: number;
  /** MIDI note of the key's root. */
  root: number;
  /** Chord roots in scale degrees of the major scale, one chord per two bars. */
  progression: number[];
  /** How many times the progression repeats; the melody varies each time. */
  cycles: number;
  /** Chance of a melody note on each eighth. */
  density: number;
  /** A soft woodblock on beats 2 and 4. */
  tick: boolean;
  seed: number;
}

const TRACKS: Track[] = [
  // Home: slow and warm.
  { name: 'home', bpm: 76, root: 60, progression: [0, 5, 3, 4], cycles: 3, density: 0.38, tick: false, seed: 7 },
  // The makolet: a little busier, a bounce in its step.
  { name: 'makolet', bpm: 100, root: 62, progression: [0, 3, 4, 0, 5, 3, 4, 4], cycles: 2, density: 0.5, tick: true, seed: 21 },
  // The gan: playful, a skip in the yard.
  { name: 'gan', bpm: 108, root: 67, progression: [0, 4, 0, 3, 5, 3, 4, 4], cycles: 2, density: 0.55, tick: true, seed: 42 },
  // The clinic: calm and gentle, nothing to worry about.
  { name: 'clinic', bpm: 70, root: 64, progression: [0, 3, 5, 4], cycles: 3, density: 0.3, tick: false, seed: 11 },
  // The falafel stand: lively, a little street-market swing.
  { name: 'falafel', bpm: 112, root: 62, progression: [0, 3, 4, 0, 5, 4, 3, 4], cycles: 2, density: 0.55, tick: true, seed: 77 },
  // The beach: slow and sunny, a wave's sway.
  { name: 'beach', bpm: 84, root: 65, progression: [0, 5, 3, 4, 0, 3, 4, 0], cycles: 2, density: 0.4, tick: false, seed: 5 },
  // The map: light, like a walk outside.
  { name: 'map', bpm: 88, root: 65, progression: [0, 4, 5, 3], cycles: 3, density: 0.42, tick: false, seed: 3 },
];

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const PENTATONIC = [0, 2, 4, 7, 9];

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** The three notes of the chord on a scale degree, as semitones above the key root. */
function chordOf(degree: number): number[] {
  return [0, 2, 4].map((step) => {
    const index = degree + step;
    return MAJOR[index % 7]! + 12 * Math.floor(index / 7);
  });
}

/** Mixes a note into a circular buffer, so tails past the end wrap to the start of the loop. */
function addNote(
  buffer: Float32Array,
  start: number,
  length: number,
  voice: (t: number) => number,
): void {
  const from = Math.round(start * RATE);
  const count = Math.round(length * RATE);
  for (let i = 0; i < count; i++) {
    const at = (from + i) % buffer.length;
    buffer[at]! += voice(i / RATE);
  }
}

const TWO_PI = Math.PI * 2;

/** A wooden mallet: a sine with a quickly fading bright partial. */
function marimba(freq: number, gain: number) {
  return (t: number) => {
    const body = Math.sin(TWO_PI * freq * t) * Math.exp(-t / 0.42);
    const bright = 0.25 * Math.sin(TWO_PI * freq * 4 * t) * Math.exp(-t / 0.06);
    const attack = Math.min(1, t / 0.004);
    return gain * attack * (body + bright);
  };
}

/** A soft pad for a held chord, swelling in and out. */
function pad(freq: number, gain: number, length: number) {
  return (t: number) => {
    const swell = Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (length - t) / 0.9));
    const tone = Math.sin(TWO_PI * freq * t) + 0.3 * Math.sin(TWO_PI * freq * 2.003 * t);
    return gain * swell * tone;
  };
}

function bass(freq: number, gain: number) {
  return (t: number) => {
    const attack = Math.min(1, t / 0.01);
    return gain * attack * Math.exp(-t / 0.6) * (Math.sin(TWO_PI * freq * t) + 0.2 * Math.sin(TWO_PI * freq * 2 * t));
  };
}

function woodblock(gain: number) {
  return (t: number) => gain * Math.sin(TWO_PI * 1250 * t) * Math.exp(-t / 0.025);
}

function render(track: Track): Float32Array {
  const random = mulberry32(track.seed);
  const beat = 60 / track.bpm;
  const bar = beat * 4;
  const chordBars = 2;
  const totalBars = track.progression.length * chordBars * track.cycles;
  const loop = new Float32Array(Math.round(totalBars * bar * RATE));
  const melody = new Float32Array(loop.length);

  // Melody walks the pentatonic scale, starting near the middle.
  const notes = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12, 14, 16];
  let index = 5;
  for (let cycle = 0; cycle < track.cycles; cycle++) {
    // The middle cycle is fuller; the first and last breathe more.
    const density = track.density * (cycle === 1 ? 1.25 : 0.85);
    track.progression.forEach((degree, chordIndex) => {
      const startBar = (cycle * track.progression.length + chordIndex) * chordBars;
      const start = startBar * bar;
      const chord = chordOf(degree);
      for (const note of chord) addNote(loop, start, chordBars * bar + 1, pad(hz(track.root + note), 0.045, chordBars * bar + 0.5));
      for (let b = 0; b < chordBars * 2; b++) {
        addNote(loop, start + b * beat * 2, 1.6, bass(hz(track.root - 24 + chord[0]!), 0.2));
      }
      if (track.tick) {
        for (let b = 0; b < chordBars * 4; b++) if (b % 2 === 1) addNote(loop, start + b * beat, 0.12, woodblock(0.05));
      }
      for (let eighth = 0; eighth < chordBars * 8; eighth++) {
        // Strong beats are likelier, and every phrase ends with a held breath.
        const strong = eighth % 4 === 0 ? 1.4 : eighth % 2 === 0 ? 1 : 0.6;
        if (eighth >= chordBars * 8 - 2 || random() > density * strong) continue;
        const step = [-2, -1, -1, 1, 1, 2][Math.floor(random() * 6)]!;
        index = Math.max(0, Math.min(notes.length - 1, index + step));
        let pitch = notes[index]!;
        // On a strong beat, lean to the nearest chord tone.
        if (eighth % 4 === 0) {
          const tones = chord.flatMap((n) => [n - 12, n, n + 12]);
          pitch = tones.reduce((best, n) => (Math.abs(n - pitch) < Math.abs(best - pitch) ? n : best));
        }
        if (!PENTATONIC.includes(((pitch % 12) + 12) % 12) && eighth % 4 !== 0) continue;
        addNote(melody, start + eighth * (beat / 2), 2, marimba(hz(track.root + 12 + pitch), 0.2));
      }
    });
  }

  // A soft echo on the melody, wrapping around the loop like everything else.
  const delay = Math.round(beat * 0.75 * RATE);
  const echoed = Float32Array.from(melody);
  for (let pass = 1; pass <= 3; pass++) {
    const gain = 0.28 ** pass;
    for (let i = 0; i < melody.length; i++) echoed[(i + delay * pass) % melody.length]! += melody[i]! * gain;
  }
  for (let i = 0; i < loop.length; i++) loop[i]! += echoed[i]!;

  let peak = 0;
  for (const value of loop) peak = Math.max(peak, Math.abs(value));
  for (let i = 0; i < loop.length; i++) loop[i]! *= 0.9 / peak;
  return loop;
}

function wav(samples: Float32Array): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((value, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32_767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(OUT_DIR, { recursive: true });
const temp = join(tmpdir(), `shchuna-music-${process.pid}.wav`);
for (const track of TRACKS) {
  const samples = render(track);
  writeFileSync(temp, wav(samples));
  const out = join(OUT_DIR, `${track.name}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', temp, '-af', `loudnorm=I=${LOUDNESS}:TP=-2`, '-ar', '44100', '-ac', '1', '-b:a', '64k', out]);
  console.log(`${out}: ${(samples.length / RATE).toFixed(1)}s`);
}
rmSync(temp, { force: true });
