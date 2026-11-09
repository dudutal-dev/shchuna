import { Howl } from 'howler';
import type { AddressGender, Settings } from '../types';

export type SfxId = 'tap' | 'lift' | 'drop' | 'toggle' | 'success' | 'undo' | 'purr' | 'yum' | 'tada';

/** What the rest of the game needs from audio. */
export interface SoundPlayer {
  say(lineId: string): void;
  sfx(id: SfxId): void;
}

interface Manifest {
  lines: Record<string, { file: string; durationMs: number }>;
}

/** The parts of a loaded voice clip AudioManager uses. */
export interface VoiceClip {
  play(): void;
  stop(): void;
  volume(level: number): void;
  onEnd(callback: () => void): void;
}

export interface AudioBackend {
  loadManifest(): Promise<Manifest>;
  createClip(url: string): VoiceClip;
  /** Development fallback for a line with no audio file. */
  speakFallback?(lineId: string): void;
  playSfx(id: SfxId, volume: number): void;
  setMusic(url: string | null, volume: number): void;
  setMusicVolume(volume: number): void;
}

const DUCKED_MUSIC = 0.3;

/**
 * Lines addressed to the child come in `.m` and `.f` versions. Returns the one to
 * play, or null if the manifest has neither that nor a plain line.
 */
export function resolveLineId(
  lineId: string,
  gender: AddressGender,
  known: (id: string) => boolean,
): string | null {
  const gendered = `${lineId}.${gender}`;
  if (known(gendered)) return gendered;
  return known(lineId) ? lineId : null;
}

export class AudioManager implements SoundPlayer {
  /** The line most recently asked for; tests read this because audio can't be observed. */
  lastLine: string | null = null;
  private manifest: Manifest = { lines: {} };
  private readonly clips = new Map<string, VoiceClip>();
  private current: VoiceClip | null = null;

  constructor(
    private readonly backend: AudioBackend,
    private readonly settings: () => Settings,
  ) {}

  async init(): Promise<void> {
    try {
      this.manifest = await this.backend.loadManifest();
    } catch (error) {
      console.warn('No voice manifest', error);
    }
  }

  /** Loads clips ahead of time, so a place's lines play without delay. */
  preload(lineIds: readonly string[]): void {
    for (const id of lineIds) {
      const resolved = this.resolve(id);
      if (resolved) this.clip(resolved);
    }
  }

  /** Plays a line, cutting off whichever line is playing now. */
  say(lineId: string): void {
    this.lastLine = lineId;
    this.current?.stop();
    this.current = null;
    const resolved = this.resolve(lineId);
    if (!resolved) {
      this.backend.speakFallback?.(lineId);
      return;
    }
    const clip = this.clip(resolved);
    clip.volume(this.settings().voice);
    this.current = clip;
    this.backend.setMusicVolume(this.settings().music * DUCKED_MUSIC);
    clip.play();
  }

  sfx(id: SfxId): void {
    this.backend.playSfx(id, this.settings().sfx);
  }

  music(url: string | null): void {
    this.backend.setMusic(url, this.settings().music);
  }

  private resolve(lineId: string): string | null {
    const { addressGender } = this.settings();
    return resolveLineId(lineId, addressGender, (id) => id in this.manifest.lines);
  }

  private clip(resolvedId: string): VoiceClip {
    let clip = this.clips.get(resolvedId);
    if (!clip) {
      const entry = this.manifest.lines[resolvedId];
      if (!entry) throw new Error(`Line not in manifest: ${resolvedId}`);
      clip = this.backend.createClip(entry.file.replace(/^public\//, ''));
      const created = clip;
      clip.onEnd(() => {
        if (this.current !== created) return;
        this.current = null;
        this.backend.setMusicVolume(this.settings().music);
      });
      this.clips.set(resolvedId, clip);
    }
    return clip;
  }
}

/** Short original tones. Made on the spot, so a touch gets sound with no file to load. */
const SFX_NOTES: Record<SfxId, ReadonlyArray<readonly [hz: number, startS: number, lengthS: number]>> = {
  tap: [[660, 0, 0.06]],
  lift: [[520, 0, 0.05], [780, 0.04, 0.07]],
  drop: [[300, 0, 0.09]],
  toggle: [[880, 0, 0.05], [660, 0.05, 0.06]],
  success: [[660, 0, 0.08], [880, 0.07, 0.08], [1100, 0.14, 0.12]],
  undo: [[520, 0, 0.06], [390, 0.05, 0.08]],
  purr: [[110, 0, 0.12], [100, 0.13, 0.12], [115, 0.26, 0.12], [104, 0.39, 0.14]],
  yum: [[440, 0, 0.08], [554, 0.1, 0.08], [440, 0.22, 0.08], [554, 0.32, 0.12]],
  tada: [[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.1], [1047, 0.26, 0.22]],
};

/** The real thing: Howler for files, Web Audio for tones. */
export class BrowserAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private musicHowl: Howl | null = null;

  constructor(
    private readonly baseUrl: string,
    readonly speakFallback?: (lineId: string) => void,
  ) {
    // iOS only starts audio inside a user gesture, and may suspend it again later.
    const unlock = (): void => void this.resume();
    for (const event of ['pointerup', 'touchend', 'click']) {
      document.addEventListener(event, unlock, { passive: true });
    }
  }

  async loadManifest(): Promise<Manifest> {
    const response = await fetch(`${this.baseUrl}audio/manifest.json`);
    return (await response.json()) as Manifest;
  }

  createClip(url: string): VoiceClip {
    const howl = new Howl({
      src: [`${this.baseUrl}${url}`],
      onloaderror: (_id, error) => console.warn('Could not load', url, error),
    });
    return {
      play: () => void howl.play(),
      stop: () => void howl.stop(),
      volume: (level) => void howl.volume(level),
      onEnd: (callback) => void howl.on('end', callback),
    };
  }

  playSfx(id: SfxId, volume: number): void {
    const context = this.resume();
    if (!context || volume <= 0) return;
    const now = context.currentTime;
    for (const [hz, start, length] of SFX_NOTES[id]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.25 * volume, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + length + 0.02);
    }
  }

  setMusic(url: string | null, volume: number): void {
    this.musicHowl?.unload();
    this.musicHowl = url
      ? new Howl({ src: [`${this.baseUrl}${url}`], loop: true, volume, autoplay: true })
      : null;
  }

  setMusicVolume(volume: number): void {
    this.musicHowl?.fade(this.musicHowl.volume(), volume, 200);
  }

  private resume(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }
}
