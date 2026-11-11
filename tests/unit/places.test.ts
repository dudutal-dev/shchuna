import { describe, expect, it } from 'vitest';
import { Actions } from '../../src/app/actions';
import { GameStore } from '../../src/app/store';
import { isOpen, isPremium, MAP_HEIGHT, MAP_WIDTH, PLACES } from '../../src/content/places';
import voiceLines from '../../src/content/voice-lines.json';
import { createNewSave, migrate, SaveManager, type SaveStorage } from '../../src/engine/SaveManager';
import { clinicPeople, defaultFamily, ganPeople } from '../../src/characters/catalog';
import { BENCH_SEAT, clinic } from '../../src/locations/clinic/clinic.data';
import { propDefs } from '../../src/content/props';
import { gan } from '../../src/locations/gan/gan.data';
import { home } from '../../src/locations/home/home.data';
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

  it('opens home, the makolet, the gan and the clinic, and nothing is paid yet', () => {
    const { unlocked } = createNewSave();
    expect(PLACES.filter((p) => isOpen(p.id, unlocked)).map((p) => p.id)).toEqual([
      'home',
      'makolet',
      'gan',
      'clinic',
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

describe('the gan', () => {
  it('opens in a save from before it was built', () => {
    const old = { ...createNewSave(0), version: 1, unlocked: ['home', 'makolet'] };
    expect(migrate(old)?.unlocked).toEqual(['home', 'makolet', 'gan', 'clinic']);
  });

  it('brings its people into a game that already has a family', () => {
    const store = new GameStore(createNewSave(0));
    const actions = new Actions(store, { schedule: () => undefined });
    actions.seedCharacters(defaultFamily());
    actions.seedCharacters([...defaultFamily(), ...ganPeople()]);
    expect(store.state.characters).toHaveLength(7);
    actions.seedCharacters([...defaultFamily(), ...ganPeople(), ...clinicPeople()]);
    expect(store.state.characters).toHaveLength(9);
    expect(store.state.characters.filter((c) => c.location === 'gan')).toHaveLength(3);
  });

  it.each([
    ['gan', gan],
    ['clinic', clinic],
  ])('%s: a voice line for every prop, ids apart from the home', (_name, place) => {
    const ids = new Set(voiceLines.map((line) => line.id));
    const homeIds = new Set(home.props.map((p) => p.id));
    for (const instance of place.props) {
      const def = propDefs[instance.defId];
      expect(def, instance.defId).toBeDefined();
      expect(ids.has(def!.voiceLine), def!.voiceLine).toBe(true);
      expect(homeIds.has(instance.id), instance.id).toBe(false);
      expect(instance.x).toBeGreaterThan(0);
      expect(instance.x).toBeLessThan(place.width);
    }
  });
});

describe('the clinic', () => {
  it('has the patient waiting on the bench, and a doctor', () => {
    const [doctor, patient] = clinicPeople();
    expect(doctor!.appearance.outfit).toBe('whitecoat');
    expect(patient).toMatchObject({ on: 'bench', pose: 'sit', x: BENCH_SEAT.x, y: BENCH_SEAT.y });
  });

  it('rings the bell and fills a cup at the water cooler', () => {
    expect(propDefs.bell!.interactions).toContainEqual({ type: 'pet', sfx: 'ding' });
    expect(propDefs.cup!.interactions).toContainEqual(
      expect.objectContaining({ type: 'useOn', target: 'water-cooler' }),
    );
  });
});
