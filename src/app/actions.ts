import { UndoStack } from '../engine/UndoStack';
import type {
  Character,
  CharacterAppearance,
  LocationId,
  PropInstance,
  PropState,
  SaveGame,
} from '../types';
import type { GameStore } from './store';

/**
 * One entity's change: a prop or a character, found by id. A state key set to
 * undefined is removed; null for `on` or `holding` clears it.
 */
export interface EntityChange {
  id: string;
  x?: number;
  y?: number;
  /** The surface it now rests on; null for the floor. */
  on?: string | null;
  /** Props only. */
  state?: PropState;
  /** Characters only. */
  pose?: Character['pose'];
  holding?: string | null;
  appearance?: CharacterAppearance;
}


interface Saver {
  schedule(snapshot: () => SaveGame): void;
}

type Entity = PropInstance | Character;

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Every game change goes through here, so undo and saving work in one place. */
export class Actions {
  private readonly stacks = new Map<LocationId, UndoStack<EntityChange[]>>();

  constructor(
    private readonly store: GameStore,
    private readonly saver: Saver,
  ) {}

  private stack(location: LocationId): UndoStack<EntityChange[]> {
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
  commit(location: LocationId, changes: EntityChange[]): void {
    const inverse = changes.flatMap((change) => this.invert(change));
    if (inverse.length === 0) return;
    // Later changes must be undone first when two touch the same entity.
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

  /** Gives a new game its family. Not undoable, and never runs again once there are characters. */
  seedCharacters(seed: readonly Character[]): void {
    if (this.store.state.characters.length > 0) return;
    this.store.update((state) => {
      state.characters.push(...structuredClone(seed));
    });
    this.save();
  }

  private find(state: SaveGame, id: string): Entity | undefined {
    return state.props.find((p) => p.id === id) ?? state.characters.find((c) => c.id === id);
  }

  private invert(change: EntityChange): EntityChange[] {
    const entity = this.find(this.store.state, change.id);
    if (!entity) return [];
    const inverse: EntityChange = { id: change.id };
    let changed = false;
    if (change.x !== undefined && change.x !== entity.x) {
      inverse.x = entity.x;
      changed = true;
    }
    if (change.y !== undefined && change.y !== entity.y) {
      inverse.y = entity.y;
      changed = true;
    }
    if (change.on !== undefined && change.on !== (entity.on ?? null)) {
      inverse.on = entity.on ?? null;
      changed = true;
    }
    if (change.state && 'defId' in entity) {
      const previous: PropState = {};
      for (const [key, value] of Object.entries(change.state)) {
        if (entity.state?.[key] === value) continue;
        previous[key] = entity.state?.[key];
        changed = true;
      }
      inverse.state = previous;
    }
    if ('appearance' in entity) {
      if (change.pose !== undefined && change.pose !== entity.pose) {
        inverse.pose = entity.pose;
        changed = true;
      }
      if (change.holding !== undefined && change.holding !== (entity.holding ?? null)) {
        inverse.holding = entity.holding ?? null;
        changed = true;
      }
      if (change.appearance !== undefined && !same(change.appearance, entity.appearance)) {
        inverse.appearance = structuredClone(entity.appearance);
        changed = true;
      }
    }
    return changed ? [inverse] : [];
  }

  private apply(changes: EntityChange[]): void {
    this.store.update((state) => {
      for (const change of changes) {
        const entity = this.find(state, change.id);
        if (!entity) continue;
        if (change.x !== undefined) entity.x = change.x;
        if (change.y !== undefined) entity.y = change.y;
        if (change.on === null) delete entity.on;
        else if (change.on !== undefined) entity.on = change.on;
        if ('defId' in entity && change.state) {
          const next: PropState = { ...entity.state };
          for (const [key, value] of Object.entries(change.state)) {
            if (value === undefined) delete next[key];
            else next[key] = value;
          }
          entity.state = next;
        }
        if ('appearance' in entity) {
          if (change.pose !== undefined) entity.pose = change.pose;
          if (change.holding === null) delete entity.holding;
          else if (change.holding !== undefined) entity.holding = change.holding;
          if (change.appearance !== undefined) entity.appearance = structuredClone(change.appearance);
        }
      }
    });
    this.save();
  }

  private save(): void {
    this.saver.schedule(() => this.store.state);
  }
}
