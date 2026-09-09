import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  createShellGame,
  getActiveDemands,
  getAssemblyCars,
  getAssemblyParts,
  getInvariantViolations,
  getPlayerGarageCars,
  getTestTrackCars,
  getUpgradeParts,
  type AssemblyNodeId,
  type CarId,
  type DemandId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function m3Content(): GameContent {
  const cars = Object.fromEntries(
    Array.from({ length: 14 }, (_, index) => {
      const id = `car:${index}` as CarId;
      return [id, { id, model: MODEL_IDS[index % MODEL_IDS.length]! }];
    }),
  );

  return {
    ...EMPTY_GAME_CONTENT,
    id: 'm3-state-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
      'part:1': { id: 'part:1', type: 'part-type:1' },
    },
    cars,
    designs: {},
    kanbanOrders: {},
    demands: {
      'demand:0': { id: 'demand:0', model: 'model:0', redSeatCount: 2 },
      'demand:1': { id: 'demand:1', model: 'model:1', redSeatCount: 1 },
      'demand:2': { id: 'demand:2', model: 'model:2', redSeatCount: 2 },
    },
    assemblyGraph: {
      models: {
        'model:0': {
          startNodeId: 'assembly-node:m0:start',
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
          assemblySlots: 2,
        },
      },
    },
    upgradeSpaces: {},
    testingRules: {
      testTrackCapacity: 4,
      maxPartValue: 6,
      claimCostByPosition: [1, 2, 2, 3],
      meetingThresholds: [4, 8, 12],
    },
  };
}

function m3State(): GameState {
  const shell = createShellGame({ seed: 'm3-state', playerCount: 2 });
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'BOARD', area: 'assembly:model:0', slot: 0 },
    'car:1': { kind: 'SUPPLY' },
    'car:10': { kind: 'BOARD', area: 'test-track', slot: 0 },
    'car:11': { kind: 'BOARD', area: 'test-track', slot: 1 },
    'car:12': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
    'car:13': { kind: 'SUPPLY' },
  };
  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': { kind: 'BOARD', area: 'assembly:model:0', slot: 0 },
    'part:1': { kind: 'BOARD', area: 'innovation:model:0', slot: 0 },
  };

  return {
    ...shell,
    content: m3Content(),
    board: {
      ...shell.board,
      cars,
      parts,
      partValues: Object.fromEntries(PART_TYPE_IDS.map((type) => [type, 0])),
      activeDemands: [
        { demandId: 'demand:0', redSeatsRemaining: 2 },
        { demandId: 'demand:1', redSeatsRemaining: 1 },
      ],
      demandDeck: ['demand:2'],
      paceCarPosition: 0,
      nextMeetingThreshold: 4,
      doubleUpgradedPartTypes: {},
    },
  };
}

describe('M3 state foundations', () => {
  it('stores physical cars and exposes deterministic assembly, test-track and garage queries', () => {
    const state = m3State();

    expect(state.content.cars['car:0']?.model).toBe('model:0');
    expect(state.content.assemblyGraph.models['model:0']?.startNodeId).toBe(
      'assembly-node:m0:start',
    );
    expect(getAssemblyCars(state, 'model:0')).toEqual(['car:0']);
    expect(getAssemblyParts(state, 'model:0')).toEqual(['part:0']);
    expect(getTestTrackCars(state)).toEqual(['car:10', 'car:11']);
    expect(getPlayerGarageCars(state, 'player:0')).toEqual(['car:12']);
    expect(getUpgradeParts(state, 'model:0')).toEqual(['part:1']);
    expect(getActiveDemands(state)).toEqual([
      { demandId: 'demand:0', redSeatsRemaining: 2 },
      { demandId: 'demand:1', redSeatsRemaining: 1 },
    ]);
    expect(state.board.partValues['part-type:0']).toBe(0);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('rejects Test Track overflow, duplicate garage slots, invalid part values and unknown assembly nodes', () => {
    const base = m3State();

    const overflow: GameState = {
      ...base,
      board: {
        ...base.board,
        cars: {
          ...base.board.cars,
          'car:2': { kind: 'BOARD', area: 'test-track', slot: 2 },
          'car:3': { kind: 'BOARD', area: 'test-track', slot: 3 },
          'car:4': { kind: 'BOARD', area: 'test-track', slot: 4 },
        },
      },
    };
    expect(getInvariantViolations(overflow).map((item) => item.code)).toContain(
      'TEST_TRACK_CAPACITY_EXCEEDED',
    );

    const duplicateGarage: GameState = {
      ...base,
      board: {
        ...base.board,
        cars: {
          ...base.board.cars,
          'car:13': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
        },
      },
    };
    expect(getInvariantViolations(duplicateGarage).map((item) => item.code)).toContain(
      'DUPLICATE_GARAGE_SLOT',
    );

    const invalidPartValue: GameState = {
      ...base,
      board: {
        ...base.board,
        partValues: { ...base.board.partValues, 'part-type:0': 7 },
      },
    };
    expect(getInvariantViolations(invalidPartValue).map((item) => item.code)).toContain(
      'INVALID_PART_VALUE',
    );

    const unknownNode = 'assembly-node:m0:missing' as AssemblyNodeId;
    const unknownAssemblyLocation: GameState = {
      ...base,
      board: {
        ...base.board,
        cars: {
          ...base.board.cars,
          'car:0': { kind: 'BOARD', area: `assembly-node:${unknownNode}`, slot: 0 },
        },
      },
    };
    expect(getInvariantViolations(unknownAssemblyLocation).map((item) => item.code)).toContain(
      'INVALID_ASSEMBLY_LOCATION',
    );
  });

  it('keeps opaque demand and assembly-node identifiers serializable', () => {
    const demandId: DemandId = 'demand:0';
    const nodeId: AssemblyNodeId = 'assembly-node:m0:start';
    expect(JSON.stringify({ demandId, nodeId })).toBe(
      '{"demandId":"demand:0","nodeId":"assembly-node:m0:start"}',
    );
  });
});
