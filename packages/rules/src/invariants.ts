import { MAX_SHIFTS_PER_DAY } from './constants.js';
import type { ModelId, PartTypeId } from './content.js';
import type { DesignId, UpgradeSpaceId } from './ids.js';
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
  | 'INVALID_TEST_TRACK_ORDER'
  | 'DUPLICATE_GARAGE_SLOT'
  | 'INVALID_GARAGE_OCCUPANCY'
  | 'INVALID_PART_VALUE'
  | 'INVALID_ASSEMBLY_LOCATION'
  | 'INVALID_INNOVATION_OCCUPANCY'
  | 'DOUBLE_UPGRADE_OWNERSHIP_CONFLICT';

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

function getAssemblyModel(state: GameState, modelId: ModelId) {
  return state.content.assemblyGraph.models[modelId];
}

function hasAssemblyNodeForCar(state: GameState, carId: string, nodeId: string): boolean {
  const car = state.content.cars[carId as keyof typeof state.content.cars];
  if (!car) return false;
  const graph = getAssemblyModel(state, car.model);
  return graph?.nodes[nodeId as keyof typeof graph.nodes] !== undefined;
}

function testTrackOrderIsCompact(state: GameState): boolean {
  const slots = Object.values(state.board.cars)
    .filter(
      (location) => location?.kind === 'BOARD' && location.area === 'test-track',
    )
    .map((location) => location!.slot)
    .sort((a, b) => a - b);

  return slots.every((slot, index) => Number.isInteger(slot) && slot === index);
}

function addAssemblyLocationViolations(
  state: GameState,
  violations: InvariantViolation[],
): void {
  for (const [carId, location] of Object.entries(state.board.cars)) {
    if (location?.kind !== 'BOARD') continue;

    if (location.area.startsWith('assembly-node:')) {
      const nodeId = location.area.slice('assembly-node:'.length);
      if (!hasAssemblyNodeForCar(state, carId, nodeId)) {
        violations.push({
          code: 'INVALID_ASSEMBLY_LOCATION',
          message: `Car ${carId} references invalid Assembly node ${nodeId}`,
        });
        return;
      }
      continue;
    }

    if (location.area.startsWith('assembly:')) {
      const modelId = location.area.slice('assembly:'.length) as ModelId;
      const graph = getAssemblyModel(state, modelId);
      const car = state.content.cars[carId as keyof typeof state.content.cars];
      if (
        !graph ||
        !car ||
        car.model !== modelId ||
        !Number.isInteger(location.slot) ||
        location.slot < 0
      ) {
        violations.push({
          code: 'INVALID_ASSEMBLY_LOCATION',
          message: `Car ${carId} has invalid Assembly location ${location.area}:${location.slot}`,
        });
        return;
      }
    }
  }

  const occupiedAssemblyPartSlots = new Set<string>();
  for (const [partId, location] of Object.entries(state.board.parts)) {
    if (location?.kind !== 'BOARD' || !location.area.startsWith('assembly:')) continue;
    const modelId = location.area.slice('assembly:'.length) as ModelId;
    const graph = getAssemblyModel(state, modelId);
    const slotKey = `${modelId}:${location.slot}`;
    if (
      !graph ||
      !Number.isInteger(location.slot) ||
      location.slot < 0 ||
      location.slot >= graph.assemblySlots ||
      occupiedAssemblyPartSlots.has(slotKey)
    ) {
      violations.push({
        code: 'INVALID_ASSEMBLY_LOCATION',
        message: `Part ${partId} has invalid Assembly location ${location.area}:${location.slot}`,
      });
      return;
    }
    occupiedAssemblyPartSlots.add(slotKey);
  }
}

function addInnovationOccupancyViolations(
  state: GameState,
  violations: InvariantViolation[],
): void {
  const occupiedSpaces = new Set<UpgradeSpaceId>();
  for (const [partId, location] of Object.entries(state.board.parts)) {
    if (location?.kind !== 'BOARD' || !location.area.startsWith('upgrade-space:')) continue;
    const upgradeSpaceId = location.area as UpgradeSpaceId;
    const space = state.content.upgradeSpaces[upgradeSpaceId];
    const part = state.content.parts[partId as keyof typeof state.content.parts];
    const invalid =
      !space ||
      !part ||
      location.slot !== 0 ||
      occupiedSpaces.has(upgradeSpaceId) ||
      (space.partType !== null && space.partType !== part.type);

    if (invalid) {
      violations.push({
        code: 'INVALID_INNOVATION_OCCUPANCY',
        message: `Part ${partId} has invalid Innovation occupancy at ${location.area}:${location.slot}`,
      });
      return;
    }
    occupiedSpaces.add(upgradeSpaceId);
  }
}

