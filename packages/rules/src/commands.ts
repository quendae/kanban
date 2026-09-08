import type { PlayerId } from './ids.js';

export type GameCommand = {
  readonly type: 'START_GAME';
  readonly actorId: PlayerId;
};
