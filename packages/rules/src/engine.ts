import type { GameCommand } from './commands.js';
import { MAX_SHIFTS_PER_DAY } from './constants.js';
import {
  getOldestDesignBonus,
  getOpenBlueprintSlot,
  getSelectableDesignIds,
  hasDesignCapacity,
  planDesignReplenishment,
} from './design.js';
import type { RuleErrorCode } from './errors.js';
import type { GameEvent } from './events.js';
import { makeId, type PlayerId } from './ids.js';
import { assertInvariants } from './invariants.js';
import { getWarehouseParts } from './inventory.js';
import {
  getMaximumCollectableQuantity,
  getPartCollection,
  planKanbanOrderRefill,
} from './logistics.js';
import type { GameState, PlayerState } from './model.js';
import { reduceEvent } from './reducer.js';
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

function startDesignSelectionErrors(
  state: GameState,
  playerId: PlayerId,
): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (getPlayer(state, playerId).currentDepartment !== 'DESIGN') errors.push('NOT_IN_DESIGN');
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
  const player = getPlayer(state, command.actorId);
  if (player.currentDepartment !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
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
  if (player.currentDepartment !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
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
  if (player.currentDepartment !== 'LOGISTICS') errors.push('NOT_IN_LOGISTICS');
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  if (!player.certifications.includes('LOGISTICS')) {
    errors.push('LOGISTICS_VOUCHER_REQUIRES_CERTIFICATION');
  }
  if (player.logisticsVoucherTakenToday) errors.push('LOGISTICS_VOUCHER_ALREADY_TAKEN');
  if (!hasAvailableShift(state, playerId)) errors.push('INSUFFICIENT_SHIFTS');
  return errors;
}

function finishWorkErrors(state: GameState, playerId: PlayerId): readonly RuleErrorCode[] {
  const errors = activeWorkErrors(state, playerId);
  if (state.activeDepartmentAction !== null) errors.push('ACTION_IN_PROGRESS');
  return errors;
}

export function getLegalCommands(
  state: GameState,
  playerId: PlayerId,
): readonly GameCommand[] {
  if (state.phase === 'SETUP') {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player || player.kind !== 'HUMAN' || player.id !== 'player:0') return [];
    return [{ type: 'START_GAME', actorId: playerId }];
  }

  if (state.phase === 'SELECT_DEPARTMENT' && state.activeActorId === playerId) {
    return WORKSTATIONS.filter(
      (station) => selectionErrors(state, playerId, station.id).length === 0,
    ).map((station) => ({
      type: 'SELECT_WORKSTATION' as const,
      actorId: playerId,
      workstationId: station.id,
    }));
  }

  if (state.phase === 'WORK' && state.activeActorId === playerId) {
    if (
      state.activeDepartmentAction?.kind === 'DESIGN_SELECTION' &&
      state.activeDepartmentAction.playerId === playerId
    ) {
      const takeCommands = getSelectableDesignIds(state, playerId)
        .filter((designId) => takeDesignErrors(state, playerId, designId).length === 0)
        .map((designId) => ({ type: 'TAKE_DESIGN' as const, actorId: playerId, designId }));
      return [
        ...takeCommands,
        { type: 'END_DESIGN_SELECTION' as const, actorId: playerId },
      ];
    }

    const commands: GameCommand[] = [{ type: 'FINISH_WORK', actorId: playerId }];
    if (startDesignSelectionErrors(state, playerId).length === 0) {
      commands.push({ type: 'START_DESIGN_SELECTION', actorId: playerId });
    }

    const player = getPlayer(state, playerId);
    if (player.currentDepartment === 'LOGISTICS' && state.activeDepartmentAction === null) {
      if (hasAvailableShift(state, playerId)) {
        for (const partType of state.content.partTypes) {
          const maximum = getMaximumCollectableQuantity(state, playerId, partType);
          for (let quantity = 1; quantity <= maximum; quantity += 1) {
            const command: GameCommand = {
              type: 'COLLECT_PARTS',
              actorId: playerId,
              partType,
              quantity,
            };
            if (collectPartsErrors(state, command).length === 0) commands.push(command);
          }
        }
      }

      for (const orderId of player.kanbanOrders) {
        for (const orientation of ['LEFT_FOUR', 'RIGHT_FOUR'] as const) {
          const command: GameCommand = {
            type: 'ISSUE_KANBAN_ORDER',
            actorId: playerId,
            orderId,
            orientation,
          };
          if (issueKanbanOrderErrors(state, command).length === 0) commands.push(command);
        }
      }

      const voucherCommand: GameCommand = { type: 'TAKE_PARTS_VOUCHER', actorId: playerId };
      if (takePartsVoucherErrors(state, playerId).length === 0) commands.push(voucherCommand);
    }
    return commands;
  }

  return [];
}

