import type { KanbanOrderOrientation, ModelId, PartTypeId } from './content.js';
import type { Department } from './enums.js';
import type {
  AssemblyNodeId,
  AwardPlaqueId,
  CarId,
  DesignId,
  KanbanOrderId,
  PartId,
  PerformanceGoalId,
  PlayerId,
  UpgradeSpaceId,
} from './ids.js';
import type { MicromanageDepartment } from './model.js';
import type { WorkstationId } from './workstations.js';

export interface ClaimCarDecision {
  readonly carId: CarId;
  readonly designId: DesignId;
  readonly garageSlot: number;
  readonly replaceCarId?: CarId;
}

export type GameCommand =
  | {
      readonly type: 'START_GAME';
      readonly actorId: PlayerId;
    }
  | {
      readonly type: 'SELECT_WORKSTATION';
      readonly actorId: PlayerId;
      readonly workstationId: WorkstationId;
    }
  | {
      readonly type: 'START_DESIGN_SELECTION';
      readonly actorId: PlayerId;
    }
  | {
      readonly type: 'TAKE_DESIGN';
      readonly actorId: PlayerId;
      readonly designId: DesignId;
    }
  | {
      readonly type: 'END_DESIGN_SELECTION';
      readonly actorId: PlayerId;
    }
  | {
      readonly type: 'COLLECT_PARTS';
      readonly actorId: PlayerId;
      readonly partType: PartTypeId;
      readonly quantity: number;
    }
  | {
      readonly type: 'ISSUE_KANBAN_ORDER';
      readonly actorId: PlayerId;
      readonly orderId: KanbanOrderId;
      readonly orientation: KanbanOrderOrientation;
    }
  | {
      readonly type: 'TAKE_PARTS_VOUCHER';
      readonly actorId: PlayerId;
    }
  | {
      readonly type: 'PROVIDE_ASSEMBLY_PART';
      readonly actorId: PlayerId;
      readonly model: ModelId;
      readonly partId: PartId;
      readonly pathChoices?: readonly AssemblyNodeId[];
    }
  | {
      readonly type: 'CLAIM_CARS';
      readonly actorId: PlayerId;
      readonly claims: readonly ClaimCarDecision[];
    }
  | {
      readonly type: 'UPGRADE_DESIGN';
      readonly actorId: PlayerId;
      readonly designId: DesignId;
      readonly partId: PartId;
      readonly upgradeSpaceId: UpgradeSpaceId;
      readonly doubleUpgrade: boolean;
    }
  | {
      readonly type: 'SWAP_RECYCLING_PART';
      readonly actorId: PlayerId;
      readonly outgoingPartId: PartId;
      readonly incomingPartId: PartId;
    }
  | {
      readonly type: 'TRAIN_DEPARTMENT';
      readonly actorId: PlayerId;
      readonly department: Department;
      readonly source: 'SHIFT' | 'BOOK';
    }
  | {
      readonly type: 'CHOOSE_AWARD_PLAQUE';
      readonly actorId: PlayerId;
      readonly department: Department;
      readonly plaqueId: AwardPlaqueId;
    }
  | {
      readonly type: 'CONVERT_RED_SEAT';
      readonly actorId: PlayerId;
    }
  | {
      readonly type: 'START_MICROMANAGE';
      readonly actorId: PlayerId;
      readonly department: MicromanageDepartment;
    }
  | {
      readonly type: 'FINISH_WORK';
      readonly actorId: PlayerId;
    };

export type MeetingCommand =
  | {
      readonly type: 'REVEAL_PET_PROJECT';
      readonly actorId: PlayerId;
      readonly goalId: PerformanceGoalId;
    }
  | {
      readonly type: 'SPEAK_AT_MEETING';
      readonly actorId: PlayerId;
      readonly goalId: PerformanceGoalId;
    }
  | {
      readonly type: 'PASS_MEETING';
      readonly actorId: PlayerId;
    };

export type RulesCommand = GameCommand | MeetingCommand;
