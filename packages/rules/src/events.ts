import type { EventId } from './ids.js';

export type GameEvent = {
  readonly id: EventId;
  readonly type: 'GAME_STARTED';
};
