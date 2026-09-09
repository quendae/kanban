import { MAX_SHIFTS_PER_DAY } from './constants.js';
import type { GarageBenefit, PartTypeId } from './content.js';
import type { GameCommand } from './commands.js';
import type { RuleErrorCode } from './errors.js';
import type {
  CarId,
  DesignId,
  PartId,
  PlayerId,
  UpgradeSpaceId,
} from './ids.js';
import {
  getPlayerDesigns,
  getPlayerGarageCars,
  getPlayerParts,
  getTestTrackCars,
} from './inventory.js';
import type { EntityLocation, GameState } from './model.js';

export interface ClaimCarPlacement {
  readonly carId: CarId;
  readonly designId: DesignId;
  readonly garageSlot: number;
  readonly replaceCarId: CarId | null;
  readonly benefit: GarageBenefit;
}

export interface ClaimTrackMove {
  readonly carId: CarId;
  readonly location: EntityLocation;
}

export interface ClaimDesignMove {
  readonly designId: DesignId;
  readonly location: EntityLocation;
}

export interface PaceCarMeetingTrigger {
  readonly previousPaceCarPosition: number;
  readonly newPaceCarPosition: number;
  readonly threshold: number;
}

export interface DesignUpgradePlan {
  readonly ok: true;
  readonly playerId: PlayerId;
  readonly designId: DesignId;
  readonly partId: PartId;
  readonly upgradeSpaceId: UpgradeSpaceId;
  readonly partType: PartTypeId;
  readonly doubleUpgrade: boolean;
  readonly previousPartValue: number;
  readonly newPartValue: number;
  readonly ppAwarded: number;
  readonly benefit: GarageBenefit;
}

export interface DesignUpgradeFailure {
  readonly ok: false;
  readonly errors: readonly RuleErrorCode[];
}

export type ClaimCarsPlan =
  | {
      readonly ok: true;
      readonly shiftCost: number;
      readonly placements: readonly ClaimCarPlacement[];
      readonly trackMoves: readonly ClaimTrackMove[];
      readonly designMoves: readonly ClaimDesignMove[];
      readonly garageBenefits: readonly GarageBenefit[];
      readonly paceCarPosition: number;
    }
  | {
      readonly ok: false;
      readonly errors: readonly RuleErrorCode[];
    };

const NONE_BENEFIT: GarageBenefit = { kind: 'NONE' };

function getPlayer(state: GameState, playerId: PlayerId) {
  return state.players.find((player) => player.id === playerId);
}

function maximumUsableShifts(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  if (!player) return 0;
  return Math.min(MAX_SHIFTS_PER_DAY, player.baseShiftsToday + player.bankedShifts);
}

export function getClaimCostSnapshot(
  state: GameState,
): Readonly<Partial<Record<CarId, 1 | 2 | 3>>> {
  const snapshot: Partial<Record<CarId, 1 | 2 | 3>> = {};
  getTestTrackCars(state).forEach((carId, index) => {
    const cost = state.content.testingRules.claimCostByPosition[index];
    if (cost !== undefined) snapshot[carId] = cost;
  });
  return snapshot;
}

export function getPaceCarMeetingTrigger(
  state: GameState,
  newPaceCarPosition: number,
): PaceCarMeetingTrigger | null {
  const previousPaceCarPosition = state.board.paceCarPosition;
  const threshold = state.board.nextMeetingThreshold;
  if (state.meetingScheduled) return null;
  if (previousPaceCarPosition >= threshold) return null;
  if (newPaceCarPosition < threshold) return null;
  return { previousPaceCarPosition, newPaceCarPosition, threshold };
}

export function isTestedDesign(
  state: GameState,
  playerId: PlayerId,
  designId: DesignId,
): boolean {
  if (!getPlayerDesigns(state, playerId).includes(designId)) return false;
  if (state.board.designUpgrades[designId] === undefined) return false;
  const model = state.content.designs[designId]?.model;
  if (model === undefined) return false;
  return getPlayerGarageCars(state, playerId).some(
    (carId) => state.content.cars[carId]?.model === model,
  );
}

function getGarageOccupants(
  state: GameState,
  playerId: PlayerId,
): ReadonlyMap<number, CarId> {
  const occupants = new Map<number, CarId>();
  for (const carId of getPlayerGarageCars(state, playerId)) {
    const location = state.board.cars[carId];
    if (
      location?.kind === 'PLAYER' &&
      location.playerId === playerId &&
      location.area === 'garage'
    ) {
      occupants.set(location.slot, carId);
    }
  }
  return occupants;
}

function centralDeckNextSlot(state: GameState): number {
  let maxSlot = -1;
  for (const location of Object.values(state.board.designs)) {
    if (location?.kind === 'BOARD' && location.area === 'design-deck:central') {
      maxSlot = Math.max(maxSlot, location.slot);
    }
  }
  return maxSlot + 1;
}

