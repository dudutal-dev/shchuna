export const UNDO_LIMIT = 20;

/** Bounded LIFO: pushing past the limit forgets the oldest step. */
export class UndoStack<T> {
  private readonly items: T[] = [];

  constructor(private readonly limit: number = UNDO_LIMIT) {}

  get size(): number {
    return this.items.length;
  }

  get canUndo(): boolean {
    return this.items.length > 0;
  }

  push(item: T): void {
    this.items.push(item);
    if (this.items.length > this.limit) this.items.shift();
  }

  undo(): T | undefined {
    return this.items.pop();
  }

  clear(): void {
    this.items.length = 0;
  }
}
