import type { CarMove } from './assembly.js';
import type {
  AwardPlaqueReward,
  FactoryGoalCategory,
  GarageBenefit,
  KanbanOrderOrientation,
  ModelId,
  PartTypeId,
} from './content.js';
import type { DesignMove } from './design.js';
import type { Department } from './enums.js';
import type { FactoryGoalSeatOutcome } from './factory-goals.js';
import type {
  AwardPlaqueId,
  DemandId,
  DesignId,
  EventId,
  FactoryGoalId,
  KanbanOrderId,
  PartId,
  PlayerId,
  UpgradeSpaceId,
} from './ids.js';
import type { WarehousePartMove } from './logistics.js';
import type {
  ActiveDemandState,
  MicromanageDepartment,
  PendingRewardType,
} from './model.js';
import type { RngState } from './rng.js';
import type { SandraAuditResult, SandraDepartmentTask, SandraMode } from './sandra.js';
import type {
  ClaimCarPlacement,
  ClaimDesignMove,
  ClaimTrackMove,
} from './testing.js';
import type { WorkstationId } from './workstations.js';

export type GameEvent =
  | { readonly id: EventId; readonly type: 'GAME_STARTED' }
  | {
      readonly id: EventId;
      readonly type: 'WORKSTATION_SELECTED';
      readonly playerId: PlayerId;
      readonly workstationId: WorkstationId;
    }
  | {
      readonly id: EventId;
      readonly type: 'WORKING_PHASE_STARTED';
      readonly workOrder: readonly PlayerId[];
    }
  | {
      readonly id: EventId;
      readonly type: 'DESIGN_SELECTION_STARTED';
      readonly playerId: PlayerId;
    }
  | {
      readonly id: EventId;
      readonly type: 'DESIGN_TAKEN';
      readonly playerId: PlayerId;
      readonly designId: DesignId;
      readonly destinationSlot: number;
      readonly bonus: PendingRewardType | null;
    }
  | {
      readonly id: EventId;
      readonly type: 'DESIGN_SELECTION_ENDED';
      readonly playerId: PlayerId;
      readonly moves: readonly DesignMove[];
    }
  | {
      readonly id: EventId;
      readonly type: 'PARTS_COLLECTED';
      readonly playerId: PlayerId;
      readonly partIds: readonly PartId[];
      readonly destinationSlots: readonly number[];
    }
  | {
      readonly id: EventId;
      readonly type: 'KANBAN_ORDER_ISSUED';
      readonly playerId: PlayerId;
      readonly orderId: KanbanOrderId;
      readonly replacementOrderId: KanbanOrderId | null;
      readonly orientation: KanbanOrderOrientation;
      readonly refillMoves: readonly WarehousePartMove[];
    }
  | {
      readonly id: EventId;
      readonly type: 'PARTS_VOUCHER_TAKEN';
      readonly playerId: PlayerId;
      readonly shiftCost: 0 | 1;
    }
  | {
      readonly id: EventId;
      readonly type: 'ASSEMBLY_SPACES_CLEARED';
      readonly playerId: PlayerId;
      readonly partIds: readonly PartId[];
    }
  | {
      readonly id: EventId;
      readonly type: 'ASSEMBLY_PART_PROVIDED';
      readonly playerId: PlayerId;
      readonly model: ModelId;
      readonly partId: PartId;
      readonly destinationSlot: number;
    }
  | {
      readonly id: EventId;
      readonly type: 'ASSEMBLY_CAR_CHAIN_RESOLVED';
      readonly playerId: PlayerId;
      readonly moves: readonly CarMove[];
      readonly ppAwarded: number;
    }
  | {
      readonly id: EventId;
      readonly type: 'DEMAND_RED_SEAT_CONSUMED';
      readonly playerId: PlayerId;
      readonly demandId: DemandId;
    }
  | {
      readonly id: EventId;
      readonly type: 'DEMANDS_REFRESHED';
      readonly playerId: PlayerId;
      readonly activeDemands: readonly ActiveDemandState[];
      readonly demandDeck: readonly DemandId[];
      readonly demandDiscard: readonly DemandId[];
      readonly rng: RngState;
    }
  | {
      readonly id: EventId;
      readonly type: 'CARS_CLAIMED';
      readonly playerId: PlayerId;
      readonly shiftCost: number;
      readonly placements: readonly ClaimCarPlacement[];
      readonly trackMoves: readonly ClaimTrackMove[];
      readonly designMoves: readonly ClaimDesignMove[];
      readonly garageBenefits: readonly GarageBenefit[];
      readonly paceCarPosition: number;
    }
  | {
      readonly id: EventId;
      readonly type: 'MEETING_SCHEDULED';
      readonly previousPaceCarPosition: number;
      readonly newPaceCarPosition: number;
      readonly threshold: number;
    }
  | {
      readonly id: EventId;
      readonly type: 'DESIGN_UPGRADED';
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
  | {
      readonly id: EventId;
      readonly type: 'RECYCLING_PART_SWAPPED';
      readonly playerId: PlayerId;
      readonly outgoingPartId: PartId;
      readonly incomingPartId: PartId;
      readonly playerSlot: number;
      readonly recyclingSlot: number;
    }
  | {
      readonly id: EventId;
      readonly type: 'TRAINING_ADVANCED';
      readonly playerId: PlayerId;
      readonly department: Department;
      readonly fromLevel: number;
      readonly toLevel: number;
      readonly source: 'SHIFT' | 'BOOK';
      readonly shiftCost: 0 | 1;
      readonly bookCost: 0 | 1;
      readonly tieOrder: readonly PlayerId[];
    }
  | {
      readonly id: EventId;
      readonly type: 'PLAYER_CERTIFIED';
      readonly playerId: PlayerId;
      readonly department: Department;
      readonly certificationPosition: number;
      readonly administrationSeatUnlocked: boolean;
    }
  | {
      readonly id: EventId;
      readonly type: 'PLAYER_BECAME_EXPERT';
      readonly playerId: PlayerId;
      readonly department: Department;
      readonly plaqueChoiceRequired: boolean;
    }
  | {
      readonly id: EventId;
      readonly type: 'EXPERT_SEAT_AWARDED';
      readonly playerId: PlayerId;
      readonly department: Department;
    }
  | {
      readonly id: EventId;
      readonly type: 'AWARD_PLAQUE_CLAIMED';
      readonly playerId: PlayerId;
      readonly department: Department;
      readonly plaqueId: AwardPlaqueId;
      readonly reward: AwardPlaqueReward;
    }
  | {
      readonly id: EventId;
      readonly type: 'FACTORY_GOAL_ACHIEVED';
      readonly playerId: PlayerId;
      readonly goalId: FactoryGoalId;
      readonly category: FactoryGoalCategory;
      readonly beforeMetric: number;
      readonly afterMetric: number;
      readonly threshold: number;
      readonly seatOutcome: FactoryGoalSeatOutcome;
    }
  | {
      readonly id: EventId;
      readonly type: 'RED_SEAT_CONVERTED';
      readonly playerId: PlayerId;
    }
  | {
      readonly id: EventId;
      readonly type: 'MICROMANAGE_STARTED';
      readonly playerId: PlayerId;
      readonly department: MicromanageDepartment;
    }
  | {
      readonly id: EventId;
      readonly type: 'SANDRA_MOVED';
      readonly department: Department;
      readonly workstationId: WorkstationId;
    }
  | {
      readonly id: EventId;
      readonly type: 'SANDRA_AUDIT_RESOLVED';
      readonly department: Department;
      readonly mode: SandraMode;
      readonly results: readonly SandraAuditResult[];
    }
  | {
      readonly id: EventId;
      readonly type: 'SANDRA_DEPARTMENT_TASK_RESOLVED';
      readonly department: Department;
      readonly task: SandraDepartmentTask;
    }
  | {
      readonly id: EventId;
      readonly type: 'PLAYER_FINISHED_WORK';
      readonly playerId: PlayerId;
    }
  | {
      readonly id: EventId;
      readonly type: 'DAY_ENDED';
      readonly nextSelectionOrder: readonly PlayerId[];
    };
