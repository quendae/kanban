import type { GameCommand } from './commands.js';
import type { Department } from './enums.js';
import type { RuleErrorCode } from './errors.js';
import type { PlayerId } from './ids.js';
import type { GameState } from './model.js';

export interface TrainingAdvancePlan {
  readonly ok: true;
  readonly playerId: PlayerId;
  readonly department: Department;
  readonly source: 'SHIFT' | 'BOOK';
  readonly fromLevel: number;
  readonly toLevel: number;
  readonly tieOrder: readonly PlayerId[];
  readonly shiftCost: 0 | 1;
  readonly bookCost: 0 | 1;
  readonly certificationEarned: boolean;
  readonly certificationPosition: number;
  readonly administrationSeatUnlocked: boolean;
}

export interface TrainingAdvanceFailure {
  readonly ok: false;
  readonly errors: readonly RuleErrorCode[];
}

export type TrainingAdvanceResult = TrainingAdvancePlan | TrainingAdvanceFailure;

function getPlayer(state: GameState, playerId: PlayerId) {
  return state.players.find((player) => player.id === playerId);
}

function maximumUsableShifts(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  if (!player) return 0;
  return Math.min(4, player.baseShiftsToday + player.bankedShifts);
}

export function getTrainingLeaders(state: GameState, department: Department): readonly PlayerId[] {
  const maximum = Math.max(...state.players.map((player) => player.training[department]));
  return state.players
    .filter((player) => player.training[department] === maximum)
    .map((player) => player.id);
}

export function getTrainingLaggards(state: GameState, department: Department): readonly PlayerId[] {
  const minimum = Math.min(...state.players.map((player) => player.training[department]));
  return state.players
    .filter((player) => player.training[department] === minimum)
    .map((player) => player.id);
}

export function getTrainingRank(state: GameState, department: Department): readonly PlayerId[] {
  const tieOrder = state.board.trainingTieOrder[department];
  const tieIndex = new Map(tieOrder.map((playerId, index) => [playerId, index]));
  return [...state.players]
    .sort((a, b) => {
      const levelDifference = b.training[department] - a.training[department];
      if (levelDifference !== 0) return levelDifference;
      return (tieIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (tieIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER);
    })
    .map((player) => player.id);
}

function nextTieOrder(state: GameState, department: Department, playerId: PlayerId): readonly PlayerId[] {
  const current = state.board.trainingTieOrder[department].filter((id) => id !== playerId);
  return [playerId, ...current];
}

export function planTrainingAdvance(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'TRAIN_DEPARTMENT' }>,
): TrainingAdvanceResult {
  const errors: RuleErrorCode[] = [];
  const player = getPlayer(state, command.actorId);

  if (state.phase !== 'WORK') errors.push('WRONG_PHASE');
  if (state.activeActorId !== command.actorId) errors.push('NOT_ACTIVE_ACTOR');
  if (!player) return { ok: false, errors: [...errors, 'WRONG_ACTOR'] };
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (player.currentDepartment !== command.department) errors.push('TRAINING_WRONG_DEPARTMENT');

  const fromLevel = player.training[command.department];
  const expertLevel = state.content.trainingRules.expertLevel;
  if (fromLevel >= expertLevel) errors.push('TRAINING_AT_MAX');

  const shiftCost: 0 | 1 = command.source === 'SHIFT' ? 1 : 0;
  const bookCost: 0 | 1 = command.source === 'BOOK' ? 1 : 0;
  if (
    shiftCost === 1 &&
    player.shiftsSpentToday + 1 > maximumUsableShifts(state, command.actorId)
  ) {
    errors.push('INSUFFICIENT_SHIFTS');
  }
  if (bookCost === 1 && player.books < 1) errors.push('TRAINING_BOOK_REQUIRED');

  if (errors.length > 0) return { ok: false, errors };

  const toLevel = fromLevel + 1;
  const certificationEarned =
    fromLevel < state.content.trainingRules.certificationLevel &&
    toLevel >= state.content.trainingRules.certificationLevel &&
    !player.certifications.includes(command.department);

  return {
    ok: true,
    playerId: command.actorId,
    department: command.department,
    source: command.source,
    fromLevel,
    toLevel,
    tieOrder: nextTieOrder(state, command.department, command.actorId),
    shiftCost,
    bookCost,
    certificationEarned,
    certificationPosition: certificationEarned
      ? player.certificationPosition + 1
      : player.certificationPosition,
    administrationSeatUnlocked: certificationEarned && command.department === 'ADMINISTRATION',
  };
}
