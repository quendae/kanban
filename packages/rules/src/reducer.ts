import type { GameEvent } from './events.js';
import type { GameState } from './model.js';
import { getWorkstation } from './workstations.js';

function assertNever(value: never): never {
  throw new Error(`Unhandled GameEvent: ${String(value)}`);
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
    default:
      return assertNever(event);
  }
}