function isUpgradeSpaceOccupied(state: GameState, upgradeSpaceId: UpgradeSpaceId): boolean {
  return Object.values(state.board.parts).some(
    (location) => location?.kind === 'BOARD' && location.area === upgradeSpaceId,
  );
}

export function planDesignUpgrade(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'UPGRADE_DESIGN' }>,
): DesignUpgradePlan | DesignUpgradeFailure {
  const errors: RuleErrorCode[] = [];
  const player = getPlayer(state, command.actorId);

  if (state.phase !== 'WORK') errors.push('WRONG_PHASE');
  if (state.activeActorId !== command.actorId) errors.push('NOT_ACTIVE_ACTOR');
  if (player?.currentDepartment !== 'TESTING_INNOVATION') {
    errors.push('NOT_IN_TESTING_INNOVATION');
  }
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (!player) return { ok: false, errors: [...errors, 'WRONG_ACTOR'] };
  if (player.shiftsSpentToday + 1 > maximumUsableShifts(state, command.actorId)) {
    errors.push('INSUFFICIENT_SHIFTS');
  }

  const designLocation = state.board.designs[command.designId];
  if (
    designLocation?.kind !== 'PLAYER' ||
    designLocation.playerId !== command.actorId ||
    designLocation.area !== 'blueprints'
  ) {
    errors.push('UPGRADE_DESIGN_NOT_OWNED');
  }
  const designDefinition = state.content.designs[command.designId];
  if (!designDefinition) errors.push('UPGRADE_DESIGN_DEFINITION_MISSING');
  if (state.board.designUpgrades[command.designId] !== undefined) {
    errors.push('UPGRADE_DESIGN_ALREADY_UPGRADED');
  }
  if (designDefinition?.partType === null) errors.push('UPGRADE_DESIGN_PART_TYPE_MISSING');

  if (!getPlayerParts(state, command.actorId).includes(command.partId)) {
    errors.push('UPGRADE_PART_NOT_OWNED');
  }
  const partDefinition = state.content.parts[command.partId];
  if (!partDefinition) errors.push('UPGRADE_PART_DEFINITION_MISSING');
  if (
    designDefinition?.partType !== null &&
    designDefinition?.partType !== undefined &&
    partDefinition !== undefined &&
    designDefinition.partType !== partDefinition.type
  ) {
    errors.push('UPGRADE_PART_TYPE_MISMATCH');
  }

  const spaceDefinition = state.content.upgradeSpaces[command.upgradeSpaceId];
  if (!spaceDefinition) errors.push('UPGRADE_SPACE_DEFINITION_MISSING');
  if (
    spaceDefinition?.model !== null &&
    spaceDefinition?.model !== undefined &&
    designDefinition !== undefined &&
    spaceDefinition.model !== designDefinition.model
  ) {
    errors.push('UPGRADE_SPACE_MODEL_MISMATCH');
  }
  if (
    spaceDefinition?.partType !== null &&
    spaceDefinition?.partType !== undefined &&
    partDefinition !== undefined &&
    spaceDefinition.partType !== partDefinition.type
  ) {
    errors.push('UPGRADE_SPACE_PART_TYPE_MISMATCH');
  }
  if (isUpgradeSpaceOccupied(state, command.upgradeSpaceId)) {
    errors.push('UPGRADE_SPACE_OCCUPIED');
  }

  const partType = partDefinition?.type;
  if (command.doubleUpgrade) {
    if (!player.certifications.includes('TESTING_INNOVATION')) {
      errors.push('DOUBLE_UPGRADE_REQUIRES_CERTIFICATION');
    }
    if (player.doubleUpgradeUsed) errors.push('DOUBLE_UPGRADE_ALREADY_USED');
    if (partType !== undefined && state.board.doubleUpgradedPartTypes[partType] !== undefined) {
      errors.push('DOUBLE_UPGRADE_PART_TYPE_RESERVED');
    }
  }

  if (errors.length > 0 || partType === undefined || designDefinition === undefined || spaceDefinition === undefined) {
    return { ok: false, errors: [...new Set(errors)] };
  }

  const previousPartValue = state.board.partValues[partType] ?? 0;
  const increase = command.doubleUpgrade ? 2 : 1;
  const newPartValue = Math.min(
    state.content.testingRules.maxPartValue,
    previousPartValue + increase,
  );
  const ppAwarded = 2 + (command.doubleUpgrade ? newPartValue : 0);

  return {
    ok: true,
    playerId: command.actorId,
    designId: command.designId,
    partId: command.partId,
    upgradeSpaceId: command.upgradeSpaceId,
    partType,
    doubleUpgrade: command.doubleUpgrade,
    previousPartValue,
    newPartValue,
    ppAwarded,
    benefit: spaceDefinition.benefit,
  };
}

