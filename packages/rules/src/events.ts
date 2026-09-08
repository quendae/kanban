import type { KanbanOrderOrientation } from './content.js';
import type { DesignMove } from './design.js';
import type { DesignId, EventId, KanbanOrderId, PartId, PlayerId } from './ids.js';
import type { WarehousePartMove } from './logistics.js';
import type { PendingRewardType } from './model.js';
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
