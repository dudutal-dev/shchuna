import { describe, expect, it } from 'vitest';
import { Actions } from '../../src/app/actions';
import { GameStore } from '../../src/app/store';
import { isOpen, isPremium, MAP_HEIGHT, MAP_WIDTH, PLACES } from '../../src/content/places';
import voiceLines from '../../src/content/voice-lines.json';
import { createNewSave, SaveManager, type SaveStorage } from '../../src/engine/SaveManager';
import { stripNiqqud } from '../../src/engine/text';

describe('neighbourhood map', () => {
  it('has the seven places of SPEC §6, home on the right', () => {
    expect(PLACES.map((p) => p.id).sort()).toEqual(
      ['beach', 'clinic', 'falafel', 'gan', 'home', 'makolet', 'station'],
    );
    const x = (id: string) => PLACES.find((p) => p.id === id)!.x;
    expect(x('home')).toBeGreaterThan(x('makolet'));
    for (const p of PLACES) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(MAP_WIDTH);
      expect(p.y).toBeLessThanOrEqual(MAP_HEIGHT);
    }
  });

  it('says every place name aloud', () => {
    const ids = new Set(voiceLines.map((line) => line.id));
    for (const p of PLACES) expect(ids.has(p.line), p.line).toBe(true);
    expect(ids.has('map.where')).toBe(true);
  });

  it('opens only home and the makolet in phase 0, and nothing is paid', () => {
    const { unlocked } = createNewSave();
    expect(PLACES.filter((p) => isOpen(p.id, unlocked)).map((p) => p.id)).toEqual([
      'home',
      'makolet',
    ]);
    for (const p of PLACES) expect(isPremium(p.id)).toBe(false);
    // A place not unlocked in the save stays shut even once built.
    expect(isOpen('makolet', ['home'])).toBe(false);
  });
});

describe('parents settings', () => {
  it('changes settings without touching the rest, and saves them', () => {
    const store = new GameStore(createNewSave(0));
    let saved = 0;
    const actions = new Actions(store, { schedule: () => (saved += 1) });
    actions.setSettings({ addressGender: 'f', music: 0.2 });
    expect(store.state.settings).toMatchObject({ addressGender: 'f', music: 0.2, voice: 1 });
    expect(saved).toBe(1);
    expect(actions.canUndo('home')).toBe(false);
  });

  it('a reset drops pending changes and stores a new game', async () => {
    const data = new Map<string, unknown>();
    const storage: SaveStorage = {
      get: async (key) => data.get(key),
      set: async (key, value) => void data.set(key, value),
    };
    const saves = new SaveManager(storage, 10_000);
    const played = createNewSave(0);
    played.wallet = 3;
    saves.schedule(() => played);
    await saves.reset();
    await saves.flush();
    const loaded = await saves.load();
    expect(loaded.wallet).toBe(20);
    expect(loaded.letters.every((l) => !l.found)).toBe(true);
  });

  it('can hide niqqud but keeps letters and the maqaf', () => {
    expect(stripNiqqud('שְׁכוּנָה')).toBe('שכונה');
    expect(stripNiqqud('גַּע כְּדֵי לְהַתְחִיל!')).toBe('גע כדי להתחיל!');
    expect(stripNiqqud('בֵּית־סֵפֶר')).toBe('בית־ספר');
  });
});
