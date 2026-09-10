import {
  getEffectiveWorkDepartment,
  getTrainableDepartments,
  MICROMANAGE_DEPARTMENTS,
} from './administration.js';
import {
  getAssemblyDestinationSlot,
  getAssemblyPathChoiceSequences,
  getAssemblyTurnStartCleanupPartIds,
  getMissingUpgradedPartTypes,
  hasAssemblyCarAvailable,
  isPlayerAssemblyPart,
  planAssemblyPush,
  previewAssemblyTurnStartCleanup,
} from './assembly.js';
import type { GameCommand } from './commands.js';
import { MAX_SHIFTS_PER_DAY } from './constants.js';
import { getGameRules } from './content.js';
import {
  getMatchingDemandId,
  planDemandRefresh,
  willCompleteAssemblyModel,
} from './demand.js';
import {
  getOldestDesignBonus,
  getOpenBlueprintSlot,
  getSelectableDesignIds,
  hasDesignCapacity,
  planDesignReplenishment,
} from './design.js';
import type { RuleErrorCode } from './errors.js';
import type { GameEvent } from './events.js';
import { planFactoryGoalAwards } from './factory-goals.js';
import { planTrainingAdvance } from './hr.js';
import { makeId, type PlayerId, type UpgradeSpaceId } from './ids.js';
import { assertInvariants } from './invariants.js';
import {
  getAssemblyParts,
  getPlayerDesigns,
  getPlayerParts,
  getRecyclingParts,
  getWarehouseParts,
} from './inventory.js';
import {
  getMaximumCollectableQuantity,
  getPartCollection,
  planKanbanOrderRefill,
} from './logistics.js';
import type { GameState, PlayerState } from './model.js';
import { getRecyclingSwapPlan } from './recycling.js';
import { reduceEvent } from './reducer.js';
import { planSandraVisit } from './sandra.js';
import {
  getPaceCarMeetingTrigger,
  planCarClaim,
  planDesignUpgrade,
} from './testing.js';
import { getWorkstation, WORKSTATIONS, type WorkstationId } from './workstations.js';

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

