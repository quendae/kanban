import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  createShellGame,
  evaluateGoalCondition,
  getGoalMetric,
  getLegalCommands,
  getPerformanceGoalScore,
  type GameState,
  type GoalCondition,
  type PerformanceGoalId,
  type PlayerId,
} from '../src/index.js';

const GOAL = 'performance-goal:10' as PerformanceGoalId;
const OTHER = 'performance-goal:11' as PerformanceGoalId;

function scoringState(priorSpeakers = 0): GameState {
  const shell = createShellGame({ seed: `goal-decay-${priorSpeakers}`, playerCount: 4 });
  const priorIds = shell.players.slice(0, priorSpeakers).map((player) => player.id);
  return {
    ...shell,
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'performance-goal-scoring-fixture',
      authoritative: false,
      performanceGoals: {
        [GOAL]: {
          id: GOAL,
          condition: { metric: 'CARS', operator: 'GTE', value: 0 },
          basePP: 2,
          firstMultiplier: 3,
        },
        [OTHER]: {
          id: OTHER,
          condition: { metric: 'CARS', operator: 'GTE', value: 0 },
          basePP: 9,
          firstMultiplier: 1,
        },
      },
    },
    phase: 'MEETING',
    activeActorId: 'player:3',
    meetingScheduled: true,
    meeting: {
      active: true,
      speakerOrder: ['player:0', 'player:1', 'player:2', 'player:3'],
      speakerCursor: 3,
      consecutivePasses: 0,
      revealedPetProjects: ['player:3'],
      spokenGoalsByPlayer: Object.fromEntries(
        priorIds.map((playerId) => [playerId, [GOAL]]),
      ) as Partial<Record<PlayerId, readonly PerformanceGoalId[]>>,
      usedSeatsByPlayer: {},
      replenishmentChoicesPending: [],
      nextGoalChoices: {},
    },
    board: {
      ...shell.board,
      performanceGoalDisplay: [GOAL, OTHER],
    },
    players: shell.players.map((player) =>
      player.id === 'player:3'
        ? { ...player, conferenceSeatsFaceUp: 1, conferenceSeatsFaceDown: 3 }
        : player,
    ),
  };
}

describe('Original 2014 Performance Goal scoring', () => {
  it('decays 6/4/2/0 by prior speakers on that specific card', () => {
    expect(getPerformanceGoalScore(scoringState(0), 'player:3', GOAL)).toBe(6);
    expect(getPerformanceGoalScore(scoringState(1), 'player:3', GOAL)).toBe(4);
    expect(getPerformanceGoalScore(scoringState(2), 'player:3', GOAL)).toBe(2);
    expect(getPerformanceGoalScore(scoringState(3), 'player:3', GOAL)).toBe(0);
  });

  it('does not decay one Performance Goal when players spoke on another card', () => {
    const source = scoringState(0);
    const state: GameState = {
      ...source,
      meeting: {
        ...source.meeting,
        spokenGoalsByPlayer: { 'player:0': [OTHER], 'player:1': [OTHER] },
      },
    };
    expect(getPerformanceGoalScore(state, 'player:3', GOAL)).toBe(6);
  });

  it('excludes a Speak command when the player does not satisfy the goal condition', () => {
    const source = scoringState(0);
    const state: GameState = {
      ...source,
      activeActorId: 'player:0',
      meeting: {
        ...source.meeting,
        speakerCursor: 0,
        revealedPetProjects: ['player:0'],
      },
      content: {
        ...source.content,
        performanceGoals: {
          ...source.content.performanceGoals,
          [GOAL]: {
            id: GOAL,
            condition: { metric: 'CARS', operator: 'GTE', value: 1 },
            basePP: 2,
            firstMultiplier: 3,
          },
        },
      },
    };

    expect(getPerformanceGoalScore(state, 'player:0', GOAL)).toBe(0);
    expect(getLegalCommands(state, 'player:0')).not.toContainEqual({
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:0',
      goalId: GOAL,
    });
  });

  it('uses the closed metric registry and refuses unsupported metric names', () => {
    const state = scoringState(0);
    expect(getGoalMetric(state, 'player:3', { metric: 'CARS', operator: 'GTE', value: 0 })).toBe(0);
    expect(evaluateGoalCondition(state, 'player:3', { metric: 'CARS', operator: 'EQ', value: 0 })).toBe(true);

    const unsupported = {
      metric: 'ARBITRARY_RUNTIME_EXPRESSION',
      operator: 'GTE',
      value: 0,
    } as unknown as GoalCondition;
    expect(getGoalMetric(state, 'player:3', unsupported)).toBeNull();
    expect(evaluateGoalCondition(state, 'player:3', unsupported)).toBe(false);
  });
});
