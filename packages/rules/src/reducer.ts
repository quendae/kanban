import type { GarageBenefit } from './content.js';
import type { GameEvent } from './events.js';
import type { PlayerId } from './ids.js';
import type { GameState, PendingRewardType, PlayerState } from './model.js';
import { getWorkstation } from './workstations.js';

function assertNever(value: never): never {
  throw new Error(`Unhandled GameEvent: ${String(value)}`);
}

function rewardTotal(
  state: GameState,
  playerId: PlayerId,
  type: PendingRewardType,
): number {
  return state.pendingRewards
    .filter((reward) => reward.playerId === playerId && reward.type === type)
    .reduce((total, reward) => total + reward.amount, 0);
}

function usedBankedShifts(baseShiftsToday: number, shiftsSpentToday: number): number {
  return Math.max(0, shiftsSpentToday - baseShiftsToday);
}

function applyGarageBenefits(
  player: PlayerState,
  benefits: readonly GarageBenefit[],
): PlayerState {
  let bankedShifts = player.bankedShifts;
  let books = player.books;
  let vouchers = player.vouchers;
  let genericRedSeats = player.genericRedSeats;
  let pp = player.pp;

  for (const benefit of benefits) {
    switch (benefit.kind) {
      case 'NONE':
        break;
      case 'BANKED_SHIFT':
        bankedShifts += benefit.amount;
        break;
      case 'BOOK':
        books += benefit.amount;
        break;
      case 'VOUCHER':
        vouchers += benefit.amount;
        break;
      case 'RED_SEAT':
        genericRedSeats += benefit.amount;
        break;
      case 'PP':
        pp += benefit.amount;
        break;
    }
  }

  return { ...player, bankedShifts, books, vouchers, genericRedSeats, pp };
}

