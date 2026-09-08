import type { GameContent } from './content.js';
import type { Department, GamePhase, PlayerCount, RulesetId } from './enums.js';
import type { CarId, DesignId, PartId, PlayerId } from './ids.js';
import type { RngState } from './rng.js';
import type { WorkstationId } from './workstations.js';

export type PlayerKind = 'HUMAN' | 'BOT';

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
  readonly partCapacity: number;
  readonly designCapacity: number;
  readonly certifications: readonly Department[];
  readonly kanbanOrderIssuedToday: boolean;
  readonly logisticsVoucherTakenToday: boolean;
}

export interface SandraState {
  readonly department: Department | 'SANDRA_DESK';
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

export interface BoardState {
  readonly cars: Readonly<Partial<Record<CarId, EntityLocation>>>;
  readonly parts: Readonly<Partial<Record<PartId, EntityLocation>>>;
  readonly designs: Readonly<Partial<Record<DesignId, EntityLocation>>>;
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
  readonly activeActorId: PlayerId | 'sandra' | null;
  readonly activeDepartmentAction: ActiveDepartmentAction;
  readonly players: readonly PlayerState[];
  readonly board: BoardState;
  readonly sandra: SandraState;
  readonly pendingRewards: readonly PendingReward[];
  readonly selectionOrder: readonly PlayerId[];
  readonly selectionCursor: number;
  readonly workOrder: readonly PlayerId[];
  readonly workCursor: number;
  readonly eventIndex: number;
}
