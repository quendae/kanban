import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  type CarId,
  type DemandId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

const demandIds = ['demand:0', 'demand:1', 'demand:2', 'demand:3', 'demand:4'] as const satisfies readonly DemandId[];

function demandContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'demand-test-content',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:0' },
    },
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
    },
    demands: {
      'demand:0': { id: 'demand:0', model: 'model:0', redSeatCount: 1 },
      'demand:1': { id: 'demand:1', model: 'model:1', redSeatCount: 1 },
      'demand:2': { id: 'demand:2', model: 'model:2', redSeatCount: 2 },
      'demand:3': { id: 'demand:3', model: 'model:3', redSeatCount: 1 },
      'demand:4': { id: 'demand:4', model: 'model:4', redSeatCount: 1 },
    },
    assemblyGraph: {
      models: {
        'model:0': {
          startNodeId: 'assembly-node:m0:start',
          assemblySlots: 1,
          nodes: {
            'assembly-node:m0:start': {
              id: 'assembly-node:m0:start',
              kind: 'START',
              next: [{ to: 'assembly-node:m0:exit' }],
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

function demandState(options?: {
  readonly active?: readonly { readonly demandId: DemandId; readonly redSeatsRemaining: number }[];
  readonly deck?: readonly DemandId[];
  readonly discard?: readonly DemandId[];
  readonly seed?: string;
}): GameState {
  const shell = createShellGame({ seed: options?.seed ?? 'demand-seed', playerCount: 2 });
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:start', slot: 0 },
    'car:1': { kind: 'SUPPLY' },
  };

  return {
    ...shell,
    content: demandContent(),
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
      activeDemands: options?.active ?? [
        { demandId: 'demand:0', redSeatsRemaining: 1 },
        { demandId: 'demand:1', redSeatsRemaining: 1 },
      ],
      demandDeck: options?.deck ?? ['demand:2', 'demand:3'],
      demandDiscard: options?.discard ?? [],
    },
  };
}

function finish(state: GameState) {
  return applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:0' });
}

describe('Assembly Demand rewards and refresh', () => {
  it('consumes one matching Red Seat only when the supplied part completes that model', () => {
    const matching = applyCommand(demandState(), {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
    });

    expect(matching.status).toBe('ACCEPTED');
    if (matching.status !== 'ACCEPTED') return;
    expect(matching.events.map((event) => event.type)).toContain('DEMAND_RED_SEAT_CONSUMED');
    expect(matching.state.board.activeDemands[0]).toEqual({
      demandId: 'demand:0',
      redSeatsRemaining: 0,
    });
    expect(matching.state.players[0]?.genericRedSeats).toBe(1);

    const nonMatching = applyCommand(
      demandState({ active: [{ demandId: 'demand:1', redSeatsRemaining: 1 }] }),
      {
        type: 'PROVIDE_ASSEMBLY_PART',
        actorId: 'player:0',
        model: 'model:0',
        partId: 'part:0',
      },
    );
    expect(nonMatching.status).toBe('ACCEPTED');
    if (nonMatching.status !== 'ACCEPTED') return;
    expect(nonMatching.state.board.activeDemands[0]?.redSeatsRemaining).toBe(1);
    expect(nonMatching.state.players[0]?.genericRedSeats).toBe(0);
  });

  it('replaces exhausted Demands only at the end of the Assembly worker turn', () => {
    const state = demandState({
      active: [
        { demandId: 'demand:0', redSeatsRemaining: 0 },
        { demandId: 'demand:1', redSeatsRemaining: 1 },
      ],
      deck: ['demand:2', 'demand:3'],
      discard: ['demand:4'],
    });

    expect(state.board.activeDemands[0]?.demandId).toBe('demand:0');
    const result = finish(state);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events.map((event) => event.type)).toContain('DEMANDS_REFRESHED');
    expect(result.state.board.activeDemands).toEqual([
      { demandId: 'demand:2', redSeatsRemaining: 2 },
      { demandId: 'demand:1', redSeatsRemaining: 1 },
    ]);
    expect(result.state.board.demandDeck[0]).toBe('demand:3');
    expect(result.state.board.demandDiscard).toEqual([]);
    expect(new Set(result.state.board.demandDeck.slice(1))).toEqual(
      new Set<DemandId>(['demand:4', 'demand:0']),
    );
  });

  it('draws all simultaneous replacements from the current deck before recycling discards', () => {
    const state = demandState({
      active: [
        { demandId: 'demand:0', redSeatsRemaining: 0 },
        { demandId: 'demand:1', redSeatsRemaining: 0 },
      ],
      deck: ['demand:2', 'demand:3'],
      discard: [],
    });
    const result = finish(state);

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.board.activeDemands).toEqual([
      { demandId: 'demand:2', redSeatsRemaining: 2 },
      { demandId: 'demand:3', redSeatsRemaining: 1 },
    ]);
    expect(new Set(result.state.board.demandDeck)).toEqual(
      new Set<DemandId>(['demand:0', 'demand:1']),
    );
  });

  it('handles an empty Demand deck by recycling after the initial draw phase', () => {
    const state = demandState({
      active: [{ demandId: 'demand:0', redSeatsRemaining: 0 }],
      deck: [],
      discard: ['demand:2'],
      seed: 'empty-demand-deck',
    });
    const result = finish(state);

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.board.activeDemands).toHaveLength(1);
    expect(result.state.board.demandDeck).toHaveLength(1);
    expect(
      new Set([
        result.state.board.activeDemands[0]!.demandId,
        result.state.board.demandDeck[0]!,
      ]),
    ).toEqual(new Set<DemandId>(['demand:0', 'demand:2']));
    expect(result.state.board.demandDiscard).toEqual([]);
  });

  it('produces identical recycle order and RNG state from the same seed', () => {
    const options = {
      active: [
        { demandId: demandIds[0], redSeatsRemaining: 0 },
        { demandId: demandIds[1], redSeatsRemaining: 0 },
      ],
      deck: [demandIds[2]] as const,
      discard: [demandIds[3], demandIds[4]] as const,
      seed: 'deterministic-demand-refresh',
    } as const;

    const first = finish(demandState(options));
    const second = finish(demandState(options));
    expect(first.status).toBe('ACCEPTED');
    expect(second.status).toBe('ACCEPTED');
    if (first.status !== 'ACCEPTED' || second.status !== 'ACCEPTED') return;

    expect(first.state.board.activeDemands).toEqual(second.state.board.activeDemands);
    expect(first.state.board.demandDeck).toEqual(second.state.board.demandDeck);
    expect(first.state.board.demandDiscard).toEqual(second.state.board.demandDiscard);
    expect(first.state.rng).toEqual(second.state.rng);
  });
});
