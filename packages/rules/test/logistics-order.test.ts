import { describe, expect, it } from 'vitest';
import {
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getMaximumUsableShifts,
  getWarehouseParts,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function orderContent(): GameContent {
  const parts = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => [
      `part:${index}` as PartId,
      {
        id: `part:${index}` as PartId,
        type:
          index < 3
            ? ('part-type:0' as const)
            : index < 6
              ? ('part-type:1' as const)
              : ('part-type:2' as const),
      },
    ]),
  );

  return {
    id: 'order-test-content',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    parts,
    designs: {},
    kanbanOrders: {
      'kanban-order:0': {
        id: 'kanban-order:0',
        symbols: [
          'part-type:0',
          'part-type:1',
          'part-type:2',
          'part-type:0',
          'part-type:3',
          'part-type:4',
        ],
        refillByOrientation: {
          LEFT_FOUR: ['part-type:0', 'part-type:1', 'part-type:2', 'part-type:0'],
          RIGHT_FOUR: ['part-type:2', 'part-type:0', 'part-type:3', 'part-type:4'],
        },
      },
      'kanban-order:1': {
        id: 'kanban-order:1',
        symbols: [
          'part-type:0',
          'part-type:1',
          'part-type:2',
          'part-type:3',
          'part-type:4',
          'part-type:5',
        ],
        refillByOrientation: {
          LEFT_FOUR: ['part-type:0', 'part-type:1', 'part-type:2', 'part-type:3'],
          RIGHT_FOUR: ['part-type:2', 'part-type:3', 'part-type:4', 'part-type:5'],
        },
      },
      'kanban-order:2': {
        id: 'kanban-order:2',
        symbols: [
          'part-type:5',
          'part-type:4',
          'part-type:3',
          'part-type:2',
          'part-type:1',
          'part-type:0',
        ],
        refillByOrientation: {
          LEFT_FOUR: ['part-type:5', 'part-type:4', 'part-type:3', 'part-type:2'],
          RIGHT_FOUR: ['part-type:3', 'part-type:2', 'part-type:1', 'part-type:0'],
        },
      },
    },
  };
}

function workingOrderState(certified = false): GameState {
  const shell = createShellGame({ seed: 'kanban-order', playerCount: 2 });
  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': { kind: 'SUPPLY' },
    'part:1': { kind: 'SUPPLY' },
    'part:2': { kind: 'SUPPLY' },
    'part:3': { kind: 'SUPPLY' },
    'part:4': { kind: 'SUPPLY' },
    'part:5': { kind: 'SUPPLY' },
    'part:6': { kind: 'SUPPLY' },
    'part:7': { kind: 'SUPPLY' },
  };

  return {
    ...shell,
    content: orderContent(),
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    kanbanOrderDeck: ['kanban-order:2'],
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'LOGISTICS',
        currentWorkstation: 'C_LEFT',
        baseShiftsToday: 2,
        bankedShifts: 2,
        certifications: certified ? ['LOGISTICS'] : [],
        kanbanOrders: ['kanban-order:0', 'kanban-order:1'],
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
        kanbanOrders: [],
      },
    ],
    board: { ...shell.board, parts },
  };
}

