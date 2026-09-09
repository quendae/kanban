import type { KanbanOrderOrientation, ModelId, PartTypeId } from './content.js';
import type { DesignId, KanbanOrderId, PartId, PlayerId } from './ids.js';
import type { WorkstationId } from './workstations.js';

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
