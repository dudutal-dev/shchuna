import { get, set } from 'idb-keyval';
import type { HebrewLetter, SaveGame } from '../types';

export const SAVE_VERSION = 5;
export const SAVE_DEBOUNCE_MS = 2000;
const SAVE_KEY = 'shchuna.save';
const BACKUP_KEY = 'shchuna.save.unreadable';

const LETTERS: HebrewLetter[] = [
  'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'כ',
  'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ', 'ק', 'ר', 'ש', 'ת',
];

export interface SaveStorage {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

const idbStorage: SaveStorage = { get: (key) => get(key), set: (key, value) => set(key, value) };

export function createNewSave(now: number = Date.now()): SaveGame {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    updatedAt: now,
    characters: [],
    props: [],
    letters: LETTERS.map((letter) => ({ letter, found: false, timesHeard: 0 })),
    wallet: 20,
    settings: { music: 0.5, voice: 1, sfx: 0.8, showNiqqud: true, addressGender: 'm' },
    unlocked: ['home', 'makolet', 'gan', 'clinic', 'falafel', 'beach'],
  };
}

type RawSave = Record<string, unknown>;
export type Migrations = Record<number, (save: RawSave) => RawSave>;

/** A place newly built opens in saves made before it. */
function unlock(save: RawSave, place: string): RawSave {
  const unlocked = Array.isArray(save.unlocked) ? (save.unlocked as string[]) : [];
  return { ...save, unlocked: unlocked.includes(place) ? unlocked : [...unlocked, place] };
}

/** Each entry upgrades a save from version N to N + 1. */
const MIGRATIONS: Migrations = {
  // 1 → 2: the gan opens.
  1: (save) => unlock(save, 'gan'),
  // 2 → 3: the clinic opens.
  2: (save) => unlock(save, 'clinic'),
  // 3 → 4: the falafel stand opens.
  3: (save) => unlock(save, 'falafel'),
  // 4 → 5: the beach opens.
  4: (save) => unlock(save, 'beach'),
};

function isSaveShape(value: RawSave): boolean {
  return (
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.wallet === 'number' &&
    Array.isArray(value.characters) &&
    Array.isArray(value.props) &&
    Array.isArray(value.letters) &&
    Array.isArray(value.unlocked) &&
    typeof value.settings === 'object' &&
    value.settings !== null
  );
}

/** Upgrades a stored value to the current schema, or returns null if it can't be read. */
export function migrate(
  raw: unknown,
  migrations: Migrations = MIGRATIONS,
  currentVersion: number = SAVE_VERSION,
): SaveGame | null {
  if (typeof raw !== 'object' || raw === null) return null;
  let save = raw as RawSave;
  if (typeof save.version !== 'number' || save.version > currentVersion) return null;
  try {
    while ((save.version as number) < currentVersion) {
      const from = save.version as number;
      const step = migrations[from];
      if (!step) return null;
      save = { ...step(save), version: from + 1 };
    }
  } catch {
    return null;
  }
  return isSaveShape(save) ? (save as unknown as SaveGame) : null;
}

export class SaveManager {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: (() => SaveGame) | undefined;

  constructor(
    private readonly storage: SaveStorage = idbStorage,
    private readonly debounceMs: number = SAVE_DEBOUNCE_MS,
  ) {}

  /** Never throws: a child must always get a playable game. */
  async load(): Promise<SaveGame> {
    let raw: unknown;
    try {
      raw = await this.storage.get(SAVE_KEY);
    } catch (error) {
      console.warn('Save storage unavailable', error);
      return createNewSave();
    }
    if (raw === undefined) return createNewSave();
    const save = migrate(raw);
    if (save) return save;
    console.warn('Unreadable save, starting fresh and keeping a backup');
    await this.write(BACKUP_KEY, raw);
    return createNewSave();
  }

  /** Saves `snapshot()` once changes have settled. */
  schedule(snapshot: () => SaveGame): void {
    this.pending = snapshot;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  /** Saves any scheduled change right away. */
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    const snapshot = this.pending;
    this.pending = undefined;
    if (snapshot) await this.write(SAVE_KEY, snapshot());
  }

  /** Starts over (the parents' reset): drops any pending save and stores a new game. */
  async reset(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = undefined;
    await this.write(SAVE_KEY, createNewSave());
  }

  private async write(key: string, value: unknown): Promise<void> {
    try {
      await this.storage.set(key, value);
    } catch (error) {
      console.warn('Could not save', error);
    }
  }
}
