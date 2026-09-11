import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  applyCommand,
  createShellGame,
  isEndGameTriggered,
  type GameState,
  type PerformanceGoalId,
} from '../src/index.js';

function goal(index: number): PerformanceGoalId {
  return `performance-goal:${index}` as PerformanceGoalId;
}

function clockState(week: number, productionCycle: number): GameState {
  return {
    ...createShellGame({ seed: `end-clock-${week}-${productionCycle}`, playerCount: 2 }),
    week,
    productionCycle,
  };
}

function pendingMeetingAtEndThreshold(): GameState {
  const shell = createShellGame({ seed: 'end-after-meeting', playerCount: 2 });
  const performanceGoals = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      goal(index),
      {
        id: goal(index),
        condition: { metric: 'CARS' as const, operator: 'GTE' as const, value: 0 },
        basePP: 1,
        firstMultiplier: 3,
      },
    ]),
  );

  return {
    ...shell,
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'end-after-meeting-fixture',
      authoritative: false,
      performanceGoals,
    },
    phase: 'MEETING',
    meetingScheduled: true,
    week: 2,
    productionCycle: 2,
    activeActorId: 'player:0',
    meeting: {
      active: true,
      speakerOrder: ['player:0', 'player:1'],
      speakerCursor: 0,
      consecutivePasses: 2,
      revealedPetProjects: ['player:0', 'player:1'],
      spokenGoalsByPlayer: {},
      usedSeatsByPlayer: {},
      replenishmentChoicesPending: ['player:0'],
      nextGoalChoices: { 'player:1': goal(1) },
    },
    board: {
      ...shell.board,
      performanceGoalDisplay: [goal(2), goal(3), goal(4), goal(5)],
    },
    performanceGoalHands: {
      'player:0': [goal(0)],
      'player:1': [],
    },
    performanceGoalDeck: [goal(6), goal(7), goal(8), goal(9), goal(10), goal(11)],
  };
}

function triggeredWorkDayWithPendingMeeting(): GameState {
  const shell = createShellGame({ seed: 'end-waits-for-meeting', playerCount: 3 });
  return {
    ...shell,
    dayIndex: 2,
    week: 3,
    productionCycle: 2,
    phase: 'WORK',
    meetingScheduled: true,
    activeActorId: 'player:0',
    workOrder: ['player:1', 'player:2', 'player:0'],
    workCursor: 2,
    sandra: {
      ...shell.sandra,
      department: 'LOGISTICS',
      workstation: 'C_LEFT',
    },
    players: shell.players.map((player) => {
      if (player.id === 'player:0') {
        return {
          ...player,
          currentDepartment: 'TESTING_INNOVATION',
          currentWorkstation: 'A_LEFT',
          baseShiftsToday: 2,
        };
      }
      return { ...player, done: true };
    }),
  };
}

describe('Original 2014 3/2 end trigger', () => {
  it('triggers at either 3/2 orientation and not before', () => {
    expect(isEndGameTriggered(clockState(3, 2))).toBe(true);
    expect(isEndGameTriggered(clockState(2, 3))).toBe(true);
    expect(isEndGameTriggered(clockState(3, 1))).toBe(false);
    expect(isEndGameTriggered(clockState(2, 2))).toBe(false);
  });

  it('finishes the current day and enters a scheduled Meeting before final scoring', () => {
    const result = applyCommand(triggeredWorkDayWithPendingMeeting(), {
      type: 'FINISH_WORK',
      actorId: 'player:0',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toContain('MEETING_STARTED');
    expect(result.events.map((event) => event.type)).not.toContain('FINAL_SCORING_STARTED');
    expect(result.state.phase).toBe('MEETING');
  });

  it('advances Production Cycle after Meeting completion and starts final scoring only then', () => {
    const result = applyCommand(pendingMeetingAtEndThreshold(), {
      type: 'CHOOSE_NEXT_MEETING_GOAL',
      actorId: 'player:0',
      goalId: goal(0),
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual([
      'NEXT_MEETING_GOAL_CHOSEN',
      'MEETING_COMPLETED',
      'PRODUCTION_CYCLE_ADVANCED',
      'FINAL_SCORING_STARTED',
    ]);
    expect(result.state.productionCycle).toBe(3);
    expect(result.state.phase).toBe('FINAL_SCORE');
    expect(result.state.meetingScheduled).toBe(false);
  });
});
