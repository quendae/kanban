import type { PlayerId } from './ids.js';
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
    };
