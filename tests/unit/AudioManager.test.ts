import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AudioManager,
  resolveLineId,
  type AudioBackend,
  type VoiceClip,
} from '../../src/engine/AudioManager';
import type { AddressGender, Settings } from '../../src/types';

function fakeClip() {
  let ended = (): void => {};
  return {
    play: vi.fn(),
    stop: vi.fn(),
    volume: vi.fn(),
    onEnd: (callback: () => void) => {
      ended = callback;
    },
    finish: () => ended(),
  } satisfies VoiceClip & { finish(): void };
}

describe('resolveLineId', () => {
  const known = (...ids: string[]) => (id: string) => ids.includes(id);

  it('prefers the version for the chosen gender', () => {
    expect(resolveLineId('found', 'f', known('found.m', 'found.f'))).toBe('found.f');
  });

  it('uses the plain line when there is no gendered one', () => {
    expect(resolveLineId('prop.milk', 'f', known('prop.milk'))).toBe('prop.milk');
  });

  it('returns null for an unknown line', () => {
    expect(resolveLineId('nope', 'm', known())).toBeNull();
  });
});

describe('AudioManager', () => {
  let clips: Record<string, ReturnType<typeof fakeClip>>;
  let backend: AudioBackend;
  let settings: Settings;
  let setMusicVolume: ReturnType<typeof vi.fn<(volume: number) => void>>;
  let speakFallback: ReturnType<typeof vi.fn<(id: string) => void>>;
  let playSfx: ReturnType<typeof vi.fn<AudioBackend['playSfx']>>;

  async function ready(gender: AddressGender = 'm'): Promise<AudioManager> {
    settings.addressGender = gender;
    const audio = new AudioManager(backend, () => settings);
    await audio.init();
    return audio;
  }

  beforeEach(() => {
    clips = {};
    settings = { music: 0.5, voice: 0.8, sfx: 0.6, showNiqqud: true, addressGender: 'm' };
    setMusicVolume = vi.fn();
    speakFallback = vi.fn();
    playSfx = vi.fn();
    backend = {
      loadManifest: async () => ({
        lines: {
          a: { file: 'public/audio/lines/a.mp3', durationMs: 1 },
          b: { file: 'public/audio/lines/b.mp3', durationMs: 1 },
          'hi.m': { file: 'public/audio/lines/hi.m.mp3', durationMs: 1 },
          'hi.f': { file: 'public/audio/lines/hi.f.mp3', durationMs: 1 },
        },
      }),
      createClip: (url) => {
        const clip = fakeClip();
        clips[url] = clip;
        return clip;
      },
      speakFallback,
      playSfx,
      setMusic: vi.fn(),
      setMusicVolume,
    };
  });

  it('plays a line from the path the site serves it at, at the voice volume', async () => {
    (await ready()).say('a');
    const clip = clips['audio/lines/a.mp3'];
    expect(clip?.play).toHaveBeenCalledOnce();
    expect(clip?.volume).toHaveBeenCalledWith(0.8);
  });

  it('cuts off the line already playing', async () => {
    const audio = await ready();
    audio.say('a');
    audio.say('b');
    expect(clips['audio/lines/a.mp3']?.stop).toHaveBeenCalledOnce();
    expect(clips['audio/lines/b.mp3']?.play).toHaveBeenCalledOnce();
  });

  it('picks the gendered recording from settings', async () => {
    (await ready('f')).say('hi');
    expect(clips['audio/lines/hi.f.mp3']?.play).toHaveBeenCalledOnce();
    expect(clips['audio/lines/hi.m.mp3']).toBeUndefined();
  });

  it('ducks music during speech and restores it after', async () => {
    (await ready()).say('a');
    expect(setMusicVolume).toHaveBeenLastCalledWith(expect.closeTo(0.15));
    clips['audio/lines/a.mp3']?.finish();
    expect(setMusicVolume).toHaveBeenLastCalledWith(0.5);
  });

  it('does not restore music when an old line ends after a new one started', async () => {
    const audio = await ready();
    audio.say('a');
    audio.say('b');
    clips['audio/lines/a.mp3']?.finish();
    expect(setMusicVolume).toHaveBeenLastCalledWith(expect.closeTo(0.15));
  });

  it('plays a sequence one line after another', async () => {
    const audio = await ready();
    audio.sayAll(['a', 'b']);
    expect(clips['audio/lines/a.mp3']?.play).toHaveBeenCalledOnce();
    expect(clips['audio/lines/b.mp3']).toBeUndefined();
    clips['audio/lines/a.mp3']?.finish();
    expect(clips['audio/lines/b.mp3']?.play).toHaveBeenCalledOnce();
    expect(audio.history).toEqual(['a', 'b']);
  });

  it('drops the rest of a sequence when a new line starts', async () => {
    const audio = await ready();
    audio.sayAll(['a', 'b']);
    audio.say('hi');
    clips['audio/lines/a.mp3']?.finish();
    expect(clips['audio/lines/b.mp3']).toBeUndefined();
  });

  it('moves past a missing line in a sequence', async () => {
    vi.useFakeTimers();
    const audio = await ready();
    audio.sayAll(['missing', 'a']);
    expect(speakFallback).toHaveBeenCalledWith('missing');
    vi.advanceTimersByTime(1000);
    expect(clips['audio/lines/a.mp3']?.play).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('falls back when a line has no file', async () => {
    (await ready()).say('missing');
    expect(speakFallback).toHaveBeenCalledWith('missing');
  });

  it('keeps working when the manifest fails to load', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    backend.loadManifest = () => Promise.reject(new Error('offline'));
    const audio = await ready();
    expect(() => audio.say('a')).not.toThrow();
    vi.restoreAllMocks();
  });

  it('reuses one clip per line', async () => {
    const create = vi.spyOn(backend, 'createClip');
    const audio = await ready();
    audio.preload(['a']);
    audio.say('a');
    expect(create).toHaveBeenCalledOnce();
  });

  it('plays effects at the effects volume', async () => {
    (await ready()).sfx('tap');
    expect(playSfx).toHaveBeenCalledWith('tap', 0.6);
  });
});
