import type { MeetingCommand, RulesCommand } from './commands.js';
import type { RuleErrorCode } from './errors.js';
import { evaluateGoalCondition } from './goal-metrics.js';
import type { PerformanceGoalId, PlayerId } from './ids.js';
import type { GameState } from './model.js';
import type { RngState } from './rng.js';
import { shuffle } from './rng.js';

export interface MeetingCompletionPlan {
  readonly performanceGoalDisplay: readonly PerformanceGoalId[];
  readonly performanceGoalDeck: readonly PerformanceGoalId[];
  readonly performanceGoalDiscard: readonly PerformanceGoalId[];
  readonly performanceGoalHands: Readonly<Partial<Record<PlayerId, readonly PerformanceGoalId[]>>>;
  readonly rng: RngState;
}

export function isMeetingCommand(command: RulesCommand): command is MeetingCommand {
  return (
    command.type === 'REVEAL_PET_PROJECT' ||
    command.type === 'SPEAK_AT_MEETING' ||
    command.type === 'PASS_MEETING' ||
    command.type === 'CHOOSE_NEXT_MEETING_GOAL'
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

function activeDiscussionErrors(state: GameState, playerId: PlayerId): RuleErrorCode[] {
  const errors = activeMeetingErrors(state, playerId);
  if (state.meeting.replenishmentChoicesPending.length > 0) {
    errors.push('MEETING_REPLENISHMENT_IN_PROGRESS');
  }
  return errors;
}

function revealPetProjectErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'REVEAL_PET_PROJECT' }>,
): readonly RuleErrorCode[] {
  const errors = activeDiscussionErrors(state, command.actorId);
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

function countPriorSpeakers(state: GameState, goalId: PerformanceGoalId): number {
  return Object.values(state.meeting.spokenGoalsByPlayer).reduce(
    (count, goals) => count + (goals?.includes(goalId) ? 1 : 0),
    0,
  );
}

export function getPerformanceGoalScore(
  state: GameState,
  playerId: PlayerId,
  goalId: PerformanceGoalId,
): number {
  const goal = state.content.performanceGoals[goalId];
  if (!goal) return 0;
  if (!evaluateGoalCondition(state, playerId, goal.condition)) return 0;

  const multiplier = Math.max(0, goal.firstMultiplier - countPriorSpeakers(state, goalId));
  return goal.basePP * multiplier;
}

function speakAtMeetingErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'SPEAK_AT_MEETING' }>,
): readonly RuleErrorCode[] {
  const errors = activeDiscussionErrors(state, command.actorId);
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
  if (
    state.content.performanceGoals[command.goalId] &&
    getPerformanceGoalScore(state, command.actorId, command.goalId) <= 0
  ) {
    errors.push('MEETING_GOAL_EXHAUSTED');
  }
  return errors;
}

function passMeetingErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'PASS_MEETING' }>,
): readonly RuleErrorCode[] {
  const errors = activeDiscussionErrors(state, command.actorId);
  if (!state.meeting.revealedPetProjects.includes(command.actorId)) {
    errors.push('MEETING_PET_PROJECT_REQUIRED');
  }
  return errors;
}

function chooseNextMeetingGoalErrors(
  state: GameState,
  command: Extract<MeetingCommand, { readonly type: 'CHOOSE_NEXT_MEETING_GOAL' }>,
): readonly RuleErrorCode[] {
  const errors = activeMeetingErrors(state, command.actorId);
  const pending = state.meeting.replenishmentChoicesPending;
  if (pending.length === 0) errors.push('MEETING_REPLENISHMENT_NOT_ACTIVE');
  if (pending[0] !== command.actorId && !errors.includes('NOT_ACTIVE_ACTOR')) {
    errors.push('NOT_ACTIVE_ACTOR');
  }
  const hand = state.performanceGoalHands[command.actorId] ?? [];
  if (!hand.includes(command.goalId)) {
    errors.push('MEETING_REPLENISHMENT_CHOICE_NOT_IN_HAND');
  }
  if (!state.content.performanceGoals[command.goalId]) {
    errors.push('MEETING_GOAL_DEFINITION_MISSING');
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
    case 'CHOOSE_NEXT_MEETING_GOAL': return chooseNextMeetingGoalErrors(state, command);
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

  if (state.meeting.replenishmentChoicesPending.length > 0) {
    if (state.meeting.replenishmentChoicesPending[0] !== playerId) return [];
    return (state.performanceGoalHands[playerId] ?? [])
      .map((goalId): MeetingCommand => ({
        type: 'CHOOSE_NEXT_MEETING_GOAL',
        actorId: playerId,
        goalId,
      }))
      .filter((command) => getMeetingCommandErrors(state, command).length === 0);
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

export function planMeetingCompletion(state: GameState): MeetingCompletionPlan {
  const selectedGoals = state.meeting.speakerOrder
    .map((playerId) => state.meeting.nextGoalChoices[playerId])
    .filter((goalId): goalId is PerformanceGoalId => goalId !== undefined);

  let deck = [...state.performanceGoalDeck];
  let discard = [...state.performanceGoalDiscard, ...state.board.performanceGoalDisplay];
  let rng = state.rng;

  const drawOne = (): PerformanceGoalId | null => {
    if (deck.length === 0 && discard.length > 0) {
      const shuffled = shuffle(rng, discard);
      deck = [...shuffled.values];
      discard = [];
      rng = shuffled.rng;
    }
    return deck.shift() ?? null;
  };

  const display = [...selectedGoals];
  while (display.length < 4) {
    const goalId = drawOne();
    if (goalId === null) break;
    display.push(goalId);
  }

  const hands: Partial<Record<PlayerId, readonly PerformanceGoalId[]>> = {};
  for (const player of state.players) {
    hands[player.id] = [...(state.performanceGoalHands[player.id] ?? [])];
  }

  for (const playerId of state.meeting.speakerOrder) {
    const hand = [...(hands[playerId] ?? [])];
    for (let drawIndex = 0; drawIndex < 2; drawIndex += 1) {
      const goalId = drawOne();
      if (goalId === null) break;
      hand.push(goalId);
    }
    hands[playerId] = hand;
  }

  return {
    performanceGoalDisplay: display,
    performanceGoalDeck: deck,
    performanceGoalDiscard: discard,
    performanceGoalHands: hands,
    rng,
  };
}
