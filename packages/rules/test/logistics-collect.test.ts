import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getLegalCommands,
  getPlayerParts,
  getWarehouseParts,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function logisticsContent(): GameContent {
  const parts = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `part:${index}` as PartId,
      {
        id: `part:${index}` as PartId,
        type: index < 6 ? 'part-type:0' as const : 'part-type:1' as const,
      },
    ]),
  );
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'logistics-test-content',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts,
    designs: {},
    kanbanOrders: {},
  };
}

function workingLogisticsState(): GameState {
  const shell = createShellGame({ seed: 'logistics-collect', playerCount: 2 });
  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 0 },
    'part:1': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 1 },
    'part:2': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 2 },
    'part:6': { kind: 'BOARD', area: 'warehouse:part-type:1', slot: 0 },
    'part:7': { kind: 'BOARD', area: 'warehouse:part-type:1', slot: 1 },
  };
  return {
    ...shell,
    content: logisticsContent(),
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'LOGISTICS',
        currentWorkstation: 'C_LEFT',
        baseShiftsToday: 2,
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
      },
    ],
    board: { ...shell.board, parts },
  };
}

describe('Logistics — Collect Car Parts', () => {
  it('enumerates legal quantities from each non-empty warehouse for the active Logistics worker', () => {
    const state = workingLogisticsState();
    const commands = getLegalCommands(state, 'player:0').filter(
      (command) => command.type === 'COLLECT_PARTS',
    );

    expect(commands).toContainEqual({
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:0',
      quantity: 3,
    });
    expect(commands).toContainEqual({
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:1',
      quantity: 2,
    });
    expect(getLegalCommands(state, 'player:1').some((command) => command.type === 'COLLECT_PARTS')).toBe(false);
  });

  it('takes any positive quantity from one warehouse for exactly 1 Shift', () => {
    const state = workingLogisticsState();
    const result = applyCommand(state, {
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:0',
      quantity: 3,
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual(['PARTS_COLLECTED']);
    expect(result.state.players[0]?.shiftsSpentToday).toBe(1);
    expect(getPlayerParts(result.state, 'player:0')).toEqual(['part:0', 'part:1', 'part:2']);
    expect(getWarehouseParts(result.state, 'part-type:0')).toEqual([]);
    expect(getWarehouseParts(result.state, 'part-type:1')).toEqual(['part:6', 'part:7']);
  });

  it('rejects non-positive quantities, warehouse overdraw and player storage overflow', () => {
    const state = workingLogisticsState();
    for (const quantity of [0, -1, 4]) {
      const result = applyCommand(state, {
        type: 'COLLECT_PARTS',
        actorId: 'player:0',
        partType: 'part-type:0',
        quantity,
      });
      expect(result.status).toBe('REJECTED');
    }

    const occupied: GameState = {
      ...state,
      board: {
        ...state.board,
        parts: {
          ...state.board.parts,
          'part:3': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
          'part:4': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
          'part:5': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 2 },
          'part:6': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 3 },
        },
      },
    };
    const overflow = applyCommand(occupied, {
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:0',
      quantity: 2,
    });
    expect(overflow.status).toBe('REJECTED');
    if (overflow.status === 'REJECTED') expect(overflow.errors).toContain('NO_PART_STORAGE');
  });

  it('rejects collection after all currently usable Shifts are spent', () => {
    const base = workingLogisticsState();
    const state: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'player:0' ? { ...player, shiftsSpentToday: 2 } : player,
      ),
    };
    const result = applyCommand(state, {
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:0',
      quantity: 1,
    });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') expect(result.errors).toContain('INSUFFICIENT_SHIFTS');
  });

  it('supports the certified sixth storage slot', () => {
    const base = workingLogisticsState();
    const state: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'player:0'
          ? { ...player, certifications: ['LOGISTICS'], partCapacity: 6 }
          : player,
      ),
      board: {
        ...base.board,
        parts: {
          ...base.board.parts,
          'part:2': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
          'part:3': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
          'part:4': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 2 },
          'part:5': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 3 },
          'part:6': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 4 },
        },
      },
    };
    const result = applyCommand(state, {
      type: 'COLLECT_PARTS',
      actorId: 'player:0',
      partType: 'part-type:0',
      quantity: 1,
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(getPlayerParts(result.state, 'player:0')).toHaveLength(6);
  });
});