function getPlayer(state: GameState, playerId: PlayerId): PlayerState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Unknown player: ${playerId}`);
  return player;
}

export function getBaseShifts(state: GameState, playerId: PlayerId): number {
  return getPlayer(state, playerId).baseShiftsToday;
}

export function getMaximumUsableShifts(state: GameState, playerId: PlayerId): number {
  const player = getPlayer(state, playerId);
  return Math.min(MAX_SHIFTS_PER_DAY, player.baseShiftsToday + player.bankedShifts);
}

function isWorkstationOccupied(state: GameState, workstationId: WorkstationId): boolean {
  return state.players.some((player) => player.currentWorkstation === workstationId);
}

function selectionErrors(
  state: GameState,
  playerId: PlayerId,
  workstationId: WorkstationId,
): readonly RuleErrorCode[] {
  const errors: RuleErrorCode[] = [];
  if (state.phase !== 'SELECT_DEPARTMENT') errors.push('WRONG_PHASE');
  if (state.activeActorId !== playerId) errors.push('NOT_ACTIVE_ACTOR');

  const station = getWorkstation(workstationId);
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (station.reservedForSandra) errors.push('WORKSTATION_RESERVED');
  if (isWorkstationOccupied(state, workstationId)) errors.push('WORKSTATION_OCCUPIED');
  if (player?.previousDepartment === station.department) {
    errors.push('SAME_DEPARTMENT_AS_PREVIOUS_DAY');
  }
  if (
    state.playerCount === 2 &&
    state.sandra.department !== 'SANDRA_DESK' &&
    state.sandra.department === station.department
  ) {
    errors.push('SANDRA_DEPARTMENT_BLOCKED');
  }
  return errors;
}

function activeWorkErrors(state: GameState, playerId: PlayerId): RuleErrorCode[] {
  const errors: RuleErrorCode[] = [];
  if (state.phase !== 'WORK') errors.push('WRONG_PHASE');
  if (state.activeActorId !== playerId) errors.push('NOT_ACTIVE_ACTOR');
  return errors;
}

function hasAvailableShift(state: GameState, playerId: PlayerId): boolean {
  return getPlayer(state, playerId).shiftsSpentToday < getMaximumUsableShifts(state, playerId);
}

function canSpendShiftCost(state: GameState, playerId: PlayerId, cost: number): boolean {
  return getPlayer(state, playerId).shiftsSpentToday + cost <= getMaximumUsableShifts(state, playerId);
}

function startDesignSelectionErrors(
  state: GameState,
  playerId: PlayerId,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (getEffectiveWorkDepartment(state, playerId) !== 'DESIGN') errors.push('NOT_IN_DESIGN');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  return errors;
}

function takeDesignErrors(
  state: GameState,
  playerId: PlayerId,
  designId: Extract<GameCommand, { readonly type: 'TAKE_DESIGN' }>['designId'],
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (
    state.activeDepartmentAction?.kind !== 'DESIGN_SELECTION' ||
    state.activeDepartmentAction.playerId !== playerId
  ) {
    errors.push('NO_ACTIVE_DESIGN_SELECTION');
  }
  if (!getSelectableDesignIds(state, playerId).includes(designId)) {
    errors.push('DESIGN_NOT_AVAILABLE');
  }
  if (!hasDesignCapacity(state, playerId)) errors.push('NO_DESIGN_SLOT');
  if (!hasAvailableShift(state, playerId)) errors.push('INSUFFICIENT_SHIFTS');
  return errors;
}

function endDesignSelectionErrors(
  state: GameState,
  playerId: PlayerId,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (
    state.activeDepartmentAction?.kind !== 'DESIGN_SELECTION' ||
    state.activeDepartmentAction.playerId !== playerId
  ) {
    errors.push('NO_ACTIVE_DESIGN_SELECTION');
  }
  return errors;
}

function collectPartsErrors(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'COLLECT_PARTS' }>,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, command.actorId);
  if (getEffectiveWorkDepartment(state, command.actorId) !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');

  if (!Number.isInteger(command.quantity) || command.quantity < 1) {
    errors.push('INVALID_QUANTITY');
    return errors;
  }
  if (getWarehouseParts(state, command.partType).length < command.quantity) {
    errors.push('PARTS_NOT_AVAILABLE');
  }
  if (getPartCollection(state, command.actorId, command.partType, command.quantity) === null) {
    const stockIsEnough = getWarehouseParts(state, command.partType).length >= command.quantity;
    if (stockIsEnough) errors.push('NO_PART_STORAGE');
  }
  if (!hasAvailableShift(state, command.actorId)) errors.push('INSUFFICIENT_SHIFTS');
  return errors;
}

function issueKanbanOrderErrors(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'ISSUE_KANBAN_ORDER' }>,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, command.actorId);
  const player = getPlayer(state, command.actorId);
  if (getEffectiveWorkDepartment(state, command.actorId) !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (!player.kanbanOrders.includes(command.orderId)) errors.push('KANBAN_ORDER_NOT_IN_HAND');
  if (player.kanbanOrderIssuedToday) errors.push('KANBAN_ORDER_ALREADY_ISSUED');
  if (!state.content.kanbanOrders[command.orderId]) errors.push('KANBAN_ORDER_DEFINITION_MISSING');
  if (!hasAvailableShift(state, command.actorId)) errors.push('INSUFFICIENT_SHIFTS');
  return errors;
}

function takePartsVoucherErrors(
  state: GameState,
  playerId: PlayerId,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  const player = getPlayer(state, playerId);
  if (getEffectiveWorkDepartment(state, playerId) !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (!player.certifications.includes('LOGISTICS')) {
    errors.push('LOGISTICS_VOUCHER_REQUIRES_CERTIFICATION');
  }
  if (player.logisticsVoucherTakenToday) errors.push('LOGISTICS_VOUCHER_ALREADY_TAKEN');
  const shiftCost = getGameRules(state.content).logisticsVoucherShiftCost;
  if (!canSpendShiftCost(state, playerId, shiftCost)) errors.push('INSUFFICIENT_SHIFTS');
  return errors;
}

function provideAssemblyPartErrors(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'PROVIDE_ASSEMBLY_PART' }>,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, command.actorId);
  if (getEffectiveWorkDepartment(state, command.actorId) !== 'ASSEMBLY') errors.push('NOT_IN_ASSEMBLY');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');

  const preparedState = previewAssemblyTurnStartCleanup(state, command.actorId);
  const graph = preparedState.content.assemblyGraph.models[command.model];
  if (!graph) {
    errors.push('ASSEMBLY_MODEL_DEFINITION_MISSING');
    return errors;
  }

  if (!isPlayerAssemblyPart(preparedState, command.actorId, command.partId)) {
    errors.push('ASSEMBLY_PART_NOT_OWNED');
  }
  const part = preparedState.content.parts[command.partId];
  if (!part) errors.push('ASSEMBLY_PART_DEFINITION_MISSING');

  if (!hasAvailableShift(preparedState, command.actorId)) errors.push('INSUFFICIENT_SHIFTS');
  if (!hasAssemblyCarAvailable(preparedState, command.model)) {
    errors.push('ASSEMBLY_CAR_NOT_AVAILABLE');
  }
  if (getAssemblyDestinationSlot(preparedState, command.model) === null) {
    errors.push('ASSEMBLY_SPACES_FULL');
  }

  if (part) {
    const presentTypes = new Set(
      getAssemblyParts(preparedState, command.model)
        .map((partId) => preparedState.content.parts[partId]?.type)
        .filter((partType) => partType !== undefined),
    );
    if (presentTypes.has(part.type)) errors.push('ASSEMBLY_PART_TYPE_ALREADY_PRESENT');

    const missingUpgraded = getMissingUpgradedPartTypes(preparedState, command.model);
    if (missingUpgraded.length > 0 && !missingUpgraded.includes(part.type)) {
      errors.push('ASSEMBLY_UPGRADED_PARTS_REQUIRED_FIRST');
    }
  }

  if (hasAssemblyCarAvailable(preparedState, command.model)) {
    const pushPlan = planAssemblyPush(preparedState, command.model, command.pathChoices ?? []);
    if (!pushPlan.ok) {
      switch (pushPlan.reason) {
        case 'PATH_CHOICE_REQUIRED': errors.push('ASSEMBLY_PATH_CHOICE_REQUIRED'); break;
        case 'INVALID_PATH_CHOICE': errors.push('ASSEMBLY_PATH_CHOICE_INVALID'); break;
        case 'CAR_NOT_AVAILABLE':
          if (!errors.includes('ASSEMBLY_CAR_NOT_AVAILABLE')) errors.push('ASSEMBLY_CAR_NOT_AVAILABLE');
          break;
        default: errors.push('ASSEMBLY_PUSH_GRAPH_INVALID'); break;
      }
    }
  }
  return errors;
}

function claimCarsErrors(state: GameState, command: Extract<GameCommand, { readonly type: 'CLAIM_CARS' }>): readonly RuleErrorCode[] {
  const plan = planCarClaim(state, command);
  return plan.ok ? [] : plan.errors;
}

function upgradeDesignErrors(state: GameState, command: Extract<GameCommand, { readonly type: 'UPGRADE_DESIGN' }>): readonly RuleErrorCode[] {
  const plan = planDesignUpgrade(state, command);
  return plan.ok ? [] : plan.errors;
}

function trainingErrors(state: GameState, command: Extract<GameCommand, { readonly type: 'TRAIN_DEPARTMENT' }>): readonly RuleErrorCode[] {
  const plan = planTrainingAdvance(state, command);
  return plan.ok ? [] : plan.errors;
}

function awardPlaqueChoiceErrors(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'CHOOSE_AWARD_PLAQUE' }>,
): readonly RuleErrorCode[] {
  const pending = state.pendingAwardPlaqueChoice;
  if (pending === null) return ['AWARD_PLAQUE_CHOICE_NOT_PENDING'];

  const errors: RuleErrorCode[] = [];
  if (pending.playerId !== command.actorId) errors.push('WRONG_ACTOR');
  if (pending.department !== command.department) errors.push('AWARD_PLAQUE_CHOICE_NOT_PENDING');
  if (!state.board.awardPlaquePools[command.department].includes(command.plaqueId)) {
    errors.push('AWARD_PLAQUE_NOT_AVAILABLE');
  }
  if (!state.content.awardPlaques[command.plaqueId]) {
    errors.push('AWARD_PLAQUE_DEFINITION_MISSING');
  }
  return errors;
}

function redSeatConversionErrors(state: GameState, playerId: PlayerId): readonly RuleErrorCode[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return ['WRONG_ACTOR'];

  const errors: RuleErrorCode[] = [];
  if (state.phase === 'MEETING') errors.push('RED_SEAT_CONVERSION_DURING_MEETING');
  if (state.phase === 'SETUP' || state.phase === 'FINAL_SCORE' || state.phase === 'GAME_OVER') {
    errors.push('WRONG_PHASE');
  }
  if (player.genericRedSeats < 1) errors.push('RED_SEAT_REQUIRED');
  if (player.conferenceSeatsFaceDown < 1) errors.push('FACE_DOWN_SEAT_REQUIRED');
  return errors;
}

function micromanageErrors(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'START_MICROMANAGE' }>,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, command.actorId);
  const player = state.players.find((candidate) => candidate.id === command.actorId);
  if (!player) return [...errors, 'WRONG_ACTOR'];
  if (player.currentDepartment !== 'ADMINISTRATION') errors.push('NOT_IN_ADMINISTRATION');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (player.micromanagedDepartment !== null) errors.push('MICROMANAGE_ALREADY_SELECTED');
  return errors;
}

function recyclingSwapErrors(state: GameState, command: Extract<GameCommand, { readonly type: 'SWAP_RECYCLING_PART' }>): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, command.actorId);
  const plan = getRecyclingSwapPlan(state, command.actorId, command.outgoingPartId, command.incomingPartId);
  if (!plan.ok) {
    switch (plan.reason) {
      case 'OUTGOING_NOT_OWNED': errors.push('RECYCLING_OUTGOING_NOT_OWNED'); break;
      case 'INCOMING_NOT_AVAILABLE': errors.push('RECYCLING_INCOMING_NOT_AVAILABLE'); break;
      case 'TYPE_OCCUPIED': errors.push('RECYCLING_TYPE_OCCUPIED'); break;
      case 'PART_DEFINITION_MISSING': errors.push('RECYCLING_PART_DEFINITION_MISSING'); break;
      case 'POOL_INVALID': errors.push('RECYCLING_POOL_INVALID'); break;
    }
  }
  return errors;
}

function getLegalRecyclingCommands(state: GameState, playerId: PlayerId): GameCommand[] {
  if (state.phase !== 'WORK' || state.activeActorId !== playerId) return [];
  const commands: GameCommand[] = [];
  for (const outgoingPartId of getPlayerParts(state, playerId)) {
    for (const incomingPartId of getRecyclingParts(state)) {
      const command: GameCommand = { type: 'SWAP_RECYCLING_PART', actorId: playerId, outgoingPartId, incomingPartId };
      if (recyclingSwapErrors(state, command).length === 0) commands.push(command);
    }
  }
  return commands;
}

function getLegalAssemblyCommands(state: GameState, playerId: PlayerId): GameCommand[] {
  if (state.phase !== 'WORK' || state.activeActorId !== playerId || getEffectiveWorkDepartment(state, playerId) !== 'ASSEMBLY' || state.activeDepartmentAction !== null) return [];
  const preparedState = previewAssemblyTurnStartCleanup(state, playerId);
  const commands: GameCommand[] = [];
  for (const model of state.content.models) {
    const pathSequences = getAssemblyPathChoiceSequences(preparedState, model);
    for (const partId of getPlayerParts(state, playerId)) {
      for (const pathChoices of pathSequences) {
        const command: GameCommand = pathChoices.length === 0
          ? { type: 'PROVIDE_ASSEMBLY_PART', actorId: playerId, model, partId }
          : { type: 'PROVIDE_ASSEMBLY_PART', actorId: playerId, model, partId, pathChoices };
        if (provideAssemblyPartErrors(state, command).length === 0) commands.push(command);
      }
    }
  }
  return commands;
}

function getLegalTestingCommands(state: GameState, playerId: PlayerId): GameCommand[] {
  if (state.phase !== 'WORK' || state.activeActorId !== playerId || getEffectiveWorkDepartment(state, playerId) !== 'TESTING_INNOVATION' || state.activeDepartmentAction !== null) return [];
  const commands: GameCommand[] = [];
  const upgradeSpaceIds = Object.keys(state.content.upgradeSpaces) as UpgradeSpaceId[];
  for (const designId of getPlayerDesigns(state, playerId)) {
    for (const partId of getPlayerParts(state, playerId)) {
      for (const upgradeSpaceId of upgradeSpaceIds) {
        for (const doubleUpgrade of [false, true] as const) {
          const command: GameCommand = { type: 'UPGRADE_DESIGN', actorId: playerId, designId, partId, upgradeSpaceId, doubleUpgrade };
          if (upgradeDesignErrors(state, command).length === 0) commands.push(command);
        }
      }
    }
  }
  return commands;
}

function finishWorkErrors(state: GameState, playerId: PlayerId): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  return errors;
}

function getRedSeatConversionCommands(state: GameState, playerId: PlayerId): GameCommand[] {
  return redSeatConversionErrors(state, playerId).length === 0
    ? [{ type: 'CONVERT_RED_SEAT', actorId: playerId }]
    : [];
}

function getMicromanageCommands(state: GameState, playerId: PlayerId): GameCommand[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (
    state.phase !== 'WORK' ||
    state.activeActorId !== playerId ||
    player?.currentDepartment !== 'ADMINISTRATION' ||
    player.micromanagedDepartment !== null ||
    state.activeDepartmentAction !== null
  ) {
    return [];
  }
  return MICROMANAGE_DEPARTMENTS.map((department) => ({
    type: 'START_MICROMANAGE' as const,
    actorId: playerId,
    department,
  }));
}

export function getLegalCommands(state: GameState, playerId: PlayerId): readonly GameCommand[] {
  const pendingPlaque = state.pendingAwardPlaqueChoice;
  if (pendingPlaque !== null) {
    if (pendingPlaque.playerId !== playerId) return [];
    return state.board.awardPlaquePools[pendingPlaque.department]
      .filter((plaqueId) => state.content.awardPlaques[plaqueId] !== undefined)
      .map((plaqueId) => ({
        type: 'CHOOSE_AWARD_PLAQUE' as const,
        actorId: playerId,
        department: pendingPlaque.department,
        plaqueId,
      }));
  }

  const globalCommands = getRedSeatConversionCommands(state, playerId);

  if (state.phase === 'SETUP') {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player || player.kind !== 'HUMAN' || player.id !== 'player:0') return [];
    return [{ type: 'START_GAME', actorId: playerId }, ...globalCommands];
  }
  if (state.phase === 'SELECT_DEPARTMENT' && state.activeActorId === playerId) {
    return [
      ...WORKSTATIONS.filter((station) => selectionErrors(state, playerId, station.id).length === 0).map((station) => ({ type: 'SELECT_WORKSTATION' as const, actorId: playerId, workstationId: station.id })),
      ...globalCommands,
    ];
  }
  if (state.phase === 'WORK' && state.activeActorId === playerId) {
    const recyclingCommands = getLegalRecyclingCommands(state, playerId);
    if (state.activeDepartmentAction?.kind === 'DESIGN_SELECTION' && state.activeDepartmentAction.playerId === playerId) {
      const takeCommands = getSelectableDesignIds(state, playerId).filter((designId) => takeDesignErrors(state, playerId, designId).length === 0).map((designId) => ({ type: 'TAKE_DESIGN' as const, actorId: playerId, designId }));
      return [...takeCommands, ...recyclingCommands, ...globalCommands, { type: 'END_DESIGN_SELECTION' as const, actorId: playerId }];
    }
    const commands: GameCommand[] = [
      { type: 'FINISH_WORK', actorId: playerId },
      ...recyclingCommands,
      ...globalCommands,
      ...getMicromanageCommands(state, playerId),
      ...getLegalAssemblyCommands(state, playerId),
      ...getLegalTestingCommands(state, playerId),
    ];
    if (startDesignSelectionErrors(state, playerId).length === 0) commands.push({ type: 'START_DESIGN_SELECTION', actorId: playerId });

    if (state.activeDepartmentAction === null) {
      for (const department of getTrainableDepartments(state, playerId)) {
        for (const source of ['SHIFT', 'BOOK'] as const) {
          const command: GameCommand = { type: 'TRAIN_DEPARTMENT', actorId: playerId, department, source };
          if (trainingErrors(state, command).length === 0) commands.push(command);
        }
      }
    }

    const player = getPlayer(state, playerId);
    if (getEffectiveWorkDepartment(state, playerId) === 'LOGISTICS' && state.activeDepartmentAction === null) {
      if (hasAvailableShift(state, playerId)) {
        for (const partType of state.content.partTypes) {
          const maximum = getMaximumCollectableQuantity(state, playerId, partType);
          for (let quantity = 1; quantity <= maximum; quantity += 1) {
            const command: GameCommand = { type: 'COLLECT_PARTS', actorId: playerId, partType, quantity };
            if (collectPartsErrors(state, command).length === 0) commands.push(command);
          }
        }
      }
      for (const orderId of player.kanbanOrders) {
        for (const orientation of ['LEFT_FOUR', 'RIGHT_FOUR'] as const) {
          const command: GameCommand = { type: 'ISSUE_KANBAN_ORDER', actorId: playerId, orderId, orientation };
          if (issueKanbanOrderErrors(state, command).length === 0) commands.push(command);
        }
      }
      const voucherCommand: GameCommand = { type: 'TAKE_PARTS_VOUCHER', actorId: playerId };
      if (takePartsVoucherErrors(state, playerId).length === 0) commands.push(voucherCommand);
    }
    return commands;
  }
  return globalCommands;
}

function validateCommand(state: GameState, command: GameCommand): readonly RuleErrorCode[] {
  if (state.pendingAwardPlaqueChoice !== null && command.type !== 'CHOOSE_AWARD_PLAQUE') {
    return ['AWARD_PLAQUE_CHOICE_REQUIRED'];
  }

  switch (command.type) {
    case 'START_GAME': {
      if (state.phase !== 'SETUP') return ['GAME_ALREADY_STARTED'];
      const actor = state.players.find((player) => player.id === command.actorId);
      if (!actor || actor.kind !== 'HUMAN' || actor.id !== 'player:0') return ['WRONG_ACTOR'];
      return [];
    }
    case 'SELECT_WORKSTATION': return selectionErrors(state, command.actorId, command.workstationId);
    case 'START_DESIGN_SELECTION': return startDesignSelectionErrors(state, command.actorId);
    case 'TAKE_DESIGN': return takeDesignErrors(state, command.actorId, command.designId);
    case 'END_DESIGN_SELECTION': return endDesignSelectionErrors(state, command.actorId);
    case 'COLLECT_PARTS': return collectPartsErrors(state, command);
    case 'ISSUE_KANBAN_ORDER': return issueKanbanOrderErrors(state, command);
    case 'TAKE_PARTS_VOUCHER': return takePartsVoucherErrors(state, command.actorId);
    case 'PROVIDE_ASSEMBLY_PART': return provideAssemblyPartErrors(state, command);
    case 'CLAIM_CARS': return claimCarsErrors(state, command);
    case 'UPGRADE_DESIGN': return upgradeDesignErrors(state, command);
    case 'SWAP_RECYCLING_PART': return recyclingSwapErrors(state, command);
    case 'TRAIN_DEPARTMENT': return trainingErrors(state, command);
    case 'CHOOSE_AWARD_PLAQUE': return awardPlaqueChoiceErrors(state, command);
    case 'CONVERT_RED_SEAT': return redSeatConversionErrors(state, command.actorId);
    case 'START_MICROMANAGE': return micromanageErrors(state, command);
    case 'FINISH_WORK': return finishWorkErrors(state, command.actorId);
  }
}

function workOrderAfterSelection(state: GameState, command: Extract<GameCommand, { readonly type: 'SELECT_WORKSTATION' }>): readonly PlayerId[] {
  return state.players
    .map((player) => ({ id: player.id, workstationId: player.id === command.actorId ? command.workstationId : player.currentWorkstation }))
    .filter((entry): entry is { readonly id: PlayerId; readonly workstationId: WorkstationId } => entry.workstationId !== null)
    .sort((a, b) => getWorkstation(a.workstationId).order - getWorkstation(b.workstationId).order)
    .map((entry) => entry.id);
}

function resolveCommand(state: GameState, command: GameCommand): readonly GameEvent[] {
  switch (command.type) {
    case 'START_GAME': return [{ id: makeId('event', state.eventIndex), type: 'GAME_STARTED' }];
    case 'SELECT_WORKSTATION': {
      const selected: GameEvent = { id: makeId('event', state.eventIndex), type: 'WORKSTATION_SELECTED', playerId: command.actorId, workstationId: command.workstationId };
      if (state.selectionCursor !== state.selectionOrder.length - 1) return [selected];
      return [selected, { id: makeId('event', state.eventIndex + 1), type: 'WORKING_PHASE_STARTED', workOrder: workOrderAfterSelection(state, command) }];
    }
    case 'START_DESIGN_SELECTION': return [{ id: makeId('event', state.eventIndex), type: 'DESIGN_SELECTION_STARTED', playerId: command.actorId }];
    case 'TAKE_DESIGN': {
      const destinationSlot = getOpenBlueprintSlot(state, command.actorId);
      if (destinationSlot === null) throw new Error('Validated Design take has no destination slot');
      return [{ id: makeId('event', state.eventIndex), type: 'DESIGN_TAKEN', playerId: command.actorId, designId: command.designId, destinationSlot, bonus: getOldestDesignBonus(state, command.designId) }];
    }
    case 'END_DESIGN_SELECTION': return [{ id: makeId('event', state.eventIndex), type: 'DESIGN_SELECTION_ENDED', playerId: command.actorId, moves: planDesignReplenishment(state) }];
    case 'COLLECT_PARTS': {
      const collection = getPartCollection(state, command.actorId, command.partType, command.quantity);
      if (collection === null) throw new Error('Validated part collection cannot be resolved');
      return [{ id: makeId('event', state.eventIndex), type: 'PARTS_COLLECTED', playerId: command.actorId, partIds: collection.partIds, destinationSlots: collection.destinationSlots }];
    }
    case 'ISSUE_KANBAN_ORDER': return [{ id: makeId('event', state.eventIndex), type: 'KANBAN_ORDER_ISSUED', playerId: command.actorId, orderId: command.orderId, replacementOrderId: state.kanbanOrderDeck[0] ?? null, orientation: command.orientation, refillMoves: planKanbanOrderRefill(state, command.orderId, command.orientation) }];
    case 'TAKE_PARTS_VOUCHER': return [{ id: makeId('event', state.eventIndex), type: 'PARTS_VOUCHER_TAKEN', playerId: command.actorId, shiftCost: getGameRules(state.content).logisticsVoucherShiftCost }];
    case 'PROVIDE_ASSEMBLY_PART': {
      const destinationSlot = getAssemblyDestinationSlot(state, command.model);
      if (destinationSlot === null) throw new Error('Validated Assembly part delivery has no destination slot');
      const pushPlan = planAssemblyPush(state, command.model, command.pathChoices ?? []);
      if (!pushPlan.ok) throw new Error(`Validated Assembly car push cannot resolve: ${pushPlan.reason}`);
      const events: GameEvent[] = [{ id: makeId('event', state.eventIndex), type: 'ASSEMBLY_PART_PROVIDED', playerId: command.actorId, model: command.model, partId: command.partId, destinationSlot }];
      if (pushPlan.moves.length > 0 || pushPlan.ppAwarded > 0) events.push({ id: makeId('event', state.eventIndex + events.length), type: 'ASSEMBLY_CAR_CHAIN_RESOLVED', playerId: command.actorId, moves: pushPlan.moves, ppAwarded: pushPlan.ppAwarded });
      if (willCompleteAssemblyModel(state, command.model)) {
        const demandId = getMatchingDemandId(state, command.model);
        if (demandId !== null) events.push({ id: makeId('event', state.eventIndex + events.length), type: 'DEMAND_RED_SEAT_CONSUMED', playerId: command.actorId, demandId });
      }
      return events;
    }
    case 'CLAIM_CARS': {
      const plan = planCarClaim(state, command);
      if (!plan.ok) throw new Error(`Validated car claim cannot resolve: ${plan.errors.join(',')}`);
      const events: GameEvent[] = [{ id: makeId('event', state.eventIndex), type: 'CARS_CLAIMED', playerId: command.actorId, shiftCost: plan.shiftCost, placements: plan.placements, trackMoves: plan.trackMoves, designMoves: plan.designMoves, garageBenefits: plan.garageBenefits, paceCarPosition: plan.paceCarPosition }];
      const meetingTrigger = getPaceCarMeetingTrigger(state, plan.paceCarPosition);
      if (meetingTrigger !== null) events.push({ id: makeId('event', state.eventIndex + events.length), type: 'MEETING_SCHEDULED', previousPaceCarPosition: meetingTrigger.previousPaceCarPosition, newPaceCarPosition: meetingTrigger.newPaceCarPosition, threshold: meetingTrigger.threshold });
      return events;
    }
    case 'UPGRADE_DESIGN': {
      const plan = planDesignUpgrade(state, command);
      if (!plan.ok) throw new Error(`Validated Design upgrade cannot resolve: ${plan.errors.join(',')}`);
      return [{ id: makeId('event', state.eventIndex), type: 'DESIGN_UPGRADED', playerId: plan.playerId, designId: plan.designId, partId: plan.partId, upgradeSpaceId: plan.upgradeSpaceId, partType: plan.partType, doubleUpgrade: plan.doubleUpgrade, previousPartValue: plan.previousPartValue, newPartValue: plan.newPartValue, ppAwarded: plan.ppAwarded, benefit: plan.benefit }];
    }
    case 'SWAP_RECYCLING_PART': {
      const plan = getRecyclingSwapPlan(state, command.actorId, command.outgoingPartId, command.incomingPartId);
      if (!plan.ok) throw new Error(`Validated Recycling swap cannot resolve: ${plan.reason}`);
      return [{ id: makeId('event', state.eventIndex), type: 'RECYCLING_PART_SWAPPED', playerId: command.actorId, outgoingPartId: command.outgoingPartId, incomingPartId: command.incomingPartId, playerSlot: plan.playerSlot, recyclingSlot: plan.recyclingSlot }];
    }
    case 'TRAIN_DEPARTMENT': {
      const plan = planTrainingAdvance(state, command);
      if (!plan.ok) throw new Error(`Validated training cannot resolve: ${plan.errors.join(',')}`);
      const events: GameEvent[] = [{ id: makeId('event', state.eventIndex), type: 'TRAINING_ADVANCED', playerId: plan.playerId, department: plan.department, fromLevel: plan.fromLevel, toLevel: plan.toLevel, source: plan.source, shiftCost: plan.shiftCost, bookCost: plan.bookCost, tieOrder: plan.tieOrder }];
      if (plan.certificationEarned) {
        events.push({ id: makeId('event', state.eventIndex + events.length), type: 'PLAYER_CERTIFIED', playerId: plan.playerId, department: plan.department, certificationPosition: plan.certificationPosition, administrationSeatUnlocked: plan.administrationSeatUnlocked });
      }
      if (plan.expertEarned) {
        const plaqueChoiceRequired = state.board.awardPlaquePools[plan.department].length > 0;
        events.push({ id: makeId('event', state.eventIndex + events.length), type: 'PLAYER_BECAME_EXPERT', playerId: plan.playerId, department: plan.department, plaqueChoiceRequired });
        if (state.board.expertSeatAvailable[plan.department]) {
          events.push({ id: makeId('event', state.eventIndex + events.length), type: 'EXPERT_SEAT_AWARDED', playerId: plan.playerId, department: plan.department });
        }
      }
      return events;
    }
    case 'CHOOSE_AWARD_PLAQUE': {
      const definition = state.content.awardPlaques[command.plaqueId];
      if (!definition) throw new Error('Validated Award Plaque choice has no definition');
      return [{
        id: makeId('event', state.eventIndex),
        type: 'AWARD_PLAQUE_CLAIMED',
        playerId: command.actorId,
        department: command.department,
        plaqueId: command.plaqueId,
        reward: definition.reward,
      }];
    }
    case 'CONVERT_RED_SEAT':
      return [{ id: makeId('event', state.eventIndex), type: 'RED_SEAT_CONVERTED', playerId: command.actorId }];
    case 'START_MICROMANAGE':
      return [{ id: makeId('event', state.eventIndex), type: 'MICROMANAGE_STARTED', playerId: command.actorId, department: command.department }];
    case 'FINISH_WORK': {
      const events: GameEvent[] = [];
      if (getEffectiveWorkDepartment(state, command.actorId) === 'ASSEMBLY') {
        const refresh = planDemandRefresh(state);
        if (refresh !== null) events.push({ id: makeId('event', state.eventIndex + events.length), type: 'DEMANDS_REFRESHED', playerId: command.actorId, activeDemands: refresh.activeDemands, demandDeck: refresh.demandDeck, demandDiscard: refresh.demandDiscard, rng: refresh.rng });
      }
      events.push({ id: makeId('event', state.eventIndex + events.length), type: 'PLAYER_FINISHED_WORK', playerId: command.actorId });
      return events;
    }
  }
}

function getAssemblyCleanupEvent(state: GameState, command: GameCommand): GameEvent | null {
  const partIds = getAssemblyTurnStartCleanupPartIds(state, command.actorId);
  if (partIds.length === 0) return null;
  return { id: makeId('event', state.eventIndex), type: 'ASSEMBLY_SPACES_CLEARED', playerId: command.actorId, partIds };
}

function getFactoryGoalEvents(before: GameState, after: GameState): readonly GameEvent[] {
  return planFactoryGoalAwards(before, after).map((award, index) => ({
    id: makeId('event', after.eventIndex + index),
    type: 'FACTORY_GOAL_ACHIEVED' as const,
    playerId: award.playerId,
    goalId: award.goalId,
    category: award.category,
    beforeMetric: award.beforeMetric,
    afterMetric: award.afterMetric,
    threshold: award.threshold,
    seatOutcome: award.seatOutcome,
  }));
}

function isFinalWorkerFinish(state: GameState, command: GameCommand): boolean {
  return command.type === 'FINISH_WORK' && state.workCursor === state.workOrder.length - 1;
}

function getSandraEndOfDayEvents(state: GameState): readonly GameEvent[] {
  const plan = planSandraVisit(state);
  const events: GameEvent[] = [
    {
      id: makeId('event', state.eventIndex),
      type: 'SANDRA_MOVED',
      department: plan.department,
      workstationId: plan.workstationId,
    },
    {
      id: makeId('event', state.eventIndex + 1),
      type: 'SANDRA_AUDIT_RESOLVED',
      department: plan.department,
      mode: plan.audit.mode,
      results: plan.audit.results,
    },
    {
      id: makeId('event', state.eventIndex + 2),
      type: 'SANDRA_DEPARTMENT_TASK_RESOLVED',
      department: plan.department,
      task: plan.task,
    },
  ];
  if (plan.task.kind === 'TESTING' && plan.task.meetingThresholdCrossed) {
    events.push({
      id: makeId('event', state.eventIndex + events.length),
      type: 'MEETING_SCHEDULED',
      previousPaceCarPosition: plan.task.previousPaceCarPosition,
      newPaceCarPosition: plan.task.paceCarPosition,
      threshold: state.board.nextMeetingThreshold,
    });
  }
  events.push({
    id: makeId('event', state.eventIndex + events.length),
    type: 'DAY_ENDED',
    nextSelectionOrder: state.workOrder,
  });
  return events;
}

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  const errors = validateCommand(state, command);
  if (errors.length > 0) return { status: 'REJECTED', state, errors };
  const events: GameEvent[] = [];
  let preparedState = state;
  const cleanupEvent = getAssemblyCleanupEvent(state, command);
  if (cleanupEvent !== null) {
    events.push(cleanupEvent);
    preparedState = reduceEvent(preparedState, cleanupEvent);
  }
  const commandEvents = resolveCommand(preparedState, command);
  events.push(...commandEvents);
  const commandState = commandEvents.reduce<GameState>((currentState, event) => reduceEvent(currentState, event), preparedState);
  const factoryGoalEvents = getFactoryGoalEvents(state, commandState);
  events.push(...factoryGoalEvents);
  let nextState = factoryGoalEvents.reduce<GameState>((currentState, event) => reduceEvent(currentState, event), commandState);

  if (isFinalWorkerFinish(state, command)) {
    const sandraEvents = getSandraEndOfDayEvents(nextState);
    events.push(...sandraEvents);
    nextState = sandraEvents.reduce<GameState>((currentState, event) => reduceEvent(currentState, event), nextState);
  }

  assertInvariants(nextState);
  return { status: 'ACCEPTED', state: nextState, events };
}
