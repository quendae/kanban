import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { applyCommand, getLegalCommands } from '../src/engine.js';
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

describe('command engine', () => {
  it('exposes START_GAME only to the human during setup', () => {
    const source = createShellGame({ seed: 'legal', playerCount: 3 });

    expect(getLegalCommands(source, 'player:0')).toEqual([
      { type: 'START_GAME', actorId: 'player:0' },
    ]);
    expect(getLegalCommands(source, 'player:1')).toEqual([]);
  });

  it('starts a setup game only for the human actor', () => {
    const source = createShellGame({ seed: 'start', playerCount: 3 });
    const result = applyCommand(source, {
      type: 'START_GAME',
      actorId: 'player:0',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status === 'ACCEPTED') {
      expect(result.events).toEqual([
        { id: 'event:0', type: 'GAME_STARTED' },
      ]);
      expect(result.state.phase).toBe('SELECT_DEPARTMENT');
      expect(result.state.eventIndex).toBe(1);
      expect(source.phase).toBe('SETUP');
    }
  });

  it('rejects START_GAME from a bot without replacing the source state', () => {
    const source = createShellGame({ seed: 'bot-start', playerCount: 3 });
    const result = applyCommand(source, {
      type: 'START_GAME',
      actorId: 'player:1',
    });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.errors).toEqual(['WRONG_ACTOR']);
      expect(result.state).toBe(source);
    }
  });

  it('rejects START_GAME after the setup phase', () => {
    const source = createShellGame({ seed: 'twice', playerCount: 2 });
    const once = applyCommand(source, {
      type: 'START_GAME',
      actorId: 'player:0',
    });

    if (once.status !== 'ACCEPTED') {
      throw new Error('first START_GAME unexpectedly failed');
    }

    const twice = applyCommand(once.state, {
      type: 'START_GAME',
      actorId: 'player:0',
    });

    expect(twice.status).toBe('REJECTED');
    if (twice.status === 'REJECTED') {
      expect(twice.errors).toEqual(['GAME_ALREADY_STARTED']);
      expect(twice.state).toBe(once.state);
    }
  });
});
