import { describe, expect, it } from 'vitest';
import { isHidden, openSurfaces, resolveDrop, type Surface } from '../../src/engine/DragSystem';

describe('containers', () => {
  const shelf: Surface = { id: 'fridge-1', x: 0, y: 0, width: 100, container: { prop: 'fridge', key: 'open' } };
  const floorShelf: Surface = { id: 'table', x: 0, y: 0, width: 100 };
  const closed = [{ id: 'fridge', state: { open: false } }];
  const open = [{ id: 'fridge', state: { open: true } }];
  const milk = { id: 'milk', on: 'fridge-1' };

  it('offers a container shelf only while it is open', () => {
    expect(openSurfaces([shelf, floorShelf], closed).map((s) => s.id)).toEqual(['table']);
    expect(openSurfaces([shelf, floorShelf], open)).toHaveLength(2);
  });

  it('hides what is inside a closed container', () => {
    expect(isHidden(milk, [shelf], closed)).toBe(true);
    expect(isHidden(milk, [shelf], open)).toBe(false);
    expect(isHidden({ id: 'apple' }, [shelf], closed)).toBe(false);
  });
});

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
