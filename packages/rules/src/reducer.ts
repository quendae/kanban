import type { GameEvent } from './events.js';
import type { PlayerId } from './ids.js';
import type { GameState, PendingRewardType } from './model.js';
import { getWorkstation } from './workstations.js';

function assertNever(value: never): never {
  throw new Error(`Unhandled GameEvent: ${String(value)}`);
}

function rewardTotal(
  state: GameState,
  playerId: PlayerId,
  type: PendingRewardType,
): number {
  return state.pendingRewards
    .filter((reward) => reward.playerId === playerId && reward.type === type)
    .reduce((total, reward) => total + reward.amount, 0);
}

function usedBankedShifts(baseShiftsToday: number, shiftsSpentToday: number): number {
  return Math.max(0, shiftsSpentToday - baseShiftsToday);
}

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return {
        ...state,
        phase: 'SELECT_DEPARTMENT',
        activeActorId: state.selectionOrder[state.selectionCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'WORKSTATION_SELECTED': {
      const station = getWorkstation(event.workstationId);
      const nextCursor = state.selectionCursor + 1;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId
            ? {
                ...player,
                currentWorkstation: event.workstationId,
                currentDepartment: station.department,
                baseShiftsToday: station.shifts,
              }
            : player,
        ),
        selectionCursor: nextCursor,
        activeActorId: state.selectionOrder[nextCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'WORKING_PHASE_STARTED':
      return {
        ...state,
        phase: 'WORK',
        workOrder: event.workOrder,
        workCursor: 0,
        activeActorId: event.workOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_SELECTION_STARTED':
      return {
        ...state,
        activeDepartmentAction: { kind: 'DESIGN_SELECTION', playerId: event.playerId },
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_TAKEN':
      return {
        ...state,
        board: {
          ...state.board,
          designs: {
            ...state.board.designs,
            [event.designId]: {
              kind: 'PLAYER',
              playerId: event.playerId,
              area: 'blueprints',
              slot: event.destinationSlot,
            },
          },
        },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, shiftsSpentToday: player.shiftsSpentToday + 1 }
            : player,
        ),
        pendingRewards:
          event.bonus === null
            ? state.pendingRewards
            : [...state.pendingRewards, { playerId: event.playerId, type: event.bonus, amount: 1 }],
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_SELECTION_ENDED': {
      const designs = { ...state.board.designs };
      for (const move of event.moves) designs[move.designId] = move.location;
      return {
        ...state,
        board: { ...state.board, designs },
        activeDepartmentAction: null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'PARTS_COLLECTED': {
      const parts = { ...state.board.parts };
      event.partIds.forEach((partId, index) => {
        const slot = event.destinationSlots[index];
        if (slot === undefined) throw new Error('PARTS_COLLECTED destination slot mismatch');
        parts[partId] = {
          kind: 'PLAYER',
          playerId: event.playerId,
          area: 'parts',
          slot,
        };
      });
      return {
        ...state,
        board: { ...state.board, parts },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, shiftsSpentToday: player.shiftsSpentToday + 1 }
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'PLAYER_FINISHED_WORK': {
      const nextCursor = state.workCursor + 1;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId ? { ...player, done: true } : player,
        ),
        workCursor: nextCursor,
        activeActorId: state.workOrder[nextCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'DAY_ENDED':
      return {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          bankedShifts:
            Math.max(
              0,
              player.bankedShifts -
                usedBankedShifts(player.baseShiftsToday, player.shiftsSpentToday),
            ) + rewardTotal(state, player.id, 'BANKED_SHIFT'),
          books: player.books + rewardTotal(state, player.id, 'BOOK'),
          vouchers: player.vouchers + rewardTotal(state, player.id, 'VOUCHER'),
          previousDepartment: player.currentDepartment,
          currentDepartment: null,
          currentWorkstation: null,
          baseShiftsToday: 0,
          shiftsSpentToday: 0,
          done: false,
          kanbanOrderIssuedToday: false,
          logisticsVoucherTakenToday: false,
        })),
        activeDepartmentAction: null,
        pendingRewards: [],
        dayIndex: state.dayIndex + 1,
        phase: 'SELECT_DEPARTMENT',
        selectionOrder: event.nextSelectionOrder,
        selectionCursor: 0,
        workOrder: [],
        workCursor: 0,
        activeActorId: event.nextSelectionOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    default:
      return assertNever(event);
  }
}
