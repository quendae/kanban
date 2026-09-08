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
            player.bankedShifts + rewardTotal(state, player.id, 'BANKED_SHIFT'),
          books: player.books + rewardTotal(state, player.id, 'BOOK'),
          vouchers: player.vouchers + rewardTotal(state, player.id, 'VOUCHER'),
          previousDepartment: player.currentDepartment,
          currentDepartment: null,
          currentWorkstation: null,
          baseShiftsToday: 0,
          shiftsSpentToday: 0,
          done: false,
        })),
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