function validateCommand(
  state: GameState,
  command: GameCommand,
): readonly RuleErrorCode[] {
  switch (command.type) {
    case 'START_GAME': {
      if (state.phase !== 'SETUP') return ['GAME_ALREADY_STARTED'];
      const actor = state.players.find((player) => player.id === command.actorId);
      if (!actor || actor.kind !== 'HUMAN' || actor.id !== 'player:0') return ['WRONG_ACTOR'];
      return [];
    }
    case 'SELECT_WORKSTATION':
      return selectionErrors(state, command.actorId, command.workstationId);
    case 'START_DESIGN_SELECTION':
      return startDesignSelectionErrors(state, command.actorId);
    case 'TAKE_DESIGN':
      return takeDesignErrors(state, command.actorId, command.designId);
    case 'END_DESIGN_SELECTION':
      return endDesignSelectionErrors(state, command.actorId);
    case 'COLLECT_PARTS':
      return collectPartsErrors(state, command);
    case 'ISSUE_KANBAN_ORDER':
      return issueKanbanOrderErrors(state, command);
    case 'TAKE_PARTS_VOUCHER':
      return takePartsVoucherErrors(state, command.actorId);
    case 'FINISH_WORK':
      return finishWorkErrors(state, command.actorId);
  }
}

function workOrderAfterSelection(
  state: GameState,
  command: Extract<GameCommand, { readonly type: 'SELECT_WORKSTATION' }>,
): readonly PlayerId[] {
  return state.players
    .map((player) => ({
      id: player.id,
      workstationId:
        player.id === command.actorId ? command.workstationId : player.currentWorkstation,
    }))
    .filter(
      (entry): entry is { readonly id: PlayerId; readonly workstationId: WorkstationId } =>
        entry.workstationId !== null,
    )
    .sort(
      (a, b) => getWorkstation(a.workstationId).order - getWorkstation(b.workstationId).order,
    )
    .map((entry) => entry.id);
}

function resolveCommand(state: GameState, command: GameCommand): readonly GameEvent[] {
  switch (command.type) {
    case 'START_GAME':
      return [{ id: makeId('event', state.eventIndex), type: 'GAME_STARTED' }];
    case 'SELECT_WORKSTATION': {
      const selected: GameEvent = {
        id: makeId('event', state.eventIndex),
        type: 'WORKSTATION_SELECTED',
        playerId: command.actorId,
        workstationId: command.workstationId,
      };
      const isLastSelection = state.selectionCursor === state.selectionOrder.length - 1;
      if (!isLastSelection) return [selected];
      return [
        selected,
        {
          id: makeId('event', state.eventIndex + 1),
          type: 'WORKING_PHASE_STARTED',
          workOrder: workOrderAfterSelection(state, command),
        },
      ];
    }
    case 'START_DESIGN_SELECTION':
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'DESIGN_SELECTION_STARTED',
          playerId: command.actorId,
        },
      ];
    case 'TAKE_DESIGN': {
      const destinationSlot = getOpenBlueprintSlot(state, command.actorId);
      if (destinationSlot === null) throw new Error('Validated Design take has no destination slot');
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'DESIGN_TAKEN',
          playerId: command.actorId,
          designId: command.designId,
          destinationSlot,
          bonus: getOldestDesignBonus(state, command.designId),
        },
      ];
    }
    case 'END_DESIGN_SELECTION':
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'DESIGN_SELECTION_ENDED',
          playerId: command.actorId,
          moves: planDesignReplenishment(state),
        },
      ];
    case 'COLLECT_PARTS': {
      const collection = getPartCollection(
        state,
        command.actorId,
        command.partType,
        command.quantity,
      );
      if (collection === null) throw new Error('Validated part collection cannot be resolved');
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'PARTS_COLLECTED',
          playerId: command.actorId,
          partIds: collection.partIds,
          destinationSlots: collection.destinationSlots,
        },
      ];
    }
    case 'ISSUE_KANBAN_ORDER':
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'KANBAN_ORDER_ISSUED',
          playerId: command.actorId,
          orderId: command.orderId,
          replacementOrderId: state.kanbanOrderDeck[0] ?? null,
          orientation: command.orientation,
          refillMoves: planKanbanOrderRefill(state, command.orderId, command.orientation),
        },
      ];
    case 'TAKE_PARTS_VOUCHER':
      return [
        {
          id: makeId('event', state.eventIndex),
          type: 'PARTS_VOUCHER_TAKEN',
          playerId: command.actorId,
        },
      ];
    case 'FINISH_WORK': {
      const finished: GameEvent = {
        id: makeId('event', state.eventIndex),
        type: 'PLAYER_FINISHED_WORK',
        playerId: command.actorId,
      };
      const isLastWorker = state.workCursor === state.workOrder.length - 1;
      if (!isLastWorker) return [finished];
      return [
        finished,
        {
          id: makeId('event', state.eventIndex + 1),
          type: 'DAY_ENDED',
          nextSelectionOrder: state.workOrder,
        },
      ];
    }
  }
}

export function applyCommand(state: GameState, command: GameCommand): CommandResult {
  const errors = validateCommand(state, command);
  if (errors.length > 0) {
    return { status: 'REJECTED', state, errors };
  }

  const events = resolveCommand(state, command);
  const nextState = events.reduce<GameState>(
    (currentState, event) => reduceEvent(currentState, event),
    state,
  );
  assertInvariants(nextState);
  return { status: 'ACCEPTED', state: nextState, events };
}
