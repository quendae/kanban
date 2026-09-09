import { MAX_SHIFTS_PER_DAY } from './constants.js';
import type { GarageBenefit } from './content.js';
import type { GameCommand } from './commands.js';
import type { RuleErrorCode } from './errors.js';
import type { CarId, DesignId, PlayerId } from './ids.js';
import { getPlayerGarageCars, getTestTrackCars } from './inventory.js';
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

  const maximumUsable = Math.min(
    MAX_SHIFTS_PER_DAY,
    player.baseShiftsToday + player.bankedShifts,
  );
  if (player.shiftsSpentToday + shiftCost > maximumUsable) errors.push('INSUFFICIENT_SHIFTS');

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
