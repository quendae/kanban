import type { GameCommand } from './commands.js';
import type { RuleErrorCode } from './errors.js';
import type { GameEvent } from './events.js';
import { makeId, type PlayerId } from './ids.js';
import type { GameState } from './model.js';
import { reduceEvent } from './reducer.js';

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

export function getLegalCommands(
  state: GameState,
  playerId: PlayerId,
): readonly GameCommand[] {
  if (state.phase !== 'SETUP') {
    return [];
  }

  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.kind !== 'HUMAN' || player.id !== 'player:0') {
    return [];
  }

  return [{ type: 'START_GAME', actorId: playerId }];
}

function validateCommand(
  state: GameState,
  command: GameCommand,
): readonly RuleErrorCode[] {
  if (state.phase !== 'SETUP') {
    return ['GAME_ALREADY_STARTED'];
  }

  const actor = state.players.find((player) => player.id === command.actorId);
  if (!actor || actor.kind !== 'HUMAN' || actor.id !== 'player:0') {
    return ['WRONG_ACTOR'];
  }

  return [];
}

function resolveCommand(state: GameState, command: GameCommand): readonly GameEvent[] {
  switch (command.type) {
    case 'START_GAME':
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'GAME_STARTED',
        },
      ];
  }
}

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  const errors = validateCommand(state, command);

  if (errors.length > 0) {
    return {
      status: 'REJECTED',
      state,
      errors,
    };
  }

  const events = resolveCommand(state, command);
  const nextState = events.reduce<GameState>(
    (currentState, event) => reduceEvent(currentState, event),
    state,
  );

  return {
    status: 'ACCEPTED',
    state: nextState,
    events,
  };
}
