import { MAX_SHIFTS_PER_DAY } from './constants.js';
import type { GameState } from './model.js';

export type InvariantCode =
  | 'PLAYER_COUNT_MISMATCH'
  | 'DUPLICATE_PLAYER_ID'
  | 'NEGATIVE_BANKED_SHIFTS'
  | 'SHIFT_LIMIT_EXCEEDED'
  | 'INVALID_WEEK'
  | 'INVALID_PRODUCTION_CYCLE'
  | 'INVALID_EVENT_INDEX';

export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly message: string;
}

export class InvariantError extends Error {
  readonly violations: readonly InvariantViolation[];

  constructor(violations: readonly InvariantViolation[]) {
    super(
      `GameState invariant violation: ${violations
        .map((violation) => violation.code)
        .join(', ')}`,
    );
    this.name = 'InvariantError';
    this.violations = violations;
  }
}

function isClockValue(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export function getInvariantViolations(
  state: GameState,
): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  if (state.players.length !== state.playerCount) {
    violations.push({
      code: 'PLAYER_COUNT_MISMATCH',
      message: `Expected ${state.playerCount} players, got ${state.players.length}`,
    });
  }

  const playerIds = new Set(state.players.map((player) => player.id));
  if (playerIds.size !== state.players.length) {
    violations.push({
      code: 'DUPLICATE_PLAYER_ID',
      message: 'Every player must have a unique ID',
    });
  }

  for (const player of state.players) {
    if (!Number.isInteger(player.bankedShifts) || player.bankedShifts < 0) {
      violations.push({
        code: 'NEGATIVE_BANKED_SHIFTS',
        message: `${player.id} has invalid banked shifts: ${player.bankedShifts}`,
      });
    }

    if (
      !Number.isInteger(player.shiftsSpentToday) ||
      player.shiftsSpentToday < 0 ||
      player.shiftsSpentToday > MAX_SHIFTS_PER_DAY
    ) {
      violations.push({
        code: 'SHIFT_LIMIT_EXCEEDED',
        message: `${player.id} has invalid shifts spent today: ${player.shiftsSpentToday}`,
      });
    }
  }

  if (!isClockValue(state.week)) {
    violations.push({
      code: 'INVALID_WEEK',
      message: `Week must be an integer from 0 to 3, got ${state.week}`,
    });
  }

  if (!isClockValue(state.productionCycle)) {
    violations.push({
      code: 'INVALID_PRODUCTION_CYCLE',
      message: `Production Cycle must be an integer from 0 to 3, got ${state.productionCycle}`,
    });
  }

  if (!Number.isInteger(state.eventIndex) || state.eventIndex < 0) {
    violations.push({
      code: 'INVALID_EVENT_INDEX',
      message: `Event index must be a non-negative integer, got ${state.eventIndex}`,
    });
  }

  return violations;
}

export function assertInvariants(state: GameState): void {
  const violations = getInvariantViolations(state);
  if (violations.length > 0) {
    throw new InvariantError(violations);
  }
}
