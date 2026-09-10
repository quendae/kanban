import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getLegalCommands,
  type Department,
  type GameState,
} from '../src/index.js';

function workingState(options?: {
  readonly department?: Department;
  readonly trainingLevel?: number;
  readonly books?: number;
  readonly secondPlayerLevel?: number;
}): GameState {
  const shell = createShellGame({ seed: 'hr-actions', playerCount: 2 });
  const department = options?.department ?? 'DESIGN';
  const station = department === 'ADMINISTRATION' ? 'E_RIGHT' : 'D_RIGHT';
  const baseShifts = department === 'ADMINISTRATION' ? 2 : 3;

  return {
    ...shell,
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: department,
        currentWorkstation: station,
        baseShiftsToday: baseShifts,
        books: options?.books ?? 0,
        training: {
          ...shell.players[0]!.training,
          [department]: options?.trainingLevel ?? 0,
        },
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'LOGISTICS',
        currentWorkstation: 'C_LEFT',
        baseShiftsToday: 2,
        training: {
          ...shell.players[1]!.training,
          [department]: options?.secondPlayerLevel ?? 0,
        },
      },
    ],
  };
}

describe('Human Resources — training, Books and certification', () => {
  it('offers Shift training in the current department and spends exactly 1 Shift', () => {
    const state = workingState();
    const command = {
      type: 'TRAIN_DEPARTMENT' as const,
      actorId: 'player:0' as const,
      department: 'DESIGN' as const,
      source: 'SHIFT' as const,
    };

    expect(getLegalCommands(state, 'player:0')).toContainEqual(command);
    const result = applyCommand(state, command);

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.training.DESIGN).toBe(1);
    expect(result.state.players[0]?.shiftsSpentToday).toBe(1);
    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'TRAINING_ADVANCED',
        playerId: 'player:0',
        department: 'DESIGN',
        fromLevel: 0,
        toLevel: 1,
        source: 'SHIFT',
      }),
    );
  });

  it('uses a Book for +1 training without spending a Shift and rejects Book training without a Book', () => {
    const command = {
      type: 'TRAIN_DEPARTMENT' as const,
      actorId: 'player:0' as const,
      department: 'DESIGN' as const,
      source: 'BOOK' as const,
    };

    const result = applyCommand(workingState({ books: 2 }), command);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.training.DESIGN).toBe(1);
    expect(result.state.players[0]?.books).toBe(1);
    expect(result.state.players[0]?.shiftsSpentToday).toBe(0);

    const rejected = applyCommand(workingState({ books: 0 }), command);
    expect(rejected.status).toBe('REJECTED');
    if (rejected.status === 'REJECTED') {
      expect(rejected.errors).toContain('TRAINING_BOOK_REQUIRED');
    }
  });

  it('does not allow a normal worker to train a different department', () => {
    const result = applyCommand(workingState(), {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'LOGISTICS',
      source: 'SHIFT',
    });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.errors).toContain('TRAINING_WRONG_DEPARTMENT');
    }
  });

  it('puts the newly arriving disc ahead of existing discs on the same training level', () => {
    const state = workingState({ secondPlayerLevel: 1 });
    const result = applyCommand(state, {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'DESIGN',
      source: 'SHIFT',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.board.trainingTieOrder.DESIGN.slice(0, 2)).toEqual([
      'player:0',
      'player:1',
    ]);
  });

  it('certifies exactly once when crossing the certification level', () => {
    const state = workingState({ trainingLevel: 3 });
    const first = applyCommand(state, {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'DESIGN',
      source: 'SHIFT',
    });

    expect(first.status).toBe('ACCEPTED');
    if (first.status !== 'ACCEPTED') return;
    expect(first.state.players[0]?.certifications).toEqual(['DESIGN']);
    expect(first.state.players[0]?.certificationPosition).toBe(1);
    expect(first.events.filter((event) => event.type === 'PLAYER_CERTIFIED')).toHaveLength(1);

    const second = applyCommand(first.state, {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'DESIGN',
      source: 'SHIFT',
    });
    expect(second.status).toBe('ACCEPTED');
    if (second.status !== 'ACCEPTED') return;
    expect(second.state.players[0]?.certifications).toEqual(['DESIGN']);
    expect(second.state.players[0]?.certificationPosition).toBe(1);
    expect(second.events.filter((event) => event.type === 'PLAYER_CERTIFIED')).toHaveLength(0);
  });

  it('unlocks the fifth conference Seat as face-down when Administration is certified', () => {
    const state = workingState({ department: 'ADMINISTRATION', trainingLevel: 3 });
    const result = applyCommand(state, {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'ADMINISTRATION',
      source: 'SHIFT',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.conferenceSeatsFaceUp).toBe(1);
    expect(result.state.players[0]?.conferenceSeatsFaceDown).toBe(4);
  });
});
