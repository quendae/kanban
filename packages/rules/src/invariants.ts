import { MAX_SHIFTS_PER_DAY } from './constants.js';
import { getPlayerDesigns, getPlayerParts, getTestTrackCars } from './inventory.js';
import type { GameState } from './model.js';
import { getWorkstation } from './workstations.js';

export type InvariantCode =
  | 'PLAYER_COUNT_MISMATCH'
  | 'DUPLICATE_PLAYER_ID'
  | 'NEGATIVE_BANKED_SHIFTS'
  | 'SHIFT_LIMIT_EXCEEDED'
  | 'INVALID_WEEK'
  | 'INVALID_PRODUCTION_CYCLE'
  | 'INVALID_EVENT_INDEX'
  | 'DUPLICATE_WORKSTATION'
  | 'INVALID_SELECTION_CURSOR'
  | 'INVALID_WORK_CURSOR'
  | 'INVALID_WORK_ORDER'
  | 'WORKSTATION_DEPARTMENT_MISMATCH'
  | 'INVALID_BASE_SHIFTS'
  | 'PART_CAPACITY_EXCEEDED'
  | 'DESIGN_CAPACITY_EXCEEDED'
  | 'TEST_TRACK_CAPACITY_EXCEEDED'
  | 'DUPLICATE_GARAGE_SLOT'
  | 'INVALID_PART_VALUE'
  | 'INVALID_ASSEMBLY_LOCATION';

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

function isCursorInBounds(value: number, length: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= length;
}

function hasAssemblyNode(state: GameState, nodeId: string): boolean {
  return Object.values(state.content.assemblyGraph.models).some(
    (model) => model !== undefined && model.nodes[nodeId as keyof typeof model.nodes] !== undefined,
  );
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

  const occupiedWorkstations = state.players
    .map((player) => player.currentWorkstation)
    .filter((workstation) => workstation !== null);
  if (new Set(occupiedWorkstations).size !== occupiedWorkstations.length) {
    violations.push({
      code: 'DUPLICATE_WORKSTATION',
      message: 'A player workstation may be occupied by at most one player',
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

    if (getPlayerParts(state, player.id).length > player.partCapacity) {
      violations.push({
        code: 'PART_CAPACITY_EXCEEDED',
        message: `${player.id} exceeds part capacity ${player.partCapacity}`,
      });
    }

    if (getPlayerDesigns(state, player.id).length > player.designCapacity) {
      violations.push({
        code: 'DESIGN_CAPACITY_EXCEEDED',
        message: `${player.id} exceeds design capacity ${player.designCapacity}`,
      });
    }

    if (player.currentWorkstation === null) {
      if (player.baseShiftsToday !== 0) {
        violations.push({
          code: 'INVALID_BASE_SHIFTS',
          message: `${player.id} has base Shifts without a workstation: ${player.baseShiftsToday}`,
        });
      }
      if (player.currentDepartment !== null) {
        violations.push({
          code: 'WORKSTATION_DEPARTMENT_MISMATCH',
          message: `${player.id} has a current department without a workstation`,
        });
      }
    } else {
      const workstation = getWorkstation(player.currentWorkstation);
      if (player.currentDepartment !== workstation.department) {
        violations.push({
          code: 'WORKSTATION_DEPARTMENT_MISMATCH',
          message: `${player.id} workstation ${workstation.id} belongs to ${workstation.department}, not ${String(player.currentDepartment)}`,
        });
      }
      if (player.baseShiftsToday !== workstation.shifts) {
        violations.push({
          code: 'INVALID_BASE_SHIFTS',
          message: `${player.id} workstation ${workstation.id} grants ${workstation.shifts} base Shifts, got ${player.baseShiftsToday}`,
        });
      }
    }
  }

  if (!isCursorInBounds(state.selectionCursor, state.selectionOrder.length)) {
    violations.push({
      code: 'INVALID_SELECTION_CURSOR',
      message: `Selection cursor ${state.selectionCursor} is outside 0..${state.selectionOrder.length}`,
    });
  }

  if (!isCursorInBounds(state.workCursor, state.workOrder.length)) {
    violations.push({
      code: 'INVALID_WORK_CURSOR',
      message: `Work cursor ${state.workCursor} is outside 0..${state.workOrder.length}`,
    });
  }

  const workOrderIds = new Set(state.workOrder);
  const workOrderContainsOnlyPlayers = state.workOrder.every((playerId) => playerIds.has(playerId));
  const workOrderHasAllPlayers =
    state.workOrder.length === state.players.length &&
    workOrderIds.size === state.players.length &&
    state.players.every((player) => workOrderIds.has(player.id));

  if (
    workOrderIds.size !== state.workOrder.length ||
    !workOrderContainsOnlyPlayers ||
    (state.phase === 'WORK' && !workOrderHasAllPlayers)
  ) {
    violations.push({
      code: 'INVALID_WORK_ORDER',
      message: 'Work order must contain valid unique player IDs and all players during WORK',
    });
  }

  if (getTestTrackCars(state).length > state.content.testingRules.testTrackCapacity) {
    violations.push({
      code: 'TEST_TRACK_CAPACITY_EXCEEDED',
      message: `Test Track exceeds capacity ${state.content.testingRules.testTrackCapacity}`,
    });
  }

  const garageSlots = new Set<string>();
  for (const location of Object.values(state.board.cars)) {
    if (
      location?.kind === 'PLAYER' &&
      location.area === 'garage'
    ) {
      const key = `${location.playerId}:${location.slot}`;
      if (garageSlots.has(key)) {
        violations.push({
          code: 'DUPLICATE_GARAGE_SLOT',
          message: `Garage slot ${key} contains more than one car`,
        });
        break;
      }
      garageSlots.add(key);
    }
  }

  for (const partType of state.content.partTypes) {
    const value = state.board.partValues[partType];
    if (!Number.isInteger(value) || value < 0 || value > state.content.testingRules.maxPartValue) {
      violations.push({
        code: 'INVALID_PART_VALUE',
        message: `${partType} has invalid global value ${value}`,
      });
    }
  }

  for (const location of Object.values(state.board.cars)) {
    if (location?.kind !== 'BOARD' || !location.area.startsWith('assembly-node:')) continue;
    const nodeId = location.area.slice('assembly-node:'.length);
    if (!hasAssemblyNode(state, nodeId)) {
      violations.push({
        code: 'INVALID_ASSEMBLY_LOCATION',
        message: `Car references unknown Assembly node ${nodeId}`,
      });
      break;
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
