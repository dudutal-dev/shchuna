import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewSave,
  migrate,
  SAVE_VERSION,
  SaveManager,
  type SaveStorage,
} from '../../src/engine/SaveManager';

function memoryStorage(initial: Record<string, unknown> = {}): SaveStorage & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };
  return {
    data,
    get: async (key) => data[key],
    set: async (key, value) => {
      data[key] = structuredClone(value);
    },
  };
}

describe('SaveManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts a new game when nothing is stored', async () => {
    const save = await new SaveManager(memoryStorage()).load();
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.letters).toHaveLength(22);
  });

  it('round-trips through storage', async () => {
    const storage = memoryStorage();
    const manager = new SaveManager(storage);
    const save = createNewSave();
    save.wallet = 7;
    manager.schedule(() => save);
    await manager.flush();
    expect((await new SaveManager(storage).load()).wallet).toBe(7);
  });

  it('waits 2 seconds after the last change', async () => {
    const storage = memoryStorage();
    const set = vi.spyOn(storage, 'set');
    const manager = new SaveManager(storage);
    const save = createNewSave();
    manager.schedule(() => save);
    await vi.advanceTimersByTimeAsync(1500);
    manager.schedule(() => save);
    await vi.advanceTimersByTimeAsync(1500);
    expect(set).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('flush does nothing when no change is pending', async () => {
    const storage = memoryStorage();
    const set = vi.spyOn(storage, 'set');
    await new SaveManager(storage).flush();
    expect(set).not.toHaveBeenCalled();
  });

  it.each([
    ['a string', 'garbage'],
    ['a shapeless object', { version: SAVE_VERSION, wallet: 'lots' }],
    ['a version from the future', { ...createNewSave(), version: SAVE_VERSION + 1 }],
  ])('starts fresh and keeps a backup when the save is %s', async (_name, stored) => {
    const storage = memoryStorage({ 'shchuna.save': stored });
    const save = await new SaveManager(storage).load();
    expect(save.props).toEqual([]);
    expect(storage.data['shchuna.save.unreadable']).toEqual(stored);
  });

  it('survives storage that throws', async () => {
    const broken: SaveStorage = {
      get: () => Promise.reject(new Error('blocked')),
      set: () => Promise.reject(new Error('blocked')),
    };
    const manager = new SaveManager(broken);
    const save = await manager.load();
    expect(save.version).toBe(SAVE_VERSION);
    manager.schedule(() => save);
    await expect(manager.flush()).resolves.toBeUndefined();
  });
});

describe('migrate', () => {
  it('runs each step in order up to the current version', () => {
    const migrated = migrate(
      { ...createNewSave(), version: 1, wallet: 1 },
      {
        1: (save) => ({ ...save, wallet: (save.wallet as number) + 10 }),
        2: (save) => ({ ...save, wallet: (save.wallet as number) * 2 }),
      },
      3,
    );
    expect(migrated?.version).toBe(3);
    expect(migrated?.wallet).toBe(22);
  });

  it('returns null when a step is missing or throws', () => {
    const save = { ...createNewSave(), version: 1 };
    expect(migrate(save, {}, 2)).toBeNull();
    expect(
      migrate(
        save,
        {
          1: () => {
            throw new Error('bad');
          },
        },
        2,
      ),
    ).toBeNull();
  });
});
