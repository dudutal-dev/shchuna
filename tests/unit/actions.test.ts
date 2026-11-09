import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Actions } from '../../src/app/actions';
import { GameStore } from '../../src/app/store';
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

  it('seeds only the props a save is missing', () => {
    actions.commit('home', [{ id: 'a', x: 999 }]);
    actions.seedProps(seed);
    expect(store.state.props).toHaveLength(2);
    expect(prop('a')?.x).toBe(999);
  });
});
