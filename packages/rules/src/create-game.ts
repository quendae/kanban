import {
  BASE_DESIGN_CAPACITY,
  BASE_PART_CAPACITY,
  RULESET_ID,
} from './constants.js';
import { EMPTY_GAME_CONTENT, PART_TYPE_IDS } from './content.js';
import type { Department, PlayerCount } from './enums.js';
import { makeId } from './ids.js';
import type { BoardState, GameState, PlayerState } from './model.js';
import { createRng } from './rng.js';

export interface CreateShellGameInput {
  readonly seed: string;
  readonly playerCount: PlayerCount;
}

const DEPARTMENTS: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

function createDepartmentRecord<T>(factory: (department: Department) => T): Record<Department, T> {
  return Object.fromEntries(DEPARTMENTS.map((department) => [department, factory(department)])) as Record<Department, T>;
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
    conferenceSeatsFaceUp: 1,
    conferenceSeatsFaceDown: 3,
    partCapacity: BASE_PART_CAPACITY,
    designCapacity: BASE_DESIGN_CAPACITY,
    garageCapacity: 4,
    doubleUpgradeUsed: false,
    certifications: [],
    certificationPosition: 0,
    training: createDepartmentRecord(() => 0),
    expertDepartments: [],
    micromanagedDepartment: null,
    kanbanOrders: [],
    kanbanOrderIssuedToday: false,
    logisticsVoucherTakenToday: false,
  };
}

export function createShellGame(input: CreateShellGameInput): GameState {
  if (input.seed.trim().length === 0) {
    throw new Error('Seed must not be blank');
  }

  const players = Array.from({ length: input.playerCount }, (_, index) => createPlayer(index));
  const playerOrder = players.map((player) => player.id);
  const board: BoardState = {
    cars: {},
    parts: {},
    designs: {},
    designUpgrades: {},
    partValues: Object.fromEntries(PART_TYPE_IDS.map((partType) => [partType, 0])) as BoardState['partValues'],
    activeDemands: [],
    demandDeck: [],
    demandDiscard: [],
    paceCarPosition: 0,
    nextMeetingThreshold: EMPTY_GAME_CONTENT.testingRules.meetingThresholds[0] ?? 4,
    doubleUpgradedPartTypes: {},
    trainingTieOrder: createDepartmentRecord(() => [...playerOrder]),
    expertSeatAvailable: createDepartmentRecord(() => true),
    awardPlaquePools: createDepartmentRecord(() => []),
    factoryGoals: [],
  };

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
    activeDepartmentAction: null,
    players,
    board,
    kanbanOrderDeck: [],
    sandra: {
      department: 'SANDRA_DESK',
      workstation: 'F_SANDRA',
      mode: 'NICE',
    },
    pendingRewards: [],
    pendingAwardPlaqueChoice: null,
    selectionOrder: playerOrder,
    selectionCursor: 0,
    workOrder: [],
    workCursor: 0,
    eventIndex: 0,
  };
}