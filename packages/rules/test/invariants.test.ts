import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { applyCommand } from '../src/engine.js';
import { getInvariantViolations, InvariantError } from '../src/invariants.js';
import type { GameState } from '../src/model.js';

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

  it('rejects two players occupying the same workstation', () => {
    const state = createShellGame({ seed: 'duplicate-workstation', playerCount: 2 });
    const broken: GameState = {
      ...state,
      players: state.players.map((player) => ({
        ...player,
        currentWorkstation: 'A_LEFT',
        currentDepartment: 'TESTING_INNOVATION',
        baseShiftsToday: 2,
      })),
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'DUPLICATE_WORKSTATION',
    );
  });

  it('rejects selection and work cursors outside their sequence bounds', () => {
    const state = createShellGame({ seed: 'cursors', playerCount: 3 });
    const broken: GameState = {
      ...state,
      selectionCursor: state.selectionOrder.length + 1,
      workCursor: -1,
    };
    const codes = getInvariantViolations(broken).map((violation) => violation.code);

    expect(codes).toContain('INVALID_SELECTION_CURSOR');
    expect(codes).toContain('INVALID_WORK_CURSOR');
  });

  it('rejects duplicate or incomplete player identities in work order during WORK', () => {
    const state = createShellGame({ seed: 'work-order', playerCount: 3 });
    const broken: GameState = {
      ...state,
      phase: 'WORK',
      workOrder: ['player:0', 'player:0', 'player:2'],
      workCursor: 0,
      activeActorId: 'player:0',
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'INVALID_WORK_ORDER',
    );
  });

  it('rejects workstation and department mismatch', () => {
    const state = createShellGame({ seed: 'department-mismatch', playerCount: 2 });
    const broken: GameState = {
      ...state,
      players: [
        {
          ...state.players[0]!,
          currentWorkstation: 'C_RIGHT',
          currentDepartment: 'DESIGN',
          baseShiftsToday: 3,
        },
        state.players[1]!,
      ],
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'WORKSTATION_DEPARTMENT_MISMATCH',
    );
  });

  it('rejects base Shifts that do not match the selected workstation', () => {
    const state = createShellGame({ seed: 'base-shifts', playerCount: 2 });
    const broken: GameState = {
      ...state,
      players: [
        {
          ...state.players[0]!,
          currentWorkstation: 'E_LEFT',
          currentDepartment: 'ADMINISTRATION',
          baseShiftsToday: 2,
        },
        state.players[1]!,
      ],
    };

    expect(getInvariantViolations(broken).map((violation) => violation.code)).toContain(
      'INVALID_BASE_SHIFTS',
    );
  });
});
