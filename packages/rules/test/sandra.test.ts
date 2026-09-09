import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getSandraPerformanceMetric,
  planSandraAudit,
  planSandraDepartmentTask,
  planSandraVisit,
  reduceEvent,
  type Department,
  type GameState,
} from '../src/index.js';

function withTraining(
  state: GameState,
  department: Department,
  levels: readonly number[],
  banked: readonly number[] = [],
): GameState {
  return {
    ...state,
    players: state.players.map((player, index) => ({
      ...player,
      pp: 10,
      bankedShifts: banked[index] ?? player.bankedShifts,
      training: { ...player.training, [department]: levels[index] ?? 0 },
    })),
  };
}

function metricState(): GameState {
  const shell = createShellGame({ seed: 'sandra-metrics', playerCount: 2 });
  return {
    ...shell,
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? { ...player, certifications: ['DESIGN', 'LOGISTICS'] }
        : player,
    ),
    board: {
      ...shell.board,
      cars: {
        'car:0': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
        'car:1': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 1 },
      },
      parts: {
        'part:0': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
        'part:1': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
      },
      designs: {
        'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
        'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
      },
      designUpgrades: {
        'design:0': { partType: 'part-type:0', doubleUpgrade: false },
        'design:1': { partType: 'part-type:1', doubleUpgrade: false },
      },
    },
  };
}

