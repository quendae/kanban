import type { GameEvent as BaseGameEvent } from './events.js';
import type { EventId, PlayerId } from './ids.js';
import type { PlayerWeeklyScore } from './weekly-scoring.js';

export type { BaseGameEvent };

export interface WeekAdvancedEvent {
  readonly id: EventId;
  readonly type: 'WEEK_ADVANCED';
  readonly previousWeek: number;
  readonly week: number;
}

export interface EndOfWeekScoredEvent {
  readonly id: EventId;
  readonly type: 'END_OF_WEEK_SCORED';
  readonly scores: readonly PlayerWeeklyScore[];
}

export interface MeetingStartedEvent {
  readonly id: EventId;
  readonly type: 'MEETING_STARTED';
  readonly speakerOrder: readonly PlayerId[];
}

export type WeeklyScoringEvent = WeekAdvancedEvent | EndOfWeekScoredEvent;
export type MeetingEvent = MeetingStartedEvent;
export type GameEvent = BaseGameEvent | WeeklyScoringEvent | MeetingEvent;
