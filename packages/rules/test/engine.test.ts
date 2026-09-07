import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { reduceEvent } from '../src/reducer.js';

describe('reduceEvent', () => {
  it('applies GAME_STARTED without mutating the source state', () => {
    const source = createShellGame({ seed: 'event', playerCount: 2 });
    const next = reduceEvent(source, {
      id: 'event:0',
      type: 'GAME_STARTED',
    });

    expect(source.phase).toBe('SETUP');
    expect(source.eventIndex).toBe(0);
    expect(next.phase).toBe('SELECT_DEPARTMENT');
    expect(next.eventIndex).toBe(1);
    expect(next).not.toBe(source);
  });
});
