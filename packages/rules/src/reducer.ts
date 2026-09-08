import type { GameEvent } from './events.js';
import type { GameState } from './model.js';

function assertNever(value: never): never {
  throw new Error(`Unhandled GameEvent type: ${String(value)}`);
}

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return {
        ...state,
        phase: 'SELECT_DEPARTMENT',
        eventIndex: state.eventIndex + 1,
      };
    default:
      return assertNever(event.type);
  }
}
