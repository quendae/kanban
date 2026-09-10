import type { GameCommand, MeetingCommand, RulesCommand } from './commands.js';
import {
  applyCommand as applyBaseCommand,
  getLegalCommands as getBaseLegalCommands,
} from './engine.js';
import type { RuleErrorCode } from './errors.js';
import type { GameEvent as BaseGameEvent } from './events.js';
import { makeId, type PlayerId } from './ids.js';
import { assertInvariants } from './m4-invariants.js';
import {
  getLegalMeetingCommands,
  getMeetingCommandErrors,
  getMeetingSpeakerOrder,
  getPerformanceGoalScore,
  isMeetingCommand,
} from './meeting.js';
import type { GameState } from './model.js';
import { reduceEvent } from './weekly-reducer.js';
import type { GameEvent } from './weekly-events.js';
import { scoreEndOfWeek } from './weekly-scoring.js';

export type CommandResult =
  | {
      readonly status: 'ACCEPTED';
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly status: 'REJECTED';
      readonly state: GameState;
      readonly errors: readonly RuleErrorCode[];
    };

function withCurrentEventId<T extends BaseGameEvent>(state: GameState, event: T): T {
  return {
    ...event,
    id: makeId('event', state.eventIndex),
  } as T;
}

function isFirstDayEndOfWork(state: GameState, command: GameCommand): boolean {
  return (
    state.dayIndex === 0 &&
    command.type === 'FINISH_WORK' &&
    state.workCursor === state.workOrder.length - 1
  );
}

function isFirstDaySandraSideEffect(event: BaseGameEvent): boolean {
  return (
    event.type === 'SANDRA_MOVED' ||
    event.type === 'SANDRA_AUDIT_RESOLVED' ||
    event.type === 'SANDRA_DEPARTMENT_TASK_RESOLVED' ||
    event.type === 'MEETING_SCHEDULED'
  );
}

function appendMeetingStartIfScheduled(
  state: GameState,
  events: GameEvent[],
): GameState {
  if (!state.meetingScheduled || state.meeting.active) return state;
  const meetingEvent: GameEvent = {
    id: makeId('event', state.eventIndex),
    type: 'MEETING_STARTED',
    speakerOrder: getMeetingSpeakerOrder(state),
  };
  events.push(meetingEvent);
  return reduceEvent(state, meetingEvent);
}

function resolveMeetingCommand(state: GameState, command: MeetingCommand): GameEvent {
  switch (command.type) {
    case 'REVEAL_PET_PROJECT':
      return {
        id: makeId('event', state.eventIndex),
        type: 'PET_PROJECT_REVEALED',
        playerId: command.actorId,
        goalId: command.goalId,
      };
    case 'SPEAK_AT_MEETING':
      return {
        id: makeId('event', state.eventIndex),
        type: 'MEETING_GOAL_SCORED',
        playerId: command.actorId,
        goalId: command.goalId,
        ppAwarded: getPerformanceGoalScore(state, command.actorId, command.goalId),
      };
    case 'PASS_MEETING':
      return {
        id: makeId('event', state.eventIndex),
        type: 'MEETING_PLAYER_PASSED',
        playerId: command.actorId,
      };
  }
}

function applyMeetingCommand(state: GameState, command: MeetingCommand): CommandResult {
  const errors = getMeetingCommandErrors(state, command);
  if (errors.length > 0) return { status: 'REJECTED', state, errors };
  const event = resolveMeetingCommand(state, command);
  const nextState = reduceEvent(state, event);
  assertInvariants(nextState);
  return { status: 'ACCEPTED', state: nextState, events: [event] };
}

export function getLegalCommands(state: GameState, playerId: PlayerId): readonly GameCommand[] {
  if (state.phase === 'MEETING') {
    // Temporary M5 adapter: the dedicated Board Room in Task 9 consumes RulesCommand directly.
    return getLegalMeetingCommands(state, playerId) as unknown as readonly GameCommand[];
  }
  return getBaseLegalCommands(state, playerId);
}

export function applyCommand(state: GameState, command: RulesCommand): CommandResult {
  if (isMeetingCommand(command)) return applyMeetingCommand(state, command);

  const planned = applyBaseCommand(state, command);
  if (planned.status === 'REJECTED') return planned;

  const rawEvents = isFirstDayEndOfWork(state, command)
    ? planned.events.filter((event) => !isFirstDaySandraSideEffect(event))
    : planned.events;

  const events: GameEvent[] = [];
  let nextState = state;

  for (const rawEvent of rawEvents) {
    const event = withCurrentEventId(nextState, rawEvent);
    events.push(event);
    nextState = reduceEvent(nextState, event);

    if (
      event.type === 'SANDRA_DEPARTMENT_TASK_RESOLVED' &&
      event.department === 'ADMINISTRATION'
    ) {
      const weekEvent: GameEvent = {
        id: makeId('event', nextState.eventIndex),
        type: 'WEEK_ADVANCED',
        previousWeek: nextState.week,
        week: Math.min(3, nextState.week + 1),
      };
      events.push(weekEvent);
      nextState = reduceEvent(nextState, weekEvent);

      const scoringEvent: GameEvent = {
        id: makeId('event', nextState.eventIndex),
        type: 'END_OF_WEEK_SCORED',
        scores: scoreEndOfWeek(nextState),
      };
      events.push(scoringEvent);
      nextState = reduceEvent(nextState, scoringEvent);
    }

    if (event.type === 'DAY_ENDED') {
      nextState = appendMeetingStartIfScheduled(nextState, events);
    }
  }

  assertInvariants(nextState);
  return { status: 'ACCEPTED', state: nextState, events };
}
