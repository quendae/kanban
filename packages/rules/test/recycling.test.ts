import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getLegalCommands,
  getPlayerParts,
  getRecyclingParts,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function recyclingContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'recycling-test-content',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
      'part:1': { id: 'part:1', type: 'part-type:1' },
      'part:2': { id: 'part:2', type: 'part-type:2' },
      'part:3': { id: 'part:3', type: 'part-type:3' },
      'part:4': { id: 'part:4', type: 'part-type:0' },
      'part:5': { id: 'part:5', type: 'part-type:4' },
    },
    designs: {},
    kanbanOrders: {},
  };
}

function workingRecyclingState(): GameState {
  const shell = createShellGame({ seed: 'recycling', playerCount: 2 });
  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
    'part:1': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
    'part:2': { kind: 'BOARD', area: 'recycling', slot: 0 },
    'part:3': { kind: 'BOARD', area: 'recycling', slot: 1 },
    'part:4': { kind: 'SUPPLY' },
    'part:5': { kind: 'SUPPLY' },
  };

  return {
    ...shell,
    content: recyclingContent(),
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
        shiftsSpentToday: 2,
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

function swap(
  state: GameState,
  outgoingPartId: PartId,
  incomingPartId: PartId,
) {
  return applyCommand(state, {
    type: 'SWAP_RECYCLING_PART',
    actorId: 'player:0',
    outgoingPartId,
    incomingPartId,
  });
}

describe('Recycling', () => {
  it('offers zero-cost swaps to the active worker regardless of current department', () => {
    const state = workingRecyclingState();
    const legal = getLegalCommands(state, 'player:0').filter(
      (command) => command.type === 'SWAP_RECYCLING_PART',
    );

    expect(legal).toContainEqual({
      type: 'SWAP_RECYCLING_PART',
      actorId: 'player:0',
      outgoingPartId: 'part:0',
      incomingPartId: 'part:2',
    });

    const result = swap(state, 'part:0', 'part:2');
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual(['RECYCLING_PART_SWAPPED']);
    expect(result.state.players[0]?.shiftsSpentToday).toBe(2);
    expect(getPlayerParts(result.state, 'player:0')).toEqual(['part:2', 'part:1']);
    expect(getRecyclingParts(result.state)).toEqual(['part:0', 'part:3']);
  });

  it('allows repeated legal swaps in the same ordinary work turn', () => {
    const first = swap(workingRecyclingState(), 'part:0', 'part:2');
    if (first.status !== 'ACCEPTED') throw new Error(first.errors.join(','));

    const second = swap(first.state, 'part:2', 'part:3');
    expect(second.status).toBe('ACCEPTED');
    if (second.status !== 'ACCEPTED') return;
    expect(second.state.players[0]?.shiftsSpentToday).toBe(2);
    expect(getPlayerParts(second.state, 'player:0')).toEqual(['part:3', 'part:1']);
    expect(getRecyclingParts(second.state)).toEqual(['part:0', 'part:2']);
  });

  it('rejects swaps outside WORK, from a non-active player, or with invalid ownership/location', () => {
    const base = workingRecyclingState();
    const meeting: GameState = { ...base, phase: 'MEETING' };
    const duringMeeting = swap(meeting, 'part:0', 'part:2');
    expect(duringMeeting.status).toBe('REJECTED');
    if (duringMeeting.status === 'REJECTED') expect(duringMeeting.errors).toContain('WRONG_PHASE');

    const nonActive = applyCommand(base, {
      type: 'SWAP_RECYCLING_PART',
      actorId: 'player:1',
      outgoingPartId: 'part:0',
      incomingPartId: 'part:2',
    });
    expect(nonActive.status).toBe('REJECTED');
    if (nonActive.status === 'REJECTED') expect(nonActive.errors).toContain('NOT_ACTIVE_ACTOR');

    const notOwned = swap(base, 'part:4', 'part:2');
    expect(notOwned.status).toBe('REJECTED');
    if (notOwned.status === 'REJECTED') expect(notOwned.errors).toContain('RECYCLING_OUTGOING_NOT_OWNED');

    const notInPool = swap(base, 'part:0', 'part:5');
    expect(notInPool.status).toBe('REJECTED');
    if (notInPool.status === 'REJECTED') expect(notInPool.errors).toContain('RECYCLING_INCOMING_NOT_AVAILABLE');
  });

  it('rejects a swap that would leave duplicate part types in the Recycling pool', () => {
    const base = workingRecyclingState();
    const state: GameState = {
      ...base,
      board: {
        ...base.board,
        parts: {
          ...base.board.parts,
          'part:4': { kind: 'BOARD', area: 'recycling', slot: 2 },
        },
      },
    };

    const result = swap(state, 'part:0', 'part:2');
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') expect(result.errors).toContain('RECYCLING_TYPE_OCCUPIED');
  });
});