export function planCarClaim(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'CLAIM_CARS' }>,
): ClaimCarsPlan {
  const errors: RuleErrorCode[] = [];
  const player = getPlayer(state, command.actorId);

  if (state.phase !== 'WORK') errors.push('WRONG_PHASE');
  if (state.activeActorId !== command.actorId) errors.push('NOT_ACTIVE_ACTOR');
  if (player?.currentDepartment !== 'TESTING_INNOVATION') {
    errors.push('NOT_IN_TESTING_INNOVATION');
  }
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (!player) return { ok: false, errors: [...errors, 'WRONG_ACTOR'] };
  if (command.claims.length === 0) errors.push('CLAIM_EMPTY');

  const snapshot = getClaimCostSnapshot(state);
  const trackCars = getTestTrackCars(state);
  const trackSet = new Set(trackCars);
  const garageOccupants = getGarageOccupants(state, command.actorId);
  const garageIsFull = garageOccupants.size >= player.garageCapacity;
  const seenCars = new Set<CarId>();
  const seenDesigns = new Set<DesignId>();
  const seenSlots = new Set<number>();
  let shiftCost = 0;

  for (const claim of command.claims) {
    if (seenCars.has(claim.carId)) errors.push('CLAIM_DUPLICATE_CAR');
    seenCars.add(claim.carId);
    if (seenDesigns.has(claim.designId)) errors.push('CLAIM_DUPLICATE_DESIGN');
    seenDesigns.add(claim.designId);
    if (seenSlots.has(claim.garageSlot)) errors.push('GARAGE_DESTINATION_CONFLICT');
    seenSlots.add(claim.garageSlot);

    if (!trackSet.has(claim.carId)) errors.push('CLAIM_CAR_NOT_AVAILABLE');
    const cost = snapshot[claim.carId];
    if (cost !== undefined) shiftCost += cost;

    const designLocation = state.board.designs[claim.designId];
    if (
      designLocation?.kind !== 'PLAYER' ||
      designLocation.playerId !== command.actorId ||
      designLocation.area !== 'blueprints'
    ) {
      errors.push('CLAIM_DESIGN_NOT_OWNED');
    }

    const carDefinition = state.content.cars[claim.carId];
    const designDefinition = state.content.designs[claim.designId];
    if (!carDefinition) errors.push('CLAIM_CAR_DEFINITION_MISSING');
    if (!designDefinition) errors.push('CLAIM_DESIGN_DEFINITION_MISSING');
    if (
      carDefinition !== undefined &&
      designDefinition !== undefined &&
      carDefinition.model !== designDefinition.model
    ) {
      errors.push('CLAIM_DESIGN_MODEL_MISMATCH');
    }

    if (
      !Number.isInteger(claim.garageSlot) ||
      claim.garageSlot < 0 ||
      claim.garageSlot >= player.garageCapacity
    ) {
      errors.push('GARAGE_SLOT_INVALID');
      continue;
    }

    const occupant = garageOccupants.get(claim.garageSlot) ?? null;
    if (claim.replaceCarId !== undefined) {
      if (!garageIsFull) errors.push('GARAGE_REPLACEMENT_TOO_EARLY');
      if (occupant !== claim.replaceCarId) errors.push('GARAGE_REPLACEMENT_INVALID');
    } else if (occupant !== null) {
      errors.push('GARAGE_SLOT_OCCUPIED');
    }
  }

  if (player.shiftsSpentToday + shiftCost > maximumUsableShifts(state, command.actorId)) {
    errors.push('INSUFFICIENT_SHIFTS');
  }

  if (errors.length > 0) return { ok: false, errors: [...new Set(errors)] };

  const centralStart = centralDeckNextSlot(state);
  const garageBenefits = state.content.garageBenefits ?? [];
  const placements: ClaimCarPlacement[] = command.claims.map((claim) => {
    const isReplacement = claim.replaceCarId !== undefined;
    return {
      carId: claim.carId,
      designId: claim.designId,
      garageSlot: claim.garageSlot,
      replaceCarId: claim.replaceCarId ?? null,
      benefit: isReplacement
        ? NONE_BENEFIT
        : (garageBenefits[claim.garageSlot] ?? NONE_BENEFIT),
    };
  });
  const claimedCars = new Set(placements.map((claim) => claim.carId));
  const remainingTrackCars = trackCars.filter((carId) => !claimedCars.has(carId));
  const trackMoves: ClaimTrackMove[] = remainingTrackCars.map((carId, slot) => ({
    carId,
    location: { kind: 'BOARD', area: 'test-track', slot },
  }));
  const designMoves: ClaimDesignMove[] = placements.map((claim, index) => ({
    designId: claim.designId,
    location: { kind: 'BOARD', area: 'design-deck:central', slot: centralStart + index },
  }));

  return {
    ok: true,
    shiftCost,
    placements,
    trackMoves,
    designMoves,
    garageBenefits: placements.map((claim) => claim.benefit),
    paceCarPosition: state.board.paceCarPosition + placements.length,
  };
}
