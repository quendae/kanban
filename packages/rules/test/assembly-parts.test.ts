import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getAssemblyParts,
  getLegalCommands,
  getNeededPartTypes,
  type CarId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function assemblyContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'assembly-parts-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:0' },
      'car:2': { id: 'car:2', model: 'model:1' },
    },
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
      'part:1': { id: 'part:1', type: 'part-type:0' },
      'part:2': { id: 'part:2', type: 'part-type:1' },
      'part:3': { id: 'part:3', type: 'part-type:2' },
      'part:4': { id: 'part:4', type: 'part-type:2' },
      'part:5': { id: 'part:5', type: 'part-type:3' },
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

function workingAssemblyState(options?: {
  readonly completeAtStart?: boolean;
  readonly upgradedPartRequired?: boolean;
  readonly carAvailable?: boolean;
}): GameState {
  const shell = createShellGame({ seed: 'assembly-parts', playerCount: 2 });
  const completeAtStart = options?.completeAtStart ?? false;
  const upgradedPartRequired = options?.upgradedPartRequired ?? false;
  const carAvailable = options?.carAvailable ?? true;

  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': carAvailable
      ? { kind: 'BOARD', area: 'assembly-node:assembly-node:m0:start', slot: 0 }
      : { kind: 'BOARD', area: 'test-track', slot: 0 },
    'car:1': carAvailable ? { kind: 'SUPPLY' } : { kind: 'BOARD', area: 'test-track', slot: 1 },
    'car:2': { kind: 'SUPPLY' },
  };

  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': completeAtStart
      ? { kind: 'BOARD', area: 'assembly:model:0', slot: 0 }
      : { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
    'part:1': completeAtStart
      ? { kind: 'BOARD', area: 'assembly:model:0', slot: 1 }
      : { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
    'part:2': completeAtStart
      ? { kind: 'BOARD', area: 'assembly:model:0', slot: 2 }
      : { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 2 },
    'part:3': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 3 },
    'part:4': upgradedPartRequired
      ? { kind: 'BOARD', area: 'innovation:model:0', slot: 0 }
      : { kind: 'SUPPLY' },
    'part:5': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 4 },
  };

  return {
    ...shell,
    content: assemblyContent(),
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
    board: { ...shell.board, cars, parts },
  };
}

describe('Assembly — turn-start cleanup and Provide Needed Part', () => {
  it('offers physical part delivery to the active Assembly worker for 1 Shift', () => {
    const state = workingAssemblyState();
    const command = {
      type: 'PROVIDE_ASSEMBLY_PART' as const,
      actorId: 'player:0' as const,
      model: 'model:0' as const,
      partId: 'part:0' as const,
    };

    expect(getLegalCommands(state, 'player:0')).toContainEqual(command);
    const result = applyCommand(state, command);

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.shiftsSpentToday).toBe(1);
    expect(result.state.board.parts['part:0']).toEqual({
      kind: 'BOARD',
      area: 'assembly:model:0',
      slot: 0,
    });
    expect(getAssemblyParts(result.state, 'model:0')).toEqual(['part:0']);
  });

  it('rejects duplicate part types and enforces upgraded part types before ordinary types', () => {
    const base = workingAssemblyState();
    const first = applyCommand(base, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
    });
    if (first.status !== 'ACCEPTED') throw new Error(first.errors.join(','));

    const duplicate = applyCommand(first.state, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:1',
    });
    expect(duplicate.status).toBe('REJECTED');
    if (duplicate.status === 'REJECTED') {
      expect(duplicate.errors).toContain('ASSEMBLY_PART_TYPE_ALREADY_PRESENT');
    }

    const upgraded = workingAssemblyState({ upgradedPartRequired: true });
    expect(getNeededPartTypes(upgraded, 'model:0')).toEqual(['part-type:2']);
    const ordinaryFirst = applyCommand(upgraded, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
    });
    expect(ordinaryFirst.status).toBe('REJECTED');
    if (ordinaryFirst.status === 'REJECTED') {
      expect(ordinaryFirst.errors).toContain('ASSEMBLY_UPGRADED_PARTS_REQUIRED_FIRST');
    }
  });

  it('treats a real Testing design upgrade as the Assembly upgraded-part requirement', () => {
    const base = workingAssemblyState();
    const state: GameState = {
      ...base,
      content: {
        ...base.content,
        designs: {
          'design:0': {
            id: 'design:0',
            model: 'model:0',
            partType: 'part-type:2',
            oldestBonus: null,
          },
        },
        upgradeSpaces: {
          'upgrade-space:0': {
            id: 'upgrade-space:0',
            model: 'model:0',
            partType: 'part-type:2',
            benefit: { kind: 'NONE' },
          },
        },
      },
      board: {
        ...base.board,
        parts: {
          ...base.board.parts,
          'part:4': { kind: 'BOARD', area: 'upgrade-space:0', slot: 0 },
        },
        designs: {
          'design:0': {
            kind: 'PLAYER',
            playerId: 'player:0',
            area: 'blueprints',
            slot: 0,
          },
        },
        designUpgrades: {
          'design:0': { partType: 'part-type:2', doubleUpgrade: false },
        },
      },
    };

    expect(getNeededPartTypes(state, 'model:0')).toEqual(['part-type:2']);
    const ordinaryFirst = applyCommand(state, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
    });
    expect(ordinaryFirst.status).toBe('REJECTED');
    if (ordinaryFirst.status === 'REJECTED') {
      expect(ordinaryFirst.errors).toContain('ASSEMBLY_UPGRADED_PARTS_REQUIRED_FIRST');
    }
  });

  it('clears every full Assembly model to supply before resolving the first Assembly Shift action', () => {
    const state = workingAssemblyState({ completeAtStart: true });
    const result = applyCommand(state, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:5',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual([
      'ASSEMBLY_SPACES_CLEARED',
      'ASSEMBLY_PART_PROVIDED',
      'ASSEMBLY_CAR_CHAIN_RESOLVED',
    ]);
    expect(result.state.board.parts['part:0']).toEqual({ kind: 'SUPPLY' });
    expect(result.state.board.parts['part:1']).toEqual({ kind: 'SUPPLY' });
    expect(result.state.board.parts['part:2']).toEqual({ kind: 'SUPPLY' });
    expect(result.state.board.parts['part:5']).toEqual({
      kind: 'BOARD',
      area: 'assembly:model:0',
      slot: 0,
    });
  });

  it('rejects part delivery when the start node is empty and no matching model car remains in supply', () => {
    const state = workingAssemblyState({ carAvailable: false });
    const result = applyCommand(state, {
      type: 'PROVIDE_ASSEMBLY_PART',
      actorId: 'player:0',
      model: 'model:0',
      partId: 'part:0',
    });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') {
      expect(result.errors).toContain('ASSEMBLY_CAR_NOT_AVAILABLE');
    }
  });
});