function addDoubleUpgradeOwnershipViolations(
  state: GameState,
  violations: InvariantViolation[],
): void {
  const doubleDesignsByPartType = new Map<PartTypeId, DesignId[]>();
  for (const [rawDesignId, upgrade] of Object.entries(state.board.designUpgrades)) {
    if (!upgrade?.doubleUpgrade) continue;
    const designId = rawDesignId as DesignId;
    const designs = doubleDesignsByPartType.get(upgrade.partType) ?? [];
    designs.push(designId);
    doubleDesignsByPartType.set(upgrade.partType, designs);
  }

  const reservationCountByPlayer = new Map<string, number>();
  let conflict = false;
  for (const [rawPartType, ownerId] of Object.entries(state.board.doubleUpgradedPartTypes)) {
    if (ownerId === undefined) continue;
    const partType = rawPartType as PartTypeId;
    const owner = state.players.find((player) => player.id === ownerId);
    const matchingDesigns = doubleDesignsByPartType.get(partType) ?? [];
    reservationCountByPlayer.set(ownerId, (reservationCountByPlayer.get(ownerId) ?? 0) + 1);

    if (!owner || !owner.doubleUpgradeUsed || matchingDesigns.length !== 1) {
      conflict = true;
      break;
    }

    for (const designId of matchingDesigns) {
      const location = state.board.designs[designId];
      if (
        location?.kind === 'PLAYER' &&
        location.area === 'blueprints' &&
        location.playerId !== ownerId
      ) {
        conflict = true;
        break;
      }
    }
    if (conflict) break;
  }

  if (!conflict) {
    for (const partType of doubleDesignsByPartType.keys()) {
      if (state.board.doubleUpgradedPartTypes[partType] === undefined) {
        conflict = true;
        break;
      }
    }
  }

  if (!conflict) {
    for (const [playerId, count] of reservationCountByPlayer) {
      if (count > 1) {
        conflict = true;
        break;
      }
      const player = state.players.find((candidate) => candidate.id === playerId);
      if (!player?.doubleUpgradeUsed) {
        conflict = true;
        break;
      }
    }
  }

  if (!conflict) {
    for (const player of state.players) {
      if (player.doubleUpgradeUsed && (reservationCountByPlayer.get(player.id) ?? 0) !== 1) {
        conflict = true;
        break;
      }
    }
  }

  if (conflict) {
    violations.push({
      code: 'DOUBLE_UPGRADE_OWNERSHIP_CONFLICT',
      message: 'Double-upgrade Design state, PartType reservation and player ownership must agree',
    });
  }
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

  if (!testTrackOrderIsCompact(state)) {
    violations.push({
      code: 'INVALID_TEST_TRACK_ORDER',
      message: 'Test Track slots must be unique and compact from slot 0',
    });
  }

  const garageSlots = new Set<string>();
  for (const location of Object.values(state.board.cars)) {
    if (location?.kind === 'PLAYER' && location.area === 'garage') {
      const owner = state.players.find((player) => player.id === location.playerId);
      if (
        !owner ||
        !Number.isInteger(location.slot) ||
        location.slot < 0 ||
        location.slot >= owner.garageCapacity
      ) {
        violations.push({
          code: 'INVALID_GARAGE_OCCUPANCY',
          message: `Garage location ${location.playerId}:${location.slot} is outside its owner capacity`,
        });
      }

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

  const manifestPartTypes = new Set<PartTypeId>(state.content.partTypes);
  for (const rawPartType of Object.keys(state.board.partValues)) {
    if (!manifestPartTypes.has(rawPartType as PartTypeId)) {
      violations.push({
        code: 'INVALID_PART_VALUE',
        message: `${rawPartType} exists in global part values but not in the content manifest`,
      });
      break;
    }
  }

  for (const partType of state.content.partTypes) {
    const value = state.board.partValues[partType];
    if (
      value === undefined ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > state.content.testingRules.maxPartValue
    ) {
      violations.push({
        code: 'INVALID_PART_VALUE',
        message: `${partType} has invalid global value ${String(value)}`,
      });
    }
  }

  addAssemblyLocationViolations(state, violations);
  addInnovationOccupancyViolations(state, violations);
  addDoubleUpgradeOwnershipViolations(state, violations);

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