describe('Original 2014 Sandra', () => {
  it('moves to the first free workstation in the next available department and records the workstation', () => {
    const shell = createShellGame({ seed: 'sandra-move', playerCount: 2 });
    const blockedTesting: GameState = {
      ...shell,
      players: shell.players.map((player, index) => ({
        ...player,
        currentDepartment: 'TESTING_INNOVATION',
        currentWorkstation: index === 0 ? 'A_LEFT' : 'A_RIGHT',
        baseShiftsToday: index === 0 ? 2 : 3,
      })),
    };

    const plan = planSandraVisit(blockedTesting);
    expect(plan.department).toBe('ASSEMBLY');
    expect(plan.workstationId).toBe('B_LEFT');

    const moved = reduceEvent(blockedTesting, {
      id: 'event:0',
      type: 'SANDRA_MOVED',
      department: plan.department,
      workstationId: plan.workstationId,
    });
    expect(moved.sandra.department).toBe('ASSEMBLY');
    expect(moved.sandra.workstation).toBe('B_LEFT');
  });

  it('Nice audits every training leader, ignores stack order and rewards qualifying leaders by Banked Shifts', () => {
    const shell = createShellGame({ seed: 'sandra-nice', playerCount: 4 });
    const trained = withTraining(shell, 'DESIGN', [3, 3, 1, 0], [4, 2, 5, 10]);
    const state: GameState = {
      ...trained,
      sandra: { ...trained.sandra, mode: 'NICE' },
      board: {
        ...trained.board,
        trainingTieOrder: {
          ...trained.board.trainingTieOrder,
          DESIGN: ['player:3', 'player:1', 'player:0', 'player:2'],
        },
        designs: {
          'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
          'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
          'design:2': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 0 },
          'design:3': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 1 },
        },
      },
    };

    const audit = planSandraAudit(state, 'DESIGN');
    expect(audit.auditedPlayerIds).toEqual(['player:0', 'player:1']);
    expect(audit.trainingLevel).toBe(3);
    expect(audit.results).toEqual([
      { playerId: 'player:0', trainingLevel: 3, metric: 2, predicatePassed: true, ppDelta: 4 },
      { playerId: 'player:1', trainingLevel: 3, metric: 2, predicatePassed: true, ppDelta: 2 },
    ]);
  });

  it('Nice gives no evaluation reward when the leading training level is zero', () => {
    const state = createShellGame({ seed: 'sandra-zero-training', playerCount: 3 });
    const audit = planSandraAudit(state, 'LOGISTICS');
    expect(audit.trainingLevel).toBe(0);
    expect(audit.auditedPlayerIds).toEqual([]);
    expect(audit.results).toEqual([]);
  });

  it('Mean audits every training laggard and loses one PP per Banked Shift fewer than five', () => {
    const shell = createShellGame({ seed: 'sandra-mean', playerCount: 4 });
    const trained = withTraining(shell, 'DESIGN', [1, 1, 1, 1], [0, 4, 5, 10]);
    const state: GameState = { ...trained, sandra: { ...trained.sandra, mode: 'MEAN' } };

    const audit = planSandraAudit(state, 'DESIGN');
    expect(audit.auditedPlayerIds).toEqual(['player:0', 'player:1', 'player:2', 'player:3']);
    expect(audit.results.map((result) => result.ppDelta)).toEqual([-5, -1, 0, 0]);

    const reduced = reduceEvent(state, {
      id: 'event:0',
      type: 'SANDRA_AUDIT_RESOLVED',
      department: 'DESIGN',
      mode: 'MEAN',
      results: audit.results,
    });
    expect(reduced.players.map((player) => player.pp)).toEqual([5, 9, 10, 10]);
  });

  it('uses the five Original department performance metrics', () => {
    const state = metricState();
    expect(getSandraPerformanceMetric(state, 'player:0', 'TESTING_INNOVATION')).toBe(2);
    expect(getSandraPerformanceMetric(state, 'player:0', 'ASSEMBLY')).toBe(2);
    expect(getSandraPerformanceMetric(state, 'player:0', 'LOGISTICS')).toBe(2);
    expect(getSandraPerformanceMetric(state, 'player:0', 'DESIGN')).toBe(2);
    expect(getSandraPerformanceMetric(state, 'player:0', 'ADMINISTRATION')).toBe(2);
  });

  it('Testing advances the Pace Car by one and exposes a Meeting threshold crossing', () => {
    const shell = createShellGame({ seed: 'sandra-testing-task', playerCount: 2 });
    const state: GameState = {
      ...shell,
      board: { ...shell.board, paceCarPosition: 3, nextMeetingThreshold: 4 },
    };
    const task = planSandraDepartmentTask(state, 'TESTING_INNOVATION');
    expect(task).toMatchObject({
      kind: 'TESTING',
      previousPaceCarPosition: 3,
      paceCarPosition: 4,
      meetingThresholdCrossed: true,
    });
  });

  it('Assembly returns every part from assembly spaces to supply', () => {
    const shell = createShellGame({ seed: 'sandra-assembly-task', playerCount: 2 });
    const state: GameState = {
      ...shell,
      board: {
        ...shell.board,
        parts: {
          'part:0': { kind: 'BOARD', area: 'assembly:model:0', slot: 0 },
          'part:1': { kind: 'BOARD', area: 'assembly:model:1', slot: 0 },
          'part:2': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 0 },
        },
      },
    };
    const task = planSandraDepartmentTask(state, 'ASSEMBLY');
    expect(task).toEqual({ kind: 'ASSEMBLY', returnedPartIds: ['part:0', 'part:1'] });
  });

  it('Logistics deterministically keeps the slot/ID-first part in each warehouse', () => {
    const shell = createShellGame({ seed: 'sandra-logistics-task', playerCount: 2 });
    const state: GameState = {
      ...shell,
      board: {
        ...shell.board,
        parts: {
          'part:0': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 0 },
          'part:1': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 1 },
          'part:2': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 2 },
          'part:3': { kind: 'BOARD', area: 'warehouse:part-type:1', slot: 1 },
          'part:4': { kind: 'BOARD', area: 'warehouse:part-type:1', slot: 0 },
        },
      },
    };
    const task = planSandraDepartmentTask(state, 'LOGISTICS');
    expect(task).toEqual({ kind: 'LOGISTICS', returnedPartIds: ['part:1', 'part:2', 'part:3'] });
  });

  it('Design returns exactly the four rightmost visible designs to Central and materializes a deterministic shuffle', () => {
    const shell = createShellGame({ seed: 'sandra-design-task', playerCount: 2 });
    const designs = Object.fromEntries([
      ...[0, 1, 2, 3].map((slot) => [`design:${slot}`, { kind: 'BOARD' as const, area: 'design-row:0', slot }]),
      ...[0, 1, 2, 3].map((slot) => [`design:${slot + 4}`, { kind: 'BOARD' as const, area: 'design-row:1', slot }]),
      ['design:8', { kind: 'BOARD' as const, area: 'design-deck:central', slot: 0 }],
    ]);
    const state: GameState = { ...shell, board: { ...shell.board, designs } };

    const first = planSandraDepartmentTask(state, 'DESIGN');
    const second = planSandraDepartmentTask(state, 'DESIGN');
    expect(first).toEqual(second);
    expect(first.kind).toBe('DESIGN');
    if (first.kind !== 'DESIGN') return;
    expect(first.returnedDesignIds).toEqual(['design:3', 'design:7', 'design:2', 'design:6']);
    expect(first.centralDeck).toHaveLength(5);
    expect(new Set(first.centralDeck)).toEqual(new Set(['design:8', 'design:3', 'design:7', 'design:2', 'design:6']));
    expect(first.rng).not.toEqual(state.rng);
  });

  it('resolves Sandra automatically after the last player finishes work and before DAY_ENDED', () => {
    const shell = createShellGame({ seed: 'sandra-end-day', playerCount: 2 });
    const state: GameState = {
      ...shell,
      phase: 'WORK',
      activeActorId: 'player:0',
      workOrder: ['player:1', 'player:0'],
      workCursor: 1,
      players: shell.players.map((player) => {
        if (player.id === 'player:0') {
          return {
            ...player,
            currentDepartment: 'DESIGN',
            currentWorkstation: 'D_LEFT',
            baseShiftsToday: 2,
          };
        }
        return { ...player, done: true };
      }),
    };

    const result = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:0' });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_FINISHED_WORK',
      'SANDRA_MOVED',
      'SANDRA_AUDIT_RESOLVED',
      'SANDRA_DEPARTMENT_TASK_RESOLVED',
      'DAY_ENDED',
    ]);
    expect(result.state.sandra.department).toBe('TESTING_INNOVATION');
    expect(result.state.sandra.workstation).toBe('A_LEFT');
    expect(result.state.board.paceCarPosition).toBe(1);
  });
});