export function reduceEvent(state: GameState, event: GameEvent): GameState {
  switch (event.type) {
    case 'GAME_STARTED':
      return {
        ...state,
        phase: 'SELECT_DEPARTMENT',
        activeActorId: state.selectionOrder[state.selectionCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'WORKSTATION_SELECTED': {
      const station = getWorkstation(event.workstationId);
      const nextCursor = state.selectionCursor + 1;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId
            ? {
                ...player,
                currentWorkstation: event.workstationId,
                currentDepartment: station.department,
                baseShiftsToday: station.shifts,
              }
            : player,
        ),
        selectionCursor: nextCursor,
        activeActorId: state.selectionOrder[nextCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'WORKING_PHASE_STARTED':
      return {
        ...state,
        phase: 'WORK',
        workOrder: event.workOrder,
        workCursor: 0,
        activeActorId: event.workOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_SELECTION_STARTED':
      return {
        ...state,
        activeDepartmentAction: { kind: 'DESIGN_SELECTION', playerId: event.playerId },
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_TAKEN':
      return {
        ...state,
        board: {
          ...state.board,
          designs: {
            ...state.board.designs,
            [event.designId]: {
              kind: 'PLAYER',
              playerId: event.playerId,
              area: 'blueprints',
              slot: event.destinationSlot,
            },
          },
        },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, shiftsSpentToday: player.shiftsSpentToday + 1 }
            : player,
        ),
        pendingRewards:
          event.bonus === null
            ? state.pendingRewards
            : [...state.pendingRewards, { playerId: event.playerId, type: event.bonus, amount: 1 }],
        eventIndex: state.eventIndex + 1,
      };
    case 'DESIGN_SELECTION_ENDED': {
      const designs = { ...state.board.designs };
      for (const move of event.moves) designs[move.designId] = move.location;
      return {
        ...state,
        board: { ...state.board, designs },
        activeDepartmentAction: null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'PARTS_COLLECTED': {
      const parts = { ...state.board.parts };
      event.partIds.forEach((partId, index) => {
        const slot = event.destinationSlots[index];
        if (slot === undefined) throw new Error('PARTS_COLLECTED destination slot mismatch');
        parts[partId] = {
          kind: 'PLAYER',
          playerId: event.playerId,
          area: 'parts',
          slot,
        };
      });
      return {
        ...state,
        board: { ...state.board, parts },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, shiftsSpentToday: player.shiftsSpentToday + 1 }
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'KANBAN_ORDER_ISSUED': {
      const parts = { ...state.board.parts };
      for (const move of event.refillMoves) {
        parts[move.partId] = {
          kind: 'BOARD',
          area: `warehouse:${move.partType}`,
          slot: move.destinationSlot,
        };
      }
      return {
        ...state,
        board: { ...state.board, parts },
        players: state.players.map((player) => {
          if (player.id !== event.playerId) return player;
          const remainingOrders = player.kanbanOrders.filter((orderId) => orderId !== event.orderId);
          return {
            ...player,
            shiftsSpentToday: player.shiftsSpentToday + 1,
            kanbanOrderIssuedToday: true,
            kanbanOrders:
              event.replacementOrderId === null
                ? remainingOrders
                : [...remainingOrders, event.replacementOrderId],
          };
        }),
        kanbanOrderDeck:
          event.replacementOrderId === null
            ? [...state.kanbanOrderDeck, event.orderId]
            : [...state.kanbanOrderDeck.slice(1), event.orderId],
        pendingRewards: [
          ...state.pendingRewards,
          { playerId: event.playerId, type: 'BANKED_SHIFT', amount: 1 },
        ],
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'PARTS_VOUCHER_TAKEN':
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId
            ? {
                ...player,
                shiftsSpentToday: player.shiftsSpentToday + event.shiftCost,
                logisticsVoucherTakenToday: true,
              }
            : player,
        ),
        pendingRewards: [
          ...state.pendingRewards,
          { playerId: event.playerId, type: 'VOUCHER', amount: 1 },
        ],
        eventIndex: state.eventIndex + 1,
      };
    case 'ASSEMBLY_SPACES_CLEARED': {
      const parts = { ...state.board.parts };
      for (const partId of event.partIds) parts[partId] = { kind: 'SUPPLY' };
      return {
        ...state,
        board: { ...state.board, parts },
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'ASSEMBLY_PART_PROVIDED':
      return {
        ...state,
        board: {
          ...state.board,
          parts: {
            ...state.board.parts,
            [event.partId]: {
              kind: 'BOARD',
              area: `assembly:${event.model}`,
              slot: event.destinationSlot,
            },
          },
        },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, shiftsSpentToday: player.shiftsSpentToday + 1 }
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    case 'ASSEMBLY_CAR_CHAIN_RESOLVED': {
      const cars = { ...state.board.cars };
      for (const move of event.moves) cars[move.carId] = move.to;
      return {
        ...state,
        board: { ...state.board, cars },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, pp: player.pp + event.ppAwarded }
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'DEMAND_RED_SEAT_CONSUMED':
      return {
        ...state,
        board: {
          ...state.board,
          activeDemands: state.board.activeDemands.map((demand) =>
            demand.demandId === event.demandId
              ? { ...demand, redSeatsRemaining: Math.max(0, demand.redSeatsRemaining - 1) }
              : demand,
          ),
        },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? { ...player, genericRedSeats: player.genericRedSeats + 1 }
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    case 'DEMANDS_REFRESHED':
      return {
        ...state,
        board: {
          ...state.board,
          activeDemands: event.activeDemands,
          demandDeck: event.demandDeck,
          demandDiscard: event.demandDiscard,
        },
        rng: event.rng,
        eventIndex: state.eventIndex + 1,
      };
    case 'CARS_CLAIMED': {
      const cars = { ...state.board.cars };
      const designs = { ...state.board.designs };

      for (const placement of event.placements) {
        if (placement.replaceCarId !== null) {
          cars[placement.replaceCarId] = { kind: 'SUPPLY' };
        }
        cars[placement.carId] = {
          kind: 'PLAYER',
          playerId: event.playerId,
          area: 'garage',
          slot: placement.garageSlot,
        };
      }
      for (const move of event.trackMoves) cars[move.carId] = move.location;
      for (const move of event.designMoves) designs[move.designId] = move.location;

      return {
        ...state,
        board: {
          ...state.board,
          cars,
          designs,
          paceCarPosition: event.paceCarPosition,
        },
        players: state.players.map((player) =>
          player.id === event.playerId
            ? applyGarageBenefits(
                { ...player, shiftsSpentToday: player.shiftsSpentToday + event.shiftCost },
                event.garageBenefits,
              )
            : player,
        ),
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'RECYCLING_PART_SWAPPED':
      return {
        ...state,
        board: {
          ...state.board,
          parts: {
            ...state.board.parts,
            [event.outgoingPartId]: {
              kind: 'BOARD',
              area: 'recycling',
              slot: event.recyclingSlot,
            },
            [event.incomingPartId]: {
              kind: 'PLAYER',
              playerId: event.playerId,
              area: 'parts',
              slot: event.playerSlot,
            },
          },
        },
        eventIndex: state.eventIndex + 1,
      };
    case 'PLAYER_FINISHED_WORK': {
      const nextCursor = state.workCursor + 1;
      return {
        ...state,
        players: state.players.map((player) =>
          player.id === event.playerId ? { ...player, done: true } : player,
        ),
        workCursor: nextCursor,
        activeActorId: state.workOrder[nextCursor] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    }
    case 'DAY_ENDED':
      return {
        ...state,
        players: state.players.map((player) => ({
          ...player,
          bankedShifts:
            Math.max(
              0,
              player.bankedShifts -
                usedBankedShifts(player.baseShiftsToday, player.shiftsSpentToday),
            ) + rewardTotal(state, player.id, 'BANKED_SHIFT'),
          books: player.books + rewardTotal(state, player.id, 'BOOK'),
          vouchers: player.vouchers + rewardTotal(state, player.id, 'VOUCHER'),
          previousDepartment: player.currentDepartment,
          currentDepartment: null,
          currentWorkstation: null,
          baseShiftsToday: 0,
          shiftsSpentToday: 0,
          done: false,
          kanbanOrderIssuedToday: false,
          logisticsVoucherTakenToday: false,
        })),
        activeDepartmentAction: null,
        pendingRewards: [],
        dayIndex: state.dayIndex + 1,
        phase: 'SELECT_DEPARTMENT',
        selectionOrder: event.nextSelectionOrder,
        selectionCursor: 0,
        workOrder: [],
        workCursor: 0,
        activeActorId: event.nextSelectionOrder[0] ?? null,
        eventIndex: state.eventIndex + 1,
      };
    default:
      return assertNever(event);
  }
}
