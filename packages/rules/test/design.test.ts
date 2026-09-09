import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getDesignDeck,
  getDesignRow,
  getLegalCommands,
  getPlayerDesigns,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

function designContent(): GameContent {
  const designs = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `design:${index}` as DesignId,
      {
        id: `design:${index}` as DesignId,
        model: MODEL_IDS[index % MODEL_IDS.length]!,
        partType: index % 2 === 0 ? null : PART_TYPE_IDS[index % PART_TYPE_IDS.length]!,
        oldestBonus: index === 3 ? 'BOOK' as const : null,
      },
    ]),
  );

  return {
    ...EMPTY_GAME_CONTENT,
    id: 'design-test-content',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts: {},
    designs,
    kanbanOrders: {},
  };
}

function workingDesignState(): GameState {
  const shell = createShellGame({ seed: 'design-flow', playerCount: 2 });
  const locations: Partial<Record<DesignId, EntityLocation>> = {
    'design:0': { kind: 'BOARD', area: 'design-row:0', slot: 0 },
    'design:1': { kind: 'BOARD', area: 'design-row:0', slot: 1 },
    'design:2': { kind: 'BOARD', area: 'design-row:0', slot: 2 },
    'design:3': { kind: 'BOARD', area: 'design-row:0', slot: 3 },
    'design:4': { kind: 'BOARD', area: 'design-deck:row0', slot: 0 },
    'design:5': { kind: 'BOARD', area: 'design-deck:row0', slot: 1 },
    'design:6': { kind: 'BOARD', area: 'design-deck:central', slot: 0 },
    'design:7': { kind: 'BOARD', area: 'design-deck:row1', slot: 0 },
  };

  return {
    ...shell,
    content: designContent(),
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'LOGISTICS',
        currentWorkstation: 'C_LEFT',
        baseShiftsToday: 2,
      },
    ],
    board: { ...shell.board, designs: locations },
  };
}

function accepted(state: GameState, command: Parameters<typeof applyCommand>[1]): GameState {
  const result = applyCommand(state, command);
  expect(result.status).toBe('ACCEPTED');
  if (result.status !== 'ACCEPTED') throw new Error(result.errors.join(','));
  return result.state;
}

describe('Design Department', () => {
  it('offers a Design selection only to the active worker currently in Design', () => {
    const state = workingDesignState();

    expect(getLegalCommands(state, 'player:0').map((command) => command.type)).toContain(
      'START_DESIGN_SELECTION',
    );
    expect(getLegalCommands(state, 'player:1').map((command) => command.type)).not.toContain(
      'START_DESIGN_SELECTION',
    );
  });

  it('spends 1 Shift per tile and does not replenish the display between picks', () => {
    const state = workingDesignState();
    const started = accepted(state, { type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    const first = accepted(started, {
      type: 'TAKE_DESIGN',
      actorId: 'player:0',
      designId: 'design:1',
    });

    expect(first.players[0]?.shiftsSpentToday).toBe(1);
    expect(getPlayerDesigns(first, 'player:0')).toEqual(['design:1']);
    expect(getDesignRow(first, 0)).toEqual(['design:0', 'design:2', 'design:3']);
    expect(getDesignDeck(first, 'row0')).toEqual(['design:4', 'design:5']);

    const second = accepted(first, {
      type: 'TAKE_DESIGN',
      actorId: 'player:0',
      designId: 'design:3',
    });
    expect(second.players[0]?.shiftsSpentToday).toBe(2);
    expect(getDesignRow(second, 0)).toEqual(['design:0', 'design:2']);
    expect(getDesignDeck(second, 'row0')).toEqual(['design:4', 'design:5']);
    expect(second.players[0]?.books).toBe(0);
    expect(second.pendingRewards).toContainEqual({
      playerId: 'player:0',
      type: 'BOOK',
      amount: 1,
    });
  });

  it('compacts toward the oldest/right side and replenishes only when the selection ends', () => {
    let state = workingDesignState();
    state = accepted(state, { type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    state = accepted(state, { type: 'TAKE_DESIGN', actorId: 'player:0', designId: 'design:1' });
    state = accepted(state, { type: 'TAKE_DESIGN', actorId: 'player:0', designId: 'design:3' });

    const ended = applyCommand(state, { type: 'END_DESIGN_SELECTION', actorId: 'player:0' });
    expect(ended.status).toBe('ACCEPTED');
    if (ended.status !== 'ACCEPTED') return;

    expect(ended.events.map((event) => event.type)).toEqual(['DESIGN_SELECTION_ENDED']);
    expect(getDesignRow(ended.state, 0)).toEqual([
      'design:4',
      'design:5',
      'design:0',
      'design:2',
    ]);
    expect(getDesignDeck(ended.state, 'row0')).toEqual([]);
  });

  it('rejects another tile when the player has no blueprint slot or no Shift left', () => {
    let full = workingDesignState();
    full = {
      ...full,
      board: {
        ...full.board,
        designs: {
          ...full.board.designs,
          'design:4': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
          'design:5': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
          'design:6': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 2 },
          'design:7': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 3 },
        },
      },
    };
    const fullStarted = accepted(full, { type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    const noSlot = applyCommand(fullStarted, {
      type: 'TAKE_DESIGN',
      actorId: 'player:0',
      designId: 'design:0',
    });
    expect(noSlot.status).toBe('REJECTED');
    if (noSlot.status === 'REJECTED') expect(noSlot.errors).toContain('NO_DESIGN_SLOT');

    let spent = workingDesignState();
    spent = {
      ...spent,
      players: spent.players.map((player) =>
        player.id === 'player:0' ? { ...player, shiftsSpentToday: 2 } : player,
      ),
    };
    const spentStarted = accepted(spent, { type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    const noShift = applyCommand(spentStarted, {
      type: 'TAKE_DESIGN',
      actorId: 'player:0',
      designId: 'design:0',
    });
    expect(noShift.status).toBe('REJECTED');
    if (noShift.status === 'REJECTED') expect(noShift.errors).toContain('INSUFFICIENT_SHIFTS');
  });

  it('lets a certified Design worker choose only the top fresh tile of each side deck and Central deck', () => {
    const base = workingDesignState();
    const certified: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'player:0'
          ? { ...player, certifications: ['DESIGN'], designCapacity: 5, bankedShifts: 2 }
          : player,
      ),
    };
    const started = accepted(certified, { type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    const takeIds = getLegalCommands(started, 'player:0')
      .filter((command) => command.type === 'TAKE_DESIGN')
      .map((command) => command.designId);

    expect(takeIds).toContain('design:4');
    expect(takeIds).toContain('design:6');
    expect(takeIds).toContain('design:7');
    expect(takeIds).not.toContain('design:5');
  });
});
