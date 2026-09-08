import type { EventId, PlayerId } from './ids.js';
import type { WorkstationId } from './workstations.js';

export type GameEvent =
  | {
      readonly id: EventId;
      readonly type: 'GAME_STARTED';
    }
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
      readonly type: 'PLAYER_FINISHED_WORK';
      readonly playerId: PlayerId;
    }
  | {
      readonly id: EventId;
      readonly type: 'DAY_ENDED';
      readonly nextSelectionOrder: readonly PlayerId[];
    };
