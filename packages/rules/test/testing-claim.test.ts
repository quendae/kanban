import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getClaimCostSnapshot,
  getDesignDeck,
  getPlayerGarageCars,
  getTestTrackCars,
  type CarId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

function claimContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'testing-claim-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:1' },
      'car:2': { id: 'car:2', model: 'model:2' },
      'car:3': { id: 'car:3', model: 'model:3' },
      'car:4': { id: 'car:4', model: 'model:4' },
      'car:5': { id: 'car:5', model: 'model:4' },
      'car:6': { id: 'car:6', model: 'model:4' },
    },
    designs: {
      'design:0': { id: 'design:0', model: 'model:0', partType: null, oldestBonus: null },
      'design:1': { id: 'design:1', model: 'model:1', partType: null, oldestBonus: null },
      'design:2': { id: 'design:2', model: 'model:2', partType: null, oldestBonus: null },
      'design:3': { id: 'design:3', model: 'model:3', partType: null, oldestBonus: null },
      'design:4': { id: 'design:4', model: 'model:4', partType: null, oldestBonus: null },
      'design:5': { id: 'design:5', model: 'model:4', partType: null, oldestBonus: null },
    },
    garageBenefits: [
      { kind: 'BOOK', amount: 1 },
      { kind: 'PP', amount: 2 },
      { kind: 'NONE' },
      { kind: 'VOUCHER', amount: 1 },
    ],
  };
}

function claimState(options?: {
  readonly baseShifts?: number;
  readonly bankedShifts?: number;
  readonly garageCapacity?: number;
  readonly garageCars?: readonly { readonly carId: CarId; readonly slot: number }[];
}): GameState {
  const shell = createShellGame({ seed: 'testing-claim', playerCount: 2 });
  const baseShifts = options?.baseShifts ?? 3;
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'BOARD', area: 'test-track', slot: 0 },
    'car:1': { kind: 'BOARD', area: 'test-track', slot: 1 },
    'car:2': { kind: 'BOARD', area: 'test-track', slot: 2 },
    'car:3': { kind: 'BOARD', area: 'test-track', slot: 3 },
    'car:4': { kind: 'SUPPLY' },
    'car:5': { kind: 'SUPPLY' },
    'car:6': { kind: 'SUPPLY' },
  };
  for (const garage of options?.garageCars ?? []) {
    cars[garage.carId] = {
      kind: 'PLAYER',
      playerId: 'player:0',
      area: 'garage',
      slot: garage.slot,
    };
  }

  const designs: Partial<Record<DesignId, EntityLocation>> = {
    'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
    'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
    'design:2': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 2 },
    'design:3': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 3 },
    'design:4': { kind: 'BOARD', area: 'design-deck:central', slot: 0 },
    'design:5': { kind: 'BOARD', area: 'design-deck:central', slot: 1 },
  };

  return {
    ...shell,
    content: claimContent(),
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'TESTING_INNOVATION',
        currentWorkstation: baseShifts === 3 ? 'A_RIGHT' : 'A_LEFT',
        baseShiftsToday: baseShifts,
        bankedShifts: options?.bankedShifts ?? 1,
        garageCapacity: options?.garageCapacity ?? 4,
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
      },
    ],
    board: { ...shell.board, cars, designs },
  };
}

