import type { GameEvent as BaseGameEvent } from './events.js';
import type { EventId, PerformanceGoalId, PlayerId } from './ids.js';
import type { RngState } from './rng.js';
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

export interface ProductionCycleAdvancedEvent {
  readonly id: EventId;
  readonly type: 'PRODUCTION_CYCLE_ADVANCED';
  readonly previousProductionCycle: number;
  readonly productionCycle: number;
}

export interface FinalScoringStartedEvent {
  readonly id: EventId;
  readonly type: 'FINAL_SCORING_STARTED';
}

export interface MeetingStartedEvent {
  readonly id: EventId;
  readonly type: 'MEETING_STARTED';
  readonly speakerOrder: readonly PlayerId[];
}

export interface PetProjectRevealedEvent {
  readonly id: EventId;
  readonly type: 'PET_PROJECT_REVEALED';
  readonly playerId: PlayerId;
  readonly goalId: PerformanceGoalId;
}

export interface MeetingGoalScoredEvent {
  readonly id: EventId;
  readonly type: 'MEETING_GOAL_SCORED';
  readonly playerId: PlayerId;
  readonly goalId: PerformanceGoalId;
  readonly ppAwarded: number;
}

export interface MeetingPlayerPassedEvent {
  readonly id: EventId;
  readonly type: 'MEETING_PLAYER_PASSED';
  readonly playerId: PlayerId;
}

export interface MeetingReplenishmentStartedEvent {
  readonly id: EventId;
  readonly type: 'MEETING_REPLENISHMENT_STARTED';
  readonly playerIds: readonly PlayerId[];
}

export interface NextMeetingGoalChosenEvent {
  readonly id: EventId;
  readonly type: 'NEXT_MEETING_GOAL_CHOSEN';
  readonly playerId: PlayerId;
  readonly goalId: PerformanceGoalId;
}

export interface MeetingCompletedEvent {
  readonly id: EventId;
  readonly type: 'MEETING_COMPLETED';
  readonly performanceGoalDisplay: readonly PerformanceGoalId[];
  readonly performanceGoalDeck: readonly PerformanceGoalId[];
  readonly performanceGoalDiscard: readonly PerformanceGoalId[];
  readonly performanceGoalHands: Readonly<Partial<Record<PlayerId, readonly PerformanceGoalId[]>>>;
  readonly rng: RngState;
}

export type WeeklyScoringEvent =
  | WeekAdvancedEvent
  | EndOfWeekScoredEvent
  | ProductionCycleAdvancedEvent
  | FinalScoringStartedEvent;
export type MeetingEvent =
  | MeetingStartedEvent
  | PetProjectRevealedEvent
  | MeetingGoalScoredEvent
  | MeetingPlayerPassedEvent
  | MeetingReplenishmentStartedEvent
  | NextMeetingGoalChosenEvent
  | MeetingCompletedEvent;
export type GameEvent = BaseGameEvent | WeeklyScoringEvent | MeetingEvent;
