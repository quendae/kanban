import { RULESET_ID } from './constants.js';

export type RulesetId = typeof RULESET_ID;
export type PlayerCount = 2 | 3 | 4;

export type GamePhase =
  | 'SETUP'
  | 'SELECT_DEPARTMENT'
  | 'WORK'
  | 'END_OF_DAY'
  | 'MEETING'
  | 'WEEKLY_SCORE'
  | 'FINAL_SCORE'
  | 'GAME_OVER';

export type Department =
  | 'DESIGN'
  | 'LOGISTICS'
  | 'ASSEMBLY'
  | 'TESTING_INNOVATION'
  | 'ADMINISTRATION';

export type ActorKind = 'HUMAN' | 'BOT' | 'SANDRA';
