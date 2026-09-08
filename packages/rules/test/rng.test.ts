import { describe, expect, it } from 'vitest';
import { createRng, nextInt, nextUint32, shuffle } from '../src/rng.js';

describe('seeded RNG', () => {
  it('replays identical values for the same seed', () => {
    const a0 = createRng('kanban-seed');
    const b0 = createRng('kanban-seed');
    const a1 = nextUint32(a0);
    const b1 = nextUint32(b0);

    expect(a1.value).toBe(b1.value);
    expect(a1.rng).toEqual(b1.rng);
  });

  it('does not mutate the input state', () => {
    const rng = createRng('immutable');
    const snapshot = { ...rng };

    nextUint32(rng);

    expect(rng).toEqual(snapshot);
  });

  it('produces bounded integers', () => {
    const { value } = nextInt(createRng('bounded'), 5);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(5);
  });

  it('rejects invalid integer bounds', () => {
    expect(() => nextInt(createRng('zero'), 0)).toThrow('maxExclusive must be a positive integer');
    expect(() => nextInt(createRng('fraction'), 1.5)).toThrow('maxExclusive must be a positive integer');
  });

  it('shuffles deterministically without changing the source array', () => {
    const source = [1, 2, 3, 4, 5];
    const resultA = shuffle(createRng('shuffle'), source);
    const resultB = shuffle(createRng('shuffle'), source);

    expect(resultA.values).toEqual(resultB.values);
    expect(resultA.rng).toEqual(resultB.rng);
    expect([...resultA.values].sort()).toEqual(source);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });
});
