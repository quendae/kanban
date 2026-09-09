import type { Department } from './enums.js';
import {
  getInvariantViolations as getBaseInvariantViolations,
  type InvariantCode as BaseInvariantCode,
  type InvariantViolation as BaseInvariantViolation,
} from './invariants.js';
import type { GameState } from './model.js';
import { getWorkstation } from './workstations.js';

export type M4InvariantCode =
  | 'INVALID_TRAINING_LEVEL'
  | 'CERTIFICATION_TRAINING_MISMATCH'
  | 'EXPERT_TRAINING_MISMATCH'
  | 'DUPLICATE_AWARD_PLAQUE'
  | 'INVALID_CONFERENCE_SEATS'
  | 'NEGATIVE_FACTORY_GOAL_SEATS'
  | 'SANDRA_WORKSTATION_MISMATCH';

export type InvariantCode = BaseInvariantCode | M4InvariantCode;

export interface InvariantViolation {
  readonly code: InvariantCode;
  readonly message: string;
}

export class InvariantError extends Error {
  readonly violations: readonly InvariantViolation[];

  constructor(violations: readonly InvariantViolation[]) {
    super(`GameState invariant violation: ${violations.map((violation) => violation.code).join(', ')}`);
    this.name = 'InvariantError';
    this.violations = violations;
  }
}

const DEPARTMENTS: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

function addTrainingViolations(state: GameState, violations: InvariantViolation[]): void {
  const { certificationLevel, expertLevel } = state.content.trainingRules;

  for (const player of state.players) {
    for (const department of DEPARTMENTS) {
      const training = player.training[department];
      if (!Number.isInteger(training) || training < 0 || training > expertLevel) {
        violations.push({
          code: 'INVALID_TRAINING_LEVEL',
          message: `${player.id} has invalid ${department} training level ${training}`,
        });
        continue;
      }

      const certified = player.certifications.includes(department);
      if (certified !== (training >= certificationLevel)) {
        violations.push({
          code: 'CERTIFICATION_TRAINING_MISMATCH',
          message: `${player.id} ${department} certification does not match training ${training}`,
        });
      }

      const expert = player.expertDepartments.includes(department);
      if (expert !== (training >= expertLevel)) {
        violations.push({
          code: 'EXPERT_TRAINING_MISMATCH',
          message: `${player.id} ${department} expert state does not match training ${training}`,
        });
      }
    }
  }
}

function addAwardPlaqueViolations(state: GameState, violations: InvariantViolation[]): void {
  for (const department of DEPARTMENTS) {
    const pool = state.board.awardPlaquePools[department];
    if (new Set(pool).size !== pool.length) {
      violations.push({
        code: 'DUPLICATE_AWARD_PLAQUE',
        message: `${department} Award Plaque pool contains duplicate IDs`,
      });
    }
  }
}

function addConferenceSeatViolations(state: GameState, violations: InvariantViolation[]): void {
  for (const player of state.players) {
    const unlockedCapacity = 4 + (player.certifications.includes('ADMINISTRATION') ? 1 : 0);
    const faceUp = player.conferenceSeatsFaceUp;
    const faceDown = player.conferenceSeatsFaceDown;
    if (
      !Number.isInteger(faceUp) ||
      !Number.isInteger(faceDown) ||
      faceUp < 0 ||
      faceDown < 0 ||
      faceUp + faceDown > unlockedCapacity
    ) {
      violations.push({
        code: 'INVALID_CONFERENCE_SEATS',
        message: `${player.id} has ${faceUp} face-up + ${faceDown} face-down Seats with capacity ${unlockedCapacity}`,
      });
    }
  }
}

function addFactoryGoalViolations(state: GameState, violations: InvariantViolation[]): void {
  for (const goal of state.board.factoryGoals) {
    if (!Number.isInteger(goal.seatsRemaining) || goal.seatsRemaining < 0) {
      violations.push({
        code: 'NEGATIVE_FACTORY_GOAL_SEATS',
        message: `${goal.goalId} has invalid remaining Seat count ${goal.seatsRemaining}`,
      });
    }
  }
}

function addSandraPairingViolation(state: GameState, violations: InvariantViolation[]): void {
  if (state.sandra.department === 'SANDRA_DESK') {
    if (state.sandra.workstation !== 'F_SANDRA') {
      violations.push({
        code: 'SANDRA_WORKSTATION_MISMATCH',
        message: `Sandra desk state requires F_SANDRA, got ${state.sandra.workstation}`,
      });
    }
    return;
  }

  const workstation = getWorkstation(state.sandra.workstation);
  const valid = state.sandra.department === 'ADMINISTRATION'
    ? state.sandra.workstation === 'F_SANDRA'
    : !workstation.reservedForSandra && workstation.department === state.sandra.department;
  if (!valid) {
    violations.push({
      code: 'SANDRA_WORKSTATION_MISMATCH',
      message: `Sandra ${state.sandra.department} does not match ${state.sandra.workstation}`,
    });
  }
}

export function getInvariantViolations(state: GameState): readonly InvariantViolation[] {
  const violations: InvariantViolation[] = [
    ...(getBaseInvariantViolations(state) as readonly BaseInvariantViolation[]),
  ];
  addTrainingViolations(state, violations);
  addAwardPlaqueViolations(state, violations);
  addConferenceSeatViolations(state, violations);
  addFactoryGoalViolations(state, violations);
  addSandraPairingViolation(state, violations);
  return violations;
}

export function assertInvariants(state: GameState): void {
  const violations = getInvariantViolations(state);
  if (violations.length > 0) throw new InvariantError(violations);
}
