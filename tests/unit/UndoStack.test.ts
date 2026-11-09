import { describe, expect, it } from 'vitest';
import { UNDO_LIMIT, UndoStack } from '../../src/engine/UndoStack';

describe('UndoStack', () => {
  it('undoes the most recent step first', () => {
    const stack = new UndoStack<number>();
    stack.push(1);
    stack.push(2);
    expect(stack.undo()).toBe(2);
    expect(stack.undo()).toBe(1);
  });

  it('returns undefined when empty', () => {
    const stack = new UndoStack<number>();
    expect(stack.canUndo).toBe(false);
    expect(stack.undo()).toBeUndefined();
  });

  it('keeps only the last 20 steps', () => {
    const stack = new UndoStack<number>();
    for (let i = 1; i <= 25; i++) stack.push(i);
    expect(stack.size).toBe(UNDO_LIMIT);
    let last: number | undefined;
    while (stack.canUndo) last = stack.undo();
    expect(last).toBe(6);
  });
});
