import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actions } from '../../src/app/actions';
import { GameStore } from '../../src/app/store';
import { defaultFamily } from '../../src/characters/catalog';
import { createNewSave } from '../../src/engine/SaveManager';
import type { PropInstance } from '../../src/types';

const seed: PropInstance[] = [
  { id: 'a', defId: 'apple', location: 'home', x: 10, y: 20 },
  { id: 'b', defId: 'ball', location: 'makolet', x: 30, y: 40, state: { on: true } },
];

describe('Actions', () => {
  let store: GameStore;
  let actions: Actions;
  const schedule = vi.fn();
  const prop = (id: string) => store.state.props.find((p) => p.id === id);

  beforeEach(() => {
    schedule.mockClear();
    store = new GameStore(createNewSave());
    actions = new Actions(store, { schedule });
    actions.seedProps(seed);
    schedule.mockClear();
  });

  it('moves a prop, schedules a save and notifies subscribers', () => {
    const listener = vi.fn();
    store.subscribe(listener);
    actions.commit('home', [{ id: 'a', x: 100, y: 200 }]);
    expect(prop('a')).toMatchObject({ x: 100, y: 200 });
    expect(schedule).toHaveBeenCalled();
    expect(listener).toHaveBeenCalled();
  });

  it('undoes a move', () => {
    actions.commit('home', [{ id: 'a', x: 100, y: 200 }]);
    actions.undo('home');
    expect(prop('a')).toMatchObject({ x: 10, y: 20 });
    expect(actions.canUndo('home')).toBe(false);
  });

  it('undoes a move and state change together as one step', () => {
    actions.commit('home', [{ id: 'a', x: 100, state: { filled: true } }]);
    actions.undo('home');
    expect(prop('a')?.x).toBe(10);
    expect(prop('a')?.state).toEqual({});
  });

  it('keeps a separate undo history per location', () => {
    actions.commit('home', [{ id: 'a', x: 100 }]);
    actions.commit('makolet', [{ id: 'b', x: 300 }]);
    actions.undo('home');
    expect(prop('a')?.x).toBe(10);
    expect(prop('b')?.x).toBe(300);
  });

  it('records no undo step for a change that changes nothing', () => {
    actions.commit('home', [{ id: 'a', x: 10, y: 20 }]);
    expect(actions.canUndo('home')).toBe(false);
  });

  it('restores the earlier value when a state key is undone', () => {
    actions.commit('makolet', [{ id: 'b', state: { on: false } }]);
    actions.undo('makolet');
    expect(prop('b')?.state).toEqual({ on: true });
  });

  it('undoes the surface a prop rests on, back to the floor', () => {
    actions.commit('home', [{ id: 'a', x: 50, on: 'table' }]);
    expect(prop('a')?.on).toBe('table');
    actions.undo('home');
    expect(prop('a')?.on).toBeUndefined();
  });

  describe('characters', () => {
    const family = defaultFamily();
    const kid = () => store.state.characters.find((c) => c.id === 'family-3');

    beforeEach(() => actions.seedCharacters(family));

    it('seeds the family only into an empty save', () => {
      expect(store.state.characters).toHaveLength(4);
      actions.seedCharacters(family);
      expect(store.state.characters).toHaveLength(4);
    });

    it('undoes lying on the bed as one step', () => {
      actions.commit('home', [{ id: 'family-3', x: 820, y: 380, on: 'bed', pose: 'lie' }]);
      expect(kid()).toMatchObject({ pose: 'lie', on: 'bed' });
      actions.undo('home');
      expect(kid()).toMatchObject({ pose: 'stand', x: 1720 });
      expect(kid()?.on).toBeUndefined();
    });

    it('undoes a change of clothes', () => {
      const before = structuredClone(kid()!.appearance);
      actions.commit('home', [{ id: 'family-3', appearance: { ...before, outfit: 'lilac' } }]);
      expect(kid()?.appearance.outfit).toBe('lilac');
      actions.undo('home');
      expect(kid()?.appearance).toEqual(before);
    });

    it('undoes picking up a prop', () => {
      actions.commit('home', [{ id: 'family-3', holding: 'a' }]);
      actions.undo('home');
      expect(kid()?.holding).toBeUndefined();
    });
  });

  it('seeds only the props a save is missing', () => {
    actions.commit('home', [{ id: 'a', x: 999 }]);
    actions.seedProps(seed);
    expect(store.state.props).toHaveLength(2);
    expect(prop('a')?.x).toBe(999);
  });
});
