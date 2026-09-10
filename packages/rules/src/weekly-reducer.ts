import type { PlayerId } from './ids.js';
import type { GameState } from './model.js';
import { reduceEvent as reduceBaseEvent } from './reducer.js';
import type { BaseGameEvent, GameEvent } from './weekly-events.js';

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'WEEK_ADVANCED':
      return {
        ...state,
        week: event.week,
        eventIndex: state.eventIndex + 1,
      };
    case 'END_OF_WEEK_SCORED': {
      const totals = new Map<PlayerId, number>(
        event.scores.map((score) => [score.playerId, score.total]),
      );
      return {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          pp: player.pp + (totals.get(player.id) ?? 0),
        })),
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'MEETING_STARTED':
      return {
        ...state,
        phase: 'MEETING',
        meeting: {
          active: true,
          speakerOrder: event.speakerOrder,
          speakerCursor: 0,
          consecutivePasses: 0,
          revealedPetProjects: [],
          spokenGoalsByPlayer: {},
          usedSeatsByPlayer: {},
        },
        activeActorId: event.speakerOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    default:
      return reduceBaseEvent(state, event as BaseGameEvent);
  }
}
