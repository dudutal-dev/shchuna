import { describe, expect, it } from 'vitest';
import { resolveDrop, type Surface } from '../../src/engine/DragSystem';

const table: Surface = { id: 'table', x: 100, y: 300, width: 200 };
const shelf: Surface = { id: 'shelf', x: 100, y: 120, width: 200 };
const floor = { top: 430, bottom: 560 };
const WIDTH = 1000;

describe('resolveDrop', () => {
  it('snaps to a surface within 80px', () => {
    expect(resolveDrop({ x: 150, y: 370 }, [table], floor, WIDTH)).toEqual({
      x: 150,
      y: 300,
      surfaceId: 'table',
    });
  });

  it('snaps sideways onto the end of a surface', () => {
    const drop = resolveDrop({ x: 360, y: 300 }, [table], floor, WIDTH);
    expect(drop).toEqual({ x: 300, y: 300, surfaceId: 'table' });
  });

  it('prefers the closer of two surfaces', () => {
    const drop = resolveDrop({ x: 150, y: 170 }, [table, shelf], floor, WIDTH);
    expect(drop.surfaceId).toBe('shelf');
  });

  it('falls onto the surface below when dropped high above it', () => {
    const drop = resolveDrop({ x: 150, y: 50 }, [table], floor, WIDTH);
    expect(drop.surfaceId).toBe('table');
  });

  it('falls to the floor when nothing is near or below', () => {
    expect(resolveDrop({ x: 600, y: 100 }, [table], floor, WIDTH)).toEqual({
      x: 600,
      y: 430,
      surfaceId: null,
    });
  });

  it('stays where it was dropped on the floor band', () => {
    expect(resolveDrop({ x: 600, y: 500 }, [table], floor, WIDTH).y).toBe(500);
  });

  it('can never leave the world', () => {
    const drop = resolveDrop({ x: -500, y: 5000 }, [], floor, WIDTH);
    expect(drop.x).toBeGreaterThan(0);
    expect(drop.y).toBe(floor.bottom);
    expect(resolveDrop({ x: 5000, y: 500 }, [], floor, WIDTH).x).toBeLessThan(WIDTH);
  });

  it('picks the nearest slot on a slotted surface', () => {
    const slotted: Surface = { ...table, slots: [120, 200, 280] };
    expect(resolveDrop({ x: 215, y: 300 }, [slotted], floor, WIDTH).x).toBe(200);
  });
});
