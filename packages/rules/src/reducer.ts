import type { GameEvent } from './events.js';
import type { GameState } from './model.js';

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return {
        ...state,
        phase: 'SELECT_DEPARTMENT',
        eventIndex: state.eventIndex + 1,
      };
  }

  const exhaustive: never = event;
  return exhaustive;
}