describe('Logistics — Issue Kanban Order', () => {
  it('costs 1 Shift, creates a pending Banked Shift and refills from content-defined orientation', () => {
    const state = workingOrderState();
    const result = applyCommand(state, {
      type: 'ISSUE_KANBAN_ORDER',
      actorId: 'player:0',
      orderId: 'kanban-order:0',
      orientation: 'LEFT_FOUR',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual(['KANBAN_ORDER_ISSUED']);
    expect(result.state.players[0]).toMatchObject({
      shiftsSpentToday: 1,
      kanbanOrderIssuedToday: true,
      bankedShifts: 2,
      kanbanOrders: ['kanban-order:1', 'kanban-order:2'],
    });
    expect(result.state.pendingRewards).toContainEqual({
      playerId: 'player:0',
      type: 'BANKED_SHIFT',
      amount: 1,
    });
    expect(getMaximumUsableShifts(result.state, 'player:0')).toBe(4);
    expect(getWarehouseParts(result.state, 'part-type:0')).toEqual(['part:0', 'part:1']);
    expect(getWarehouseParts(result.state, 'part-type:1')).toEqual(['part:3']);
    expect(getWarehouseParts(result.state, 'part-type:2')).toEqual(['part:6']);
    expect(result.state.kanbanOrderDeck).toEqual(['kanban-order:0']);
  });

  it('rejects an order outside the hand and a second order in the same day', () => {
    const state = workingOrderState();
    const notInHand = applyCommand(state, {
      type: 'ISSUE_KANBAN_ORDER',
      actorId: 'player:0',
      orderId: 'kanban-order:2',
      orientation: 'LEFT_FOUR',
    });
    expect(notInHand.status).toBe('REJECTED');
    if (notInHand.status === 'REJECTED') expect(notInHand.errors).toContain('KANBAN_ORDER_NOT_IN_HAND');

    const first = applyCommand(state, {
      type: 'ISSUE_KANBAN_ORDER',
      actorId: 'player:0',
      orderId: 'kanban-order:0',
      orientation: 'RIGHT_FOUR',
    });
    if (first.status !== 'ACCEPTED') throw new Error(first.errors.join(','));
    const second = applyCommand(first.state, {
      type: 'ISSUE_KANBAN_ORDER',
      actorId: 'player:0',
      orderId: 'kanban-order:1',
      orientation: 'LEFT_FOUR',
    });
    expect(second.status).toBe('REJECTED');
    if (second.status === 'REJECTED') expect(second.errors).toContain('KANBAN_ORDER_ALREADY_ISSUED');
  });

  it('never creates warehouse parts when the matching physical supply is exhausted', () => {
    const base = workingOrderState();
    const state: GameState = {
      ...base,
      board: {
        ...base.board,
        parts: {
          ...base.board.parts,
          'part:1': { kind: 'PLAYER', playerId: 'player:1', area: 'parts', slot: 0 },
          'part:2': { kind: 'PLAYER', playerId: 'player:1', area: 'parts', slot: 1 },
        },
      },
    };
    const result = applyCommand(state, {
      type: 'ISSUE_KANBAN_ORDER',
      actorId: 'player:0',
      orderId: 'kanban-order:0',
      orientation: 'LEFT_FOUR',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(getWarehouseParts(result.state, 'part-type:0')).toEqual(['part:0']);
  });
});

describe('Logistics — certified Parts Voucher', () => {
  it('costs 1 Shift, is once per day and the Voucher remains pending', () => {
    const state = workingOrderState(true);
    const result = applyCommand(state, {
      type: 'TAKE_PARTS_VOUCHER',
      actorId: 'player:0',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual(['PARTS_VOUCHER_TAKEN']);
    expect(result.state.players[0]).toMatchObject({
      shiftsSpentToday: 1,
      logisticsVoucherTakenToday: true,
      vouchers: 0,
    });
    expect(result.state.pendingRewards).toContainEqual({
      playerId: 'player:0',
      type: 'VOUCHER',
      amount: 1,
    });

    const twice = applyCommand(result.state, {
      type: 'TAKE_PARTS_VOUCHER',
      actorId: 'player:0',
    });
    expect(twice.status).toBe('REJECTED');
    if (twice.status === 'REJECTED') expect(twice.errors).toContain('LOGISTICS_VOUCHER_ALREADY_TAKEN');
  });

  it('requires Logistics certification and an available Shift', () => {
    const notCertified = applyCommand(workingOrderState(false), {
      type: 'TAKE_PARTS_VOUCHER',
      actorId: 'player:0',
    });
    expect(notCertified.status).toBe('REJECTED');
    if (notCertified.status === 'REJECTED') {
      expect(notCertified.errors).toContain('LOGISTICS_VOUCHER_REQUIRES_CERTIFICATION');
    }

    const base = workingOrderState(true);
    const noShift: GameState = {
      ...base,
      players: base.players.map((player) =>
        player.id === 'player:0' ? { ...player, shiftsSpentToday: 4 } : player,
      ),
    };
    const result = applyCommand(noShift, { type: 'TAKE_PARTS_VOUCHER', actorId: 'player:0' });
    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') expect(result.errors).toContain('INSUFFICIENT_SHIFTS');
  });
});