describe('Testing & Innovation — Claim Cars', () => {
  it('snapshots Test Track claim costs before any car moves', () => {
    expect(getClaimCostSnapshot(claimState())).toEqual({
      'car:0': 1,
      'car:1': 2,
      'car:2': 2,
      'car:3': 3,
    });
  });

  it('claims multiple cars using the original snapshot cost, spends matching Designs and compacts the track', () => {
    const result = applyCommand(claimState(), {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [
        { carId: 'car:0', designId: 'design:0', garageSlot: 0 },
        { carId: 'car:2', designId: 'design:2', garageSlot: 1 },
      ],
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    const event = result.events.find((candidate) => candidate.type === 'CARS_CLAIMED');
    expect(event).toMatchObject({ type: 'CARS_CLAIMED', shiftCost: 3 });
    expect(result.state.players[0]?.shiftsSpentToday).toBe(3);
    expect(getPlayerGarageCars(result.state, 'player:0')).toEqual(['car:0', 'car:2']);
    expect(getTestTrackCars(result.state)).toEqual(['car:1', 'car:3']);
    expect(getDesignDeck(result.state, 'central')).toEqual([
      'design:4',
      'design:5',
      'design:0',
      'design:2',
    ]);
    expect(result.state.board.paceCarPosition).toBe(2);
  });

  it('rejects a model/design mismatch and insufficient Shifts', () => {
    const mismatch = applyCommand(claimState(), {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [{ carId: 'car:0', designId: 'design:1', garageSlot: 0 }],
    });
    expect(mismatch.status).toBe('REJECTED');
    if (mismatch.status === 'REJECTED') expect(mismatch.errors).toContain('CLAIM_DESIGN_MODEL_MISMATCH');

    const expensive = applyCommand(claimState({ baseShifts: 2, bankedShifts: 0 }), {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [{ carId: 'car:3', designId: 'design:3', garageSlot: 0 }],
    });
    expect(expensive.status).toBe('REJECTED');
    if (expensive.status === 'REJECTED') expect(expensive.errors).toContain('INSUFFICIENT_SHIFTS');
  });

  it('grants a content-defined benefit only when filling an empty garage slot', () => {
    const result = applyCommand(claimState(), {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [{ carId: 'car:0', designId: 'design:0', garageSlot: 0 }],
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.books).toBe(1);
    expect(result.events.find((event) => event.type === 'CARS_CLAIMED')).toMatchObject({
      garageBenefits: [{ kind: 'BOOK', amount: 1 }],
    });
  });

  it('allows Original replacement only when every available garage is occupied and grants no replacement benefit', () => {
    const full = claimState({
      garageCapacity: 2,
      garageCars: [
        { carId: 'car:4', slot: 0 },
        { carId: 'car:5', slot: 1 },
      ],
    });
    const replacement = applyCommand(full, {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [
        {
          carId: 'car:0',
          designId: 'design:0',
          garageSlot: 0,
          replaceCarId: 'car:4',
        },
      ],
    });

    expect(replacement.status).toBe('ACCEPTED');
    if (replacement.status !== 'ACCEPTED') return;
    expect(replacement.state.board.cars['car:4']).toEqual({ kind: 'SUPPLY' });
    expect(replacement.state.board.cars['car:0']).toEqual({
      kind: 'PLAYER',
      playerId: 'player:0',
      area: 'garage',
      slot: 0,
    });
    expect(replacement.state.players[0]?.books).toBe(0);
    expect(replacement.events.find((event) => event.type === 'CARS_CLAIMED')).toMatchObject({
      garageBenefits: [{ kind: 'NONE' }],
    });

    const early = claimState({
      garageCapacity: 2,
      garageCars: [{ carId: 'car:4', slot: 0 }],
    });
    const rejected = applyCommand(early, {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [
        {
          carId: 'car:1',
          designId: 'design:1',
          garageSlot: 0,
          replaceCarId: 'car:4',
        },
      ],
    });
    expect(rejected.status).toBe('REJECTED');
    if (rejected.status === 'REJECTED') {
      expect(rejected.errors).toContain('GARAGE_REPLACEMENT_TOO_EARLY');
    }
  });

  it('rejects a batch that cannot fit into the currently available garage decisions', () => {
    const state = claimState({
      garageCapacity: 2,
      garageCars: [{ carId: 'car:4', slot: 0 }],
    });
    const result = applyCommand(state, {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [
        { carId: 'car:0', designId: 'design:0', garageSlot: 1 },
        { carId: 'car:1', designId: 'design:1', garageSlot: 1 },
      ],
    });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') expect(result.errors).toContain('GARAGE_DESTINATION_CONFLICT');
  });
});
