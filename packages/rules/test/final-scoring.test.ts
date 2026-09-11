import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  createShellGame,
  reduceEvent,
  scoreFinalGame,
  type CarId,
  type DesignId,
  type FinalGoalId,
  type GameState,
} from '../src/index.js';

const CAR_0 = 'car:0' as CarId;
const CAR_1 = 'car:1' as CarId;
const CAR_UNRESOLVED = 'car:2' as CarId;
const DESIGN_0 = 'design:0' as DesignId;
const DESIGN_1 = 'design:1' as DesignId;
const FINAL_GOAL = 'final-goal:0' as FinalGoalId;

function scoringFixture(): GameState {
  const shell = createShellGame({ seed: 'final-scoring', playerCount: 4 });
  return {
    ...shell,
    phase: 'FINAL_SCORE',
    finalGoalId: FINAL_GOAL,
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'final-scoring-fixture',
      authoritative: false,
      cars: {
        [CAR_0]: { id: CAR_0, model: 'model:0', finalPP: 2 },
        [CAR_1]: { id: CAR_1, model: 'model:0', finalPP: 4 },
        [CAR_UNRESOLVED]: { id: CAR_UNRESOLVED, model: 'model:1', finalPP: null },
      },
      designs: {
        [DESIGN_0]: {
          id: DESIGN_0,
          model: 'model:0',
          partType: 'part-type:0',
          oldestBonus: null,
        },
        [DESIGN_1]: {
          id: DESIGN_1,
          model: 'model:0',
          partType: 'part-type:1',
          oldestBonus: null,
        },
      },
      finalGoals: {
        [FINAL_GOAL]: {
          id: FINAL_GOAL,
          achievements: [
            { condition: { metric: 'CARS', operator: 'GTE', value: 2 }, pp: 4 },
            { condition: { metric: 'CERTIFICATIONS', operator: 'GTE', value: 1 }, pp: 3 },
          ],
        },
      },
    },
    board: {
      ...shell.board,
      cars: {
        [CAR_0]: { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
        [CAR_1]: { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 1 },
        [CAR_UNRESOLVED]: { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 2 },
      },
      designs: {
        [DESIGN_0]: { kind: 'PLAYER', playerId: 'player:0', area: 'upgraded-designs', slot: 0 },
        [DESIGN_1]: { kind: 'PLAYER', playerId: 'player:0', area: 'upgraded-designs', slot: 1 },
      },
      designUpgrades: {
        [DESIGN_0]: { partType: 'part-type:0', doubleUpgrade: false },
        [DESIGN_1]: { partType: 'part-type:1', doubleUpgrade: false },
      },
      partValues: {
        ...shell.board.partValues,
        'part-type:0': 3,
        'part-type:1': 5,
      },
      trainingTieOrder: {
        ...shell.board.trainingTieOrder,
        TESTING_INNOVATION: ['player:1', 'player:0', 'player:2', 'player:3'],
      },
    },
    players: shell.players.map((player) => {
      const base = {
        ...player,
        conferenceSeatsFaceDown: 0,
      };
      if (player.id === 'player:0') {
        return {
          ...base,
          pp: 20,
          bankedShifts: 2,
          books: 1,
          vouchers: 1,
          genericRedSeats: 1,
          conferenceSeatsFaceUp: 2,
          certifications: ['TESTING_INNOVATION'] as const,
          training: { ...player.training, TESTING_INNOVATION: 3 },
        };
      }
      if (player.id === 'player:1') {
        return { ...base, training: { ...player.training, TESTING_INNOVATION: 3 } };
      }
      if (player.id === 'player:2') {
        return { ...base, training: { ...player.training, TESTING_INNOVATION: 2 } };
      }
      return { ...base, training: { ...player.training, TESTING_INNOVATION: 1 } };
    }),
  };
}

describe('Original 2014 final scoring', () => {
  it('scores chosen Final Goal achievements, resources, printed cars and Tested Designs without duplicate-car multiplication', () => {
    const scores = scoreFinalGame(scoringFixture(), {
      'player:0': [0, 1],
    });
    const player = scores.find((score) => score.playerId === 'player:0');

    expect(player).toMatchObject({
      finalGoals: 7,
      bankedShifts: 2,
      resources: 3,
      cars: 6,
      testedDesigns: 8,
      training: 3,
      total: 29,
      seatsSpentOnFinalGoals: 2,
    });
    expect(player?.unresolvedContent).toContain(CAR_UNRESOLVED);
    expect(player?.breakdown.every((entry) => entry.detail.length > 0)).toBe(true);
  });

  it('scores Training 5/3/1 by rank, uses stack order for ties and gives zero for fourth place', () => {
    const scores = scoreFinalGame(scoringFixture(), {});
    const byPlayer = Object.fromEntries(scores.map((score) => [score.playerId, score.training]));

    expect(byPlayer).toEqual({
      'player:0': 3,
      'player:1': 5,
      'player:2': 1,
      'player:3': 0,
    });
  });

  it('applies final scores exactly once through an event and transitions to GAME_OVER', () => {
    const source = scoringFixture();
    const scores = scoreFinalGame(source, { 'player:0': [0, 1] });
    const result = reduceEvent(source, {
      id: 'event:999',
      type: 'FINAL_SCORE_APPLIED',
      scores,
    });

    expect(result.phase).toBe('GAME_OVER');
    expect(result.players[0]?.pp).toBe(20 + 29);
    expect(result.eventIndex).toBe(source.eventIndex + 1);
  });
});
