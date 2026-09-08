import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { applyCommand } from '../src/engine.js';
import { getInvariantViolations, InvariantError } from '../src/invariants.js';

describe('core invariants', () => {
  it('accepts a fresh shell state', () => {
    const state = createShellGame({ seed: 'valid', playerCount: 4 });

    expect(getInvariantViolations(state)).toEqual([]);
  });

  it('rejects shifts above the daily maximum', () => {
    const state = createShellGame({ seed: 'shifts', playerCount: 2 });
    const broken = {
      ...state,
      players: [
        { ...state.players[0]!, shiftsSpentToday: 5 },
        state.players[1]!,
      ],
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'SHIFT_LIMIT_EXCEEDED',
    );
  });

  it('rejects duplicate player IDs', () => {
    const state = createShellGame({ seed: 'ids', playerCount: 2 });
    const broken = {
      ...state,
      players: [
        state.players[0]!,
        { ...state.players[1]!, id: 'player:0' as const },
      ],
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'DUPLICATE_PLAYER_ID',
    );
  });

  it('rejects negative banked shifts', () => {
    const state = createShellGame({ seed: 'bank', playerCount: 2 });
    const broken = {
      ...state,
      players: [
        { ...state.players[0]!, bankedShifts: -1 },
        state.players[1]!,
      ],
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'NEGATIVE_BANKED_SHIFTS',
    );
  });

  it('rejects invalid clocks and event indices', () => {
    const state = createShellGame({ seed: 'clocks', playerCount: 2 });
    const broken = {
      ...state,
      week: 4,
      productionCycle: -1,
      eventIndex: 1.5,
    };
    const codes = getInvariantViolations(broken).map((violation) => violation.code);

    expect(codes).toContain('INVALID_WEEK');
    expect(codes).toContain('INVALID_PRODUCTION_CYCLE');
    expect(codes).toContain('INVALID_EVENT_INDEX');
  });

  it('rejects player-count mismatches', () => {
    const state = createShellGame({ seed: 'players', playerCount: 3 });
    const broken = {
      ...state,
      players: state.players.slice(0, 2),
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'PLAYER_COUNT_MISMATCH',
    );
  });

  it('does not return an accepted state if reduction leaves an invariant violation', () => {
    const state = createShellGame({ seed: 'engine-guard', playerCount: 2 });
    const broken = {
      ...state,
      players: [
        { ...state.players[0]!, shiftsSpentToday: 5 },
        state.players[1]!,
      ],
    };

    expect(() =>
      applyCommand(broken, { type: 'START_GAME', actorId: 'player:0' }),
    ).toThrow(InvariantError);
  });
});
