import type { MeetingCommand, RulesCommand } from './commands.js';
import type { RuleErrorCode } from './errors.js';
import type { PerformanceGoalId, PlayerId } from './ids.js';
import type { GameState } from './model.js';

export function isMeetingCommand(command: RulesCommand): command is MeetingCommand {
  return (
    command.type === 'REVEAL_PET_PROJECT' ||
    command.type === 'SPEAK_AT_MEETING' ||
    command.type === 'PASS_MEETING'
  );
}

export function getMeetingSpeakerOrder(state: GameState): readonly PlayerId[] {
  return [...state.players]
    .sort((left, right) => {
      const positionDifference = right.certificationPosition - left.certificationPosition;
      return positionDifference !== 0
        ? positionDifference
        : left.id.localeCompare(right.id);
    })
    .map((player) => player.id);
}

function activeMeetingErrors(state: GameState, playerId: PlayerId): RuleErrorCode[] {
  const errors: RuleErrorCode[] = [];
  if (state.phase !== 'MEETING' || !state.meeting.active) errors.push('WRONG_PHASE');
  if (state.activeActorId !== playerId) errors.push('NOT_ACTIVE_ACTOR');
  return errors;
}

function revealPetProjectErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'REVEAL_PET_PROJECT' }>,
): readonly RuleErrorCode[] {
  const errors = activeMeetingErrors(state, command.actorId);
  if (state.meeting.revealedPetProjects.includes(command.actorId)) {
    errors.push('MEETING_PET_PROJECT_ALREADY_REVEALED');
  }
  const hand = state.performanceGoalHands[command.actorId] ?? [];
  if (!hand.includes(command.goalId)) errors.push('MEETING_PET_PROJECT_NOT_IN_HAND');
  if (!state.content.performanceGoals[command.goalId]) {
    errors.push('MEETING_GOAL_DEFINITION_MISSING');
  }
  return errors;
}

export function getInitialPerformanceGoalScore(
  state: GameState,
  goalId: PerformanceGoalId,
): number {
  const goal = state.content.performanceGoals[goalId];
  if (!goal) return 0;
  return Math.max(0, goal.basePP * goal.firstMultiplier);
}

function speakAtMeetingErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'SPEAK_AT_MEETING' }>,
): readonly RuleErrorCode[] {
  const errors = activeMeetingErrors(state, command.actorId);
  const player = state.players.find((candidate) => candidate.id === command.actorId);
  if (!state.board.performanceGoalDisplay.includes(command.goalId)) {
    errors.push('MEETING_GOAL_NOT_AVAILABLE');
  }
  if (!state.content.performanceGoals[command.goalId]) {
    errors.push('MEETING_GOAL_DEFINITION_MISSING');
  }
  if ((state.meeting.spokenGoalsByPlayer[command.actorId] ?? []).includes(command.goalId)) {
    errors.push('MEETING_GOAL_ALREADY_SCORED');
  }
  if ((player?.conferenceSeatsFaceUp ?? 0) < 1) {
    errors.push('MEETING_FACE_UP_SEAT_REQUIRED');
  }
  if (state.content.performanceGoals[command.goalId] && getInitialPerformanceGoalScore(state, command.goalId) <= 0) {
    errors.push('MEETING_GOAL_EXHAUSTED');
  }
  return errors;
}

function passMeetingErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'PASS_MEETING' }>,
): readonly RuleErrorCode[] {
  const errors = activeMeetingErrors(state, command.actorId);
  if (!state.meeting.revealedPetProjects.includes(command.actorId)) {
    errors.push('MEETING_PET_PROJECT_REQUIRED');
  }
  return errors;
}

export function getMeetingCommandErrors(
  state: GameState,
  command: MeetingCommand,
): readonly RuleErrorCode[] {
  switch (command.type) {
    case 'REVEAL_PET_PROJECT': return revealPetProjectErrors(state, command);
    case 'SPEAK_AT_MEETING': return speakAtMeetingErrors(state, command);
    case 'PASS_MEETING': return passMeetingErrors(state, command);
  }
}

export function getLegalMeetingCommands(
  state: GameState,
  playerId: PlayerId,
): readonly MeetingCommand[] {
  if (
    state.phase !== 'MEETING' ||
    !state.meeting.active ||
    state.activeActorId !== playerId
  ) {
    return [];
  }

  const commands: MeetingCommand[] = [];
  if (!state.meeting.revealedPetProjects.includes(playerId)) {
    for (const goalId of state.performanceGoalHands[playerId] ?? []) {
      const command: MeetingCommand = { type: 'REVEAL_PET_PROJECT', actorId: playerId, goalId };
      if (getMeetingCommandErrors(state, command).length === 0) commands.push(command);
    }
  }

  for (const goalId of state.board.performanceGoalDisplay) {
    const command: MeetingCommand = { type: 'SPEAK_AT_MEETING', actorId: playerId, goalId };
    if (getMeetingCommandErrors(state, command).length === 0) commands.push(command);
  }

  const pass: MeetingCommand = { type: 'PASS_MEETING', actorId: playerId };
  if (getMeetingCommandErrors(state, pass).length === 0) commands.push(pass);
  return commands;
}
