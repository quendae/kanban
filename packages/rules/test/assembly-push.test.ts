import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getTestTrackCars,
  planAssemblyPush,
  type CarId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

function straightContent(exitPP: 1 | 2 = 2): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: `assembly-push-${exitPP}`,
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:0' },
      'car:2': { id: 'car:2', model: 'model:0' },
      'car:3': { id: 'car:3', model: 'model:1' },
      'car:4': { id: 'car:4', model: 'model:2' },
      'car:5': { id: 'car:5', model: 'model:3' },
      'car:6': { id: 'car:6', model: 'model:4' },
    },
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
    },
    assemblyGraph: {
      models: {
        'model:0': {
          startNodeId: 'assembly-node:m0:start',
          assemblySlots: 3,
          nodes: {
            'assembly-node:m0:start': {
              id: 'assembly-node:m0:start',
              kind: 'START',
              next: [{ to: 'assembly-node:m0:mid' }],
            },
            'assembly-node:m0:mid': {
              id: 'assembly-node:m0:mid',
              kind: 'CONVEYOR',
              next: [{ to: 'assembly-node:m0:exit', exitPP }],
            },
            'assembly-node:m0:exit': {
              id: 'assembly-node:m0:exit',
              kind: 'EXIT',
              next: [],
            },
          },
        },
      },
    },
  };
}

function branchContent(): GameContent {
  const base = straightContent(1);
  return {
    ...base,
    id: 'assembly-branch',
    assemblyGraph: {
      models: {
        'model:0': {
          startNodeId: 'assembly-node:m0:start',
          assemblySlots: 3,
          nodes: {
            'assembly-node:m0:start': {
              id: 'assembly-node:m0:start',
              kind: 'START',
              next: [
                { to: 'assembly-node:m0:left' },
                { to: 'assembly-node:m0:right' },
              ],
            },
            'assembly-node:m0:left': {
              id: 'assembly-node:m0:left',
              kind: 'CONVEYOR',
              next: [{ to: 'assembly-node:m0:exit', exitPP: 1 }],
            },
            'assembly-node:m0:right': {
              id: 'assembly-node:m0:right',
              kind: 'CONVEYOR',
              next: [{ to: 'assembly-node:m0:exit', exitPP: 2 }],
            },
            'assembly-node:m0:exit': {
              id: 'assembly-node:m0:exit',
              kind: 'EXIT',
              next: [],
            },
          },
        },
      },
    },
  };
}

function workingState(options?: {
  readonly content?: GameContent;
  readonly withFrontCar?: boolean;
  readonly withSupplyCar?: boolean;
  readonly fullTestTrack?: boolean;
}): GameState {
  const shell = createShellGame({ seed: 'assembly-push', playerCount: 2 });
  const content = options?.content ?? straightContent();
  const withFrontCar = options?.withFrontCar ?? true;
  const withSupplyCar = options?.withSupplyCar ?? true;
  const fullTestTrack = options?.fullTestTrack ?? false;

  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:start', slot: 0 },
    'car:1': withFrontCar
      ? { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:mid', slot: 0 }
      : { kind: 'SUPPLY' },
    'car:2': withSupplyCar ? { kind: 'SUPPLY' } : { kind: 'BOARD', area: 'test-track', slot: 3 },
    'car:3': fullTestTrack ? { kind: 'BOARD', area: 'test-track', slot: 0 } : { kind: 'SUPPLY' },
    'car:4': fullTestTrack ? { kind: 'BOARD', area: 'test-track', slot: 1 } : { kind: 'SUPPLY' },
    'car:5': fullTestTrack ? { kind: 'BOARD', area: 'test-track', slot: 2 } : { kind: 'SUPPLY' },
    'car:6': fullTestTrack ? { kind: 'BOARD', area: 'test-track', slot: 3 } : { kind: 'SUPPLY' },
  };

  return {
    ...shell,
    content,
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'ASSEMBLY',
        currentWorkstation: 'B_LEFT',
        baseShiftsToday: 2,
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
      },
    ],
    board: {
      ...shell.board,
      cars,
      parts: {
        'part:0': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
      },
    },
  };
}

describe('Assembly car push planner', () => {
  it('moves the start car one node and deterministically refills the start from supply', () => {
    const state = workingState({ withFrontCar: false });
    const plan = planAssemblyPush(state, 'model:0', []);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ppAwarded).toBe(0);
    expect(plan.moves).toContainEqual(
      expect.objectContaining({
        carId: 'car:0',
        to: { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:mid', slot: 0 },
      }),
    );
    expect(plan.moves).toContainEqual(
      expect.objectContaining({
        carId: 'car:1',
        to: { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:start', slot: 0 },
      }),
    );
  });

  it('requires an explicit valid branch choice and follows the chosen edge', () => {
    const state = workingState({ content: branchContent(), withFrontCar: false });
    const missing = planAssemblyPush(state, 'model:0', []);
    expect(missing).toMatchObject({ ok: false, reason: 'PATH_CHOICE_REQUIRED' });

    const chosen = planAssemblyPush(state, 'model:0', ['assembly-node:m0:right']);
    expect(chosen.ok).toBe(true);
    if (!chosen.ok) return;
    expect(chosen.moves).toContainEqual(
      expect.objectContaining({
        carId: 'car:0',
        to: { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:right', slot: 0 },
      }),
    );
  });

  it('pushes an occupied chain, records 1/2 PP from graph exit content, and can leave start empty with no supply', () => {
    const twoPoint = planAssemblyPush(workingState({ withSupplyCar: false }), 'model:0', []);
    expect(twoPoint.ok).toBe(true);
    if (!twoPoint.ok) return;
    expect(twoPoint.ppAwarded).toBe(2);
    expect(twoPoint.moves.some((move) => move.reason === 'SUPPLY_REFILL')).toBe(false);

    const onePoint = planAssemblyPush(
      workingState({ content: straightContent(1), withSupplyCar: false }),
      'model:0',
      [],
    );
    expect(onePoint.ok).toBe(true);
    if (!onePoint.ok) return;
    expect(onePoint.ppAwarded).toBe(1);
  });

  it('resolves a 5th Test Track car by returning the pre-existing car directly behind Pace Car to supply', () => {
    const state = workingState({ fullTestTrack: true });
    const result = applyCommand(state, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
      pathChoices: [],
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toContain('ASSEMBLY_CAR_CHAIN_RESOLVED');
    expect(result.state.players[0]?.pp).toBe(2);
    expect(getTestTrackCars(result.state)).toHaveLength(4);
    expect(result.state.board.cars['car:3']).toEqual({ kind: 'SUPPLY' });
    expect(result.state.board.cars['car:1']).toEqual({ kind: 'BOARD', area: 'test-track', slot: 3 });
    expect(result.state.board.cars['car:0']).toEqual({
      kind: 'BOARD',
      area: 'assembly-node:assembly-node:m0:mid',
      slot: 0,
    });
  });
});
