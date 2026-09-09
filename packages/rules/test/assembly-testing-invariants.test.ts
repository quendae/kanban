import { describe, expect, it } from 'vitest';
import {
  MODEL_IDS,
  PART_TYPE_IDS,
  createShellGame,
  getInvariantViolations,
  type CarId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
  type PartTypeId,
} from '../src/index.js';

function invariantContent(): GameContent {
  return {
    id: 'assembly-testing-invariant-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
      'part:1': { id: 'part:1', type: 'part-type:1' },
      'part:2': { id: 'part:2', type: 'part-type:0' },
    },
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:1' },
    },
    designs: {
      'design:0': {
        id: 'design:0',
        model: 'model:0',
        partType: 'part-type:0',
        oldestBonus: null,
      },
      'design:1': {
        id: 'design:1',
        model: 'model:0',
        partType: 'part-type:0',
        oldestBonus: null,
      },
    },
    kanbanOrders: {},
    demands: {},
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
    garageBenefits: [],
    upgradeSpaces: {
      'upgrade-space:0': {
        id: 'upgrade-space:0',
        model: 'model:0',
        partType: 'part-type:0',
        benefit: { kind: 'NONE' },
      },
      'upgrade-space:1': {
        id: 'upgrade-space:1',
        model: 'model:0',
        partType: 'part-type:1',
        benefit: { kind: 'NONE' },
      },
    },
    testingRules: {
      testTrackCapacity: 4,
      maxPartValue: 6,
      claimCostByPosition: [1, 2, 2, 3],
      meetingThresholds: [4, 8, 12],
    },
  };
}

function baseState(): GameState {
  const shell = createShellGame({ seed: 'assembly-testing-invariants', playerCount: 2 });
  return {
    ...shell,
    content: invariantContent(),
    board: {
      ...shell.board,
      cars: {
        'car:0': { kind: 'BOARD', area: 'test-track', slot: 0 },
        'car:1': { kind: 'SUPPLY' },
      },
      parts: {
        'part:0': { kind: 'SUPPLY' },
        'part:1': { kind: 'SUPPLY' },
        'part:2': { kind: 'SUPPLY' },
      },
      designs: {
        'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
        'design:1': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 0 },
      },
      designUpgrades: {},
      partValues: Object.fromEntries(PART_TYPE_IDS.map((type) => [type, 0])) as GameState['board']['partValues'],
      doubleUpgradedPartTypes: {},
    },
  };
}

function codes(state: GameState): readonly string[] {
  return getInvariantViolations(state).map((violation) => violation.code);
}

describe('M3 Assembly + Testing conservation invariants', () => {
  it('starts from an invariant-clean fixture', () => {
    expect(getInvariantViolations(baseState())).toEqual([]);
  });

  it('rejects a non-compact Test Track order even while below capacity', () => {
    const state = baseState();
    const cars: Partial<Record<CarId, EntityLocation>> = {
      ...state.board.cars,
      'car:0': { kind: 'BOARD', area: 'test-track', slot: 1 },
    };

    expect(codes({ ...state, board: { ...state.board, cars } })).toContain(
      'INVALID_TEST_TRACK_ORDER',
    );
  });

  it('rejects garage occupancy outside the owning player capacity', () => {
    const state = baseState();
    const cars: Partial<Record<CarId, EntityLocation>> = {
      ...state.board.cars,
      'car:1': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 99 },
    };

    expect(codes({ ...state, board: { ...state.board, cars } })).toContain(
      'INVALID_GARAGE_OCCUPANCY',
    );
  });

  it('rejects an extraneous global part-value key outside the content manifest', () => {
    const state = baseState();
    const unknownPartType = 'part-type:99' as PartTypeId;
    const partValues = { ...state.board.partValues, [unknownPartType]: 1 };

    expect(codes({ ...state, board: { ...state.board, partValues } })).toContain(
      'INVALID_PART_VALUE',
    );
  });

  it('rejects an Assembly location for a model with no graph definition', () => {
    const state = baseState();
    const cars: Partial<Record<CarId, EntityLocation>> = {
      ...state.board.cars,
      'car:1': { kind: 'BOARD', area: 'assembly:model:99', slot: 0 },
    };

    expect(codes({ ...state, board: { ...state.board, cars } })).toContain(
      'INVALID_ASSEMBLY_LOCATION',
    );
  });

  it('rejects more than one physical Part in the same Upgrade Space', () => {
    const state = baseState();
    const parts: Partial<Record<PartId, EntityLocation>> = {
      ...state.board.parts,
      'part:0': { kind: 'BOARD', area: 'upgrade-space:0', slot: 0 },
      'part:2': { kind: 'BOARD', area: 'upgrade-space:0', slot: 0 },
    };

    expect(codes({ ...state, board: { ...state.board, parts } })).toContain(
      'INVALID_INNOVATION_OCCUPANCY',
    );
  });

  it('rejects a double-upgrade reservation owned by a different player than the upgraded Design', () => {
    const state = baseState();
    const designs: Partial<Record<DesignId, EntityLocation>> = {
      ...state.board.designs,
      'design:0': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 1 },
    };
    const parts: Partial<Record<PartId, EntityLocation>> = {
      ...state.board.parts,
      'part:0': { kind: 'BOARD', area: 'upgrade-space:0', slot: 0 },
    };

    const corrupted: GameState = {
      ...state,
      players: state.players.map((player) =>
        player.id === 'player:1' ? { ...player, doubleUpgradeUsed: true } : player,
      ),
      board: {
        ...state.board,
        designs,
        parts,
        designUpgrades: {
          'design:0': { partType: 'part-type:0', doubleUpgrade: true },
        },
        doubleUpgradedPartTypes: { 'part-type:0': 'player:0' },
      },
    };

    expect(codes(corrupted)).toContain('DOUBLE_UPGRADE_OWNERSHIP_CONFLICT');
  });
});
