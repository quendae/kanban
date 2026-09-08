import { describe, expect, it } from 'vitest';
import { makeId } from '../src/ids.js';

describe('makeId', () => {
  it('creates deterministic namespaced IDs', () => {
    expect(makeId('player', 0)).toBe('player:0');
    expect(makeId('car', 17)).toBe('car:17');
  });

  it('rejects negative indices', () => {
    expect(() => makeId('event', -1)).toThrow('Invalid ID index: -1');
  });

  it('rejects non-integer indices', () => {
    expect(() => makeId('design', 1.5)).toThrow('Invalid ID index: 1.5');
  });
});
