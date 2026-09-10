import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  createShellGame,
  type FinalGoalId,
  type GameContent,
  type PerformanceGoalId,
} from '../src/index.js';

const performanceGoalId = 'performance-goal:0' as PerformanceGoalId;
const finalGoalId = 'final-goal:0' as FinalGoalId;

function meetingContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'm5-state-fixture',
    authoritative: false,
    performanceGoals: {
      [performanceGoalId]: {
        id: performanceGoalId,
        condition: { metric: 'CARS', operator: 'GTE', value: 2 },
        basePP: 2,
        firstMultiplier: 3,
      },
    },
    finalGoals: {
      [finalGoalId]: {
        id: finalGoalId,
        achievements: [
          {
            condition: { metric: 'CERTIFICATIONS', operator: 'GTE', value: 3 },
            pp: 4,
          },
        ],
      },
    },
  };
}

describe('M5 Meeting canonical state', () => {
  it('initializes an empty serializable Meeting shell', () => {
    const state = createShellGame({ seed: 'm5-state', playerCount: 3 });

    expect(state.meeting).toEqual({
      active: false,
      speakerOrder: [],
      speakerCursor: 0,
      consecutivePasses: 0,
      revealedPetProjects: [],
      spokenGoalsByPlayer: {},
      usedSeatsByPlayer: {},
    });
    expect(state.board.performanceGoalDisplay).toEqual([]);
    expect(state.performanceGoalDeck).toEqual([]);
    expect(state.performanceGoalHands).toEqual({});
    expect(state.finalGoalId).toBeNull();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('keeps Performance Goal and Final Goal definitions in replaceable non-authoritative content', () => {
    const content = meetingContent();

    expect(content.authoritative).toBe(false);
    expect(content.performanceGoals[performanceGoalId]).toMatchObject({
      id: performanceGoalId,
      basePP: 2,
      firstMultiplier: 3,
    });
    expect(content.finalGoals[finalGoalId]?.achievements).toHaveLength(1);
  });
});
