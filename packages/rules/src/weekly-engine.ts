import type { GameCommand } from './commands.js';
import { applyCommand as applyBaseCommand } from './engine.js';
import type { RuleErrorCode } from './errors.js';
import { makeId } from './ids.js';
import { assertInvariants } from './m4-invariants.js';
import type { GameState } from './model.js';
import type { GameEvent as BaseGameEvent } from './events.js';
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

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  const planned = applyBaseCommand(state, command);
  if (planned.status === 'REJECTED') return planned;

  const events: GameEvent[] = [];
  let nextState = state;

  for (const rawEvent of planned.events) {
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
  }

  assertInvariants(nextState);
  return { status: 'ACCEPTED', state: nextState, events };
}
