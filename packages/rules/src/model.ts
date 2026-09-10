import type { GameContent, PartTypeId } from './content.js';
import type { Department, GamePhase, PlayerCount, RulesetId } from './enums.js';
import type {
  AwardPlaqueId,
  CarId,
  DemandId,
  DesignId,
  FactoryGoalId,
  FinalGoalId,
  KanbanOrderId,
  PartId,
  PerformanceGoalId,
  PlayerId,
} from './ids.js';
import type { RngState } from './rng.js';
import type { WorkstationId } from './workstations.js';

export type PlayerKind = 'HUMAN' | 'BOT';
export type MicromanageDepartment = Exclude<Department, 'ADMINISTRATION'>;

export interface PlayerState {
  readonly id: PlayerId;
  readonly kind: PlayerKind;
  readonly pp: number;
  readonly bankedShifts: number;
  readonly shiftsSpentToday: number;
  readonly previousDepartment: Department | null;
  readonly currentDepartment: Department | null;
  readonly currentWorkstation: WorkstationId | null;
  readonly baseShiftsToday: number;
  readonly done: boolean;
  readonly books: number;
  readonly vouchers: number;
  readonly genericRedSeats: number;
  readonly conferenceSeatsFaceUp: number;
  readonly conferenceSeatsFaceDown: number;
  readonly partCapacity: number;
  readonly designCapacity: number;
  readonly garageCapacity: number;
  readonly doubleUpgradeUsed: boolean;
  readonly certifications: readonly Department[];
  readonly certificationPosition: number;
  readonly training: Readonly<Record<Department, number>>;
  readonly expertDepartments: readonly Department[];
  readonly micromanagedDepartment: MicromanageDepartment | null;
  readonly kanbanOrders: readonly KanbanOrderId[];
  readonly kanbanOrderIssuedToday: boolean;
  readonly logisticsVoucherTakenToday: boolean;
}

export interface SandraState {
  readonly department: Department | 'SANDRA_DESK';
  readonly workstation: WorkstationId;
  readonly mode: 'NICE' | 'MEAN';
}

export type EntityLocation =
  | { readonly kind: 'SUPPLY' }
  | {
      readonly kind: 'BOARD';
      readonly area: string;
      readonly slot: number;
    }
  | {
      readonly kind: 'PLAYER';
      readonly playerId: PlayerId;
      readonly area: string;
      readonly slot: number;
    };

export interface ActiveDemandState {
  readonly demandId: DemandId;
  readonly redSeatsRemaining: number;
}

export interface DesignUpgradeState {
  readonly partType: PartTypeId;
  readonly doubleUpgrade: boolean;
}

export interface ActiveFactoryGoalState {
  readonly goalId: FactoryGoalId;
  readonly seatsRemaining: number;
  readonly claimedBy: readonly PlayerId[];
}

export interface PendingAwardPlaqueChoice {
  readonly playerId: PlayerId;
  readonly department: Department;
}

export interface MeetingState {
  readonly active: boolean;
  readonly speakerOrder: readonly PlayerId[];
  readonly speakerCursor: number;
  readonly consecutivePasses: number;
  readonly revealedPetProjects: readonly PlayerId[];
  readonly spokenGoalsByPlayer: Readonly<Partial<Record<PlayerId, readonly PerformanceGoalId[]>>>;
  readonly usedSeatsByPlayer: Readonly<Partial<Record<PlayerId, number>>>;
  readonly replenishmentChoicesPending: readonly PlayerId[];
  readonly nextGoalChoices: Readonly<Partial<Record<PlayerId, PerformanceGoalId>>>;
}

export interface BoardState {
  readonly cars: Readonly<Partial<Record<CarId, EntityLocation>>>;
  readonly parts: Readonly<Partial<Record<PartId, EntityLocation>>>;
  readonly designs: Readonly<Partial<Record<DesignId, EntityLocation>>>;
  readonly designUpgrades: Readonly<Partial<Record<DesignId, DesignUpgradeState>>>;
  readonly partValues: Readonly<Record<PartTypeId, number>>;
  readonly activeDemands: readonly ActiveDemandState[];
  readonly demandDeck: readonly DemandId[];
  readonly demandDiscard: readonly DemandId[];
  readonly paceCarPosition: number;
  readonly nextMeetingThreshold: number;
  readonly doubleUpgradedPartTypes: Readonly<Partial<Record<PartTypeId, PlayerId>>>;
  readonly trainingTieOrder: Readonly<Record<Department, readonly PlayerId[]>>;
  readonly expertSeatAvailable: Readonly<Record<Department, boolean>>;
  readonly awardPlaquePools: Readonly<Record<Department, readonly AwardPlaqueId[]>>;
  readonly factoryGoals: readonly ActiveFactoryGoalState[];
  readonly performanceGoalDisplay: readonly PerformanceGoalId[];
}

export type PendingRewardType = 'BANKED_SHIFT' | 'BOOK' | 'VOUCHER';

export interface PendingReward {
  readonly playerId: PlayerId;
  readonly type: PendingRewardType;
  readonly amount: number;
}

export type ActiveDepartmentAction =
  | {
      readonly kind: 'DESIGN_SELECTION';
      readonly playerId: PlayerId;
    }
  | null;

export interface GameState {
  readonly schemaVersion: 1;
  readonly ruleset: RulesetId;
  readonly seed: string;
  readonly rng: RngState;
  readonly content: GameContent;
  readonly playerCount: PlayerCount;
  readonly phase: GamePhase;
  readonly dayIndex: number;
  readonly week: number;
  readonly productionCycle: number;
  readonly meetingScheduled: boolean;
  readonly meeting: MeetingState;
  readonly activeActorId: PlayerId | 'sandra' | null;
  readonly activeDepartmentAction: ActiveDepartmentAction;
  readonly players: readonly PlayerState[];
  readonly board: BoardState;
  readonly kanbanOrderDeck: readonly KanbanOrderId[];
  readonly performanceGoalDeck: readonly PerformanceGoalId[];
  readonly performanceGoalDiscard: readonly PerformanceGoalId[];
  readonly performanceGoalHands: Readonly<Partial<Record<PlayerId, readonly PerformanceGoalId[]>>>;
  readonly finalGoalId: FinalGoalId | null;
  readonly sandra: SandraState;
  readonly pendingRewards: readonly PendingReward[];
  readonly pendingAwardPlaqueChoice: PendingAwardPlaqueChoice | null;
  readonly selectionOrder: readonly PlayerId[];
  readonly selectionCursor: number;
  readonly workOrder: readonly PlayerId[];
  readonly workCursor: number;
  readonly eventIndex: number;
}