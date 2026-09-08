import type { PartTypeId } from './content.js';
import type { DesignId, PlayerId } from './ids.js';
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
      readonly type: 'FINISH_WORK';
      readonly actorId: PlayerId;
    };
