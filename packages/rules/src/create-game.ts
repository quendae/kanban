import {
  BASE_DESIGN_CAPACITY,
  BASE_PART_CAPACITY,
  RULESET_ID,
} from './constants.js';
import { EMPTY_GAME_CONTENT } from './content.js';
import type { PlayerCount } from './enums.js';
import { makeId } from './ids.js';
import type { BoardState, GameState, PlayerState } from './model.js';
import { createRng } from './rng.js';

export interface CreateShellGameInput {
  readonly seed: string;
  readonly playerCount: PlayerCount;
}

function createPlayer(index: number): PlayerState {
  return {
    id: makeId('player', index),
    kind: index === 0 ? 'HUMAN' : 'BOT',
    pp: 0,
    bankedShifts: 0,
    shiftsSpentToday: 0,
    previousDepartment: null,
    currentDepartment: null,
    currentWorkstation: null,
    baseShiftsToday: 0,
    done: false,
    books: 0,
    vouchers: 0,
    genericRedSeats: 0,
    partCapacity: BASE_PART_CAPACITY,
    designCapacity: BASE_DESIGN_CAPACITY,
    certifications: [],
    kanbanOrderIssuedToday: false,
    logisticsVoucherTakenToday: false,
  };
}

export function createShellGame(input: CreateShellGameInput): GameState {
  if (input.seed.trim().length === 0) {
    throw new Error('Seed must not be blank');
  }

  const board: BoardState = {
    cars: {},
    parts: {},
    designs: {},
  };
  const players = Array.from({ length: input.playerCount }, (_, index) => createPlayer(index));
  const selectionOrder = players.map((player) => player.id);

  return {
    schemaVersion: 1,
    ruleset: RULESET_ID,
    seed: input.seed,
    rng: createRng(input.seed),
    content: EMPTY_GAME_CONTENT,
    playerCount: input.playerCount,
    phase: 'SETUP',
    dayIndex: 0,
    week: 0,
    productionCycle: 0,
    meetingScheduled: false,
    activeActorId: null,
    players,
    board,
    sandra: {
      department: 'SANDRA_DESK',
      mode: 'NICE',
    },
    pendingRewards: [],
    selectionOrder,
    selectionCursor: 0,
    workOrder: [],
    workCursor: 0,
    eventIndex: 0,
  };
}
