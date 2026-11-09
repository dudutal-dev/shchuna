import { UndoStack } from '../engine/UndoStack';
import type { LocationId, PropInstance, PropState, SaveGame } from '../types';
import type { GameStore } from './store';

/** One prop's change. A state key set to undefined is removed. */
export interface PropChange {
  id: string;
  x?: number;
  y?: number;
  state?: PropState;
}

interface Saver {
  schedule(snapshot: () => SaveGame): void;
}

/** Every game change goes through here, so undo and saving work in one place. */
export class Actions {
  private readonly stacks = new Map<LocationId, UndoStack<PropChange[]>>();

  constructor(
    private readonly store: GameStore,
    private readonly saver: Saver,
  ) {}

  private stack(location: LocationId): UndoStack<PropChange[]> {
    let stack = this.stacks.get(location);
    if (!stack) {
      stack = new UndoStack();
      this.stacks.set(location, stack);
    }
    return stack;
  }

  canUndo(location: LocationId): boolean {
    return this.stack(location).canUndo;
  }

  /** Applies the changes as one undo step. */
  commit(location: LocationId, changes: PropChange[]): void {
    const inverse = changes.flatMap((change) => this.invert(change));
    if (inverse.length === 0) return;
    // Later changes must be undone first when two touch the same prop.
    this.stack(location).push(inverse.reverse());
    this.apply(changes);
  }

  undo(location: LocationId): void {
    const inverse = this.stack(location).undo();
    if (inverse) this.apply(inverse);
  }

  /** Adds any seed props this save doesn't have yet. Not undoable. */
  seedProps(seed: readonly PropInstance[]): void {
    const known = new Set(this.store.state.props.map((prop) => prop.id));
    const missing = seed.filter((prop) => !known.has(prop.id));
    if (missing.length === 0) return;
    this.store.update((state) => {
      state.props.push(...structuredClone(missing));
    });
    this.save();
  }

  private invert(change: PropChange): PropChange[] {
    const prop = this.store.state.props.find((p) => p.id === change.id);
    if (!prop) return [];
    const inverse: PropChange = { id: change.id };
    let changed = false;
    if (change.x !== undefined && change.x !== prop.x) {
      inverse.x = prop.x;
      changed = true;
    }
    if (change.y !== undefined && change.y !== prop.y) {
      inverse.y = prop.y;
      changed = true;
    }
    if (change.state) {
      const previous: PropState = {};
      for (const [key, value] of Object.entries(change.state)) {
        if (prop.state?.[key] === value) continue;
        previous[key] = prop.state?.[key];
        changed = true;
      }
      inverse.state = previous;
    }
    return changed ? [inverse] : [];
  }

  private apply(changes: PropChange[]): void {
    this.store.update((state) => {
      for (const change of changes) {
        const prop = state.props.find((p) => p.id === change.id);
        if (!prop) continue;
        if (change.x !== undefined) prop.x = change.x;
        if (change.y !== undefined) prop.y = change.y;
        if (change.state) {
          const next: PropState = { ...prop.state };
          for (const [key, value] of Object.entries(change.state)) {
            if (value === undefined) delete next[key];
            else next[key] = value;
          }
          prop.state = next;
        }
      }
    });
    this.save();
  }

  private save(): void {
    this.saver.schedule(() => this.store.state);
  }
}
