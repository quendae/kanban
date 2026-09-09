import type { KanbanOrderOrientation, ModelId, PartTypeId } from './content.js';
import type {
  AssemblyNodeId,
  CarId,
  DesignId,
  KanbanOrderId,
  PartId,
  PlayerId,
  UpgradeSpaceId,
} from './ids.js';
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
      readonly type: 'FINISH_WORK';
      readonly actorId: PlayerId;
    };
