import type { PlayerId } from './ids.js';
import type { GameState } from './model.js';
import { reduceEvent as reduceBaseEvent } from './reducer.js';
import type { BaseGameEvent, GameEvent } from './weekly-events.js';

function nextMeetingSpeaker(state: GameState): { readonly cursor: number; readonly playerId: PlayerId | null } {
  if (state.meeting.speakerOrder.length === 0) return { cursor: 0, playerId: null };
  const cursor = (state.meeting.speakerCursor + 1) % state.meeting.speakerOrder.length;
  return { cursor, playerId: state.meeting.speakerOrder[cursor] ?? null };
}

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
          replenishmentChoicesPending: [],
          nextGoalChoices: {},
        },
        activeActorId: event.speakerOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'PET_PROJECT_REVEALED': {
      const hand = state.performanceGoalHands[event.playerId] ?? [];
      return {
        ...state,
        board: {
          ...state.board,
          performanceGoalDisplay: state.board.performanceGoalDisplay.includes(event.goalId)
            ? state.board.performanceGoalDisplay
            : [...state.board.performanceGoalDisplay, event.goalId],
        },
        performanceGoalHands: {
          ...state.performanceGoalHands,
          [event.playerId]: hand.filter((goalId) => goalId !== event.goalId),
        },
        meeting: {
          ...state.meeting,
          consecutivePasses: 0,
          revealedPetProjects: state.meeting.revealedPetProjects.includes(event.playerId)
            ? state.meeting.revealedPetProjects
            : [...state.meeting.revealedPetProjects, event.playerId],
        },
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'MEETING_GOAL_SCORED': {
      const nextSpeaker = nextMeetingSpeaker(state);
      const spokenGoals = state.meeting.spokenGoalsByPlayer[event.playerId] ?? [];
      const usedSeats = state.meeting.usedSeatsByPlayer[event.playerId] ?? 0;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId
            ? {
                ...player,
                pp: player.pp + event.ppAwarded,
                conferenceSeatsFaceUp: player.conferenceSeatsFaceUp - 1,
              }
            : player,
        ),
        meeting: {
          ...state.meeting,
          speakerCursor: nextSpeaker.cursor,
          consecutivePasses: 0,
          spokenGoalsByPlayer: {
            ...state.meeting.spokenGoalsByPlayer,
            [event.playerId]: [...spokenGoals, event.goalId],
          },
          usedSeatsByPlayer: {
            ...state.meeting.usedSeatsByPlayer,
            [event.playerId]: usedSeats + 1,
          },
        },
        activeActorId: nextSpeaker.playerId,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'MEETING_PLAYER_PASSED': {
      const nextSpeaker = nextMeetingSpeaker(state);
      return {
        ...state,
        meeting: {
          ...state.meeting,
          speakerCursor: nextSpeaker.cursor,
          consecutivePasses: state.meeting.consecutivePasses + 1,
        },
        activeActorId: nextSpeaker.playerId,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'MEETING_REPLENISHMENT_STARTED':
      return {
        ...state,
        meeting: {
          ...state.meeting,
          replenishmentChoicesPending: event.playerIds,
          nextGoalChoices: {},
        },
        activeActorId: event.playerIds[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'NEXT_MEETING_GOAL_CHOSEN': {
      const hand = state.performanceGoalHands[event.playerId] ?? [];
      const pending = state.meeting.replenishmentChoicesPending.slice(1);
      return {
        ...state,
        performanceGoalHands: {
          ...state.performanceGoalHands,
          [event.playerId]: hand.filter((goalId) => goalId !== event.goalId),
        },
        meeting: {
          ...state.meeting,
          replenishmentChoicesPending: pending,
          nextGoalChoices: {
            ...state.meeting.nextGoalChoices,
            [event.playerId]: event.goalId,
          },
        },
        activeActorId: pending[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'MEETING_COMPLETED':
      return {
        ...state,
        rng: event.rng,
        meetingScheduled: false,
        meeting: {
          active: false,
          speakerOrder: [],
          speakerCursor: 0,
          consecutivePasses: 0,
          revealedPetProjects: [],
          spokenGoalsByPlayer: {},
          usedSeatsByPlayer: {},
          replenishmentChoicesPending: [],
          nextGoalChoices: {},
        },
        players: state.players.map((player) => ({
          ...player,
          conferenceSeatsFaceDown:
            player.conferenceSeatsFaceDown + (state.meeting.usedSeatsByPlayer[player.id] ?? 0),
        })),
        board: {
          ...state.board,
          performanceGoalDisplay: event.performanceGoalDisplay,
        },
        performanceGoalDeck: event.performanceGoalDeck,
        performanceGoalDiscard: event.performanceGoalDiscard,
        performanceGoalHands: event.performanceGoalHands,
        phase: 'SELECT_DEPARTMENT',
        activeActorId: state.selectionOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    default:
      return reduceBaseEvent(state, event as BaseGameEvent);
  }
}
