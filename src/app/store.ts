import type { SaveGame } from '../types';

type Listener = () => void;

/** The single global game state. Change it through `actions`, not directly. */
export class GameStore {
  private readonly listeners = new Set<Listener>();

  constructor(private current: SaveGame) {}

  get state(): SaveGame {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(mutate: (state: SaveGame) => void): void {
    mutate(this.current);
    this.current.updatedAt = Date.now();
    for (const listener of this.listeners) listener();
  }
}
