import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';

describe('createShellGame', () => {
  it('round-trips through JSON without information loss', () => {
    const state = createShellGame({ seed: 'json', playerCount: 4 });

    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('creates one human and the remaining seats as bots', () => {
    const state = createShellGame({ seed: 'seats', playerCount: 4 });

    expect(state.players.map((player) => player.kind)).toEqual([
      'HUMAN',
      'BOT',
      'BOT',
      'BOT',
    ]);
    expect(state.players.map((player) => player.id)).toEqual([
      'player:0',
      'player:1',
      'player:2',
      'player:3',
    ]);
  });

  it('starts from the Original 2014 setup shell', () => {
    const state = createShellGame({ seed: 'original', playerCount: 2 });

    expect(state.ruleset).toBe('KANBAN_AR_2014');
    expect(state.phase).toBe('SETUP');
    expect(state.week).toBe(0);
    expect(state.productionCycle).toBe(0);
    expect(state.eventIndex).toBe(0);
    expect(state.sandra.department).toBe('SANDRA_DESK');
  });

  it('rejects a blank seed', () => {
    expect(() => createShellGame({ seed: '   ', playerCount: 2 })).toThrow(
      'Seed must not be blank',
    );
  });
});
