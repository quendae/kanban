import type { Department } from './enums.js';
import { evaluateGoalCondition, getGoalMetric } from './goal-metrics.js';
import { getTrainingRank } from './hr.js';
import type { PlayerId } from './ids.js';
import {
  getPlayerGarageCars,
  getPlayerUpgradedDesigns,
} from './inventory.js';
import type { GameState } from './model.js';
import { isTestedDesign } from './testing.js';

export type FinalGoalChoices = Readonly<Partial<Record<PlayerId, readonly number[]>>>;

export type FinalScoreCategory =
  | 'FINAL_GOALS'
  | 'BANKED_SHIFTS'
  | 'RESOURCES'
  | 'CARS'
  | 'TESTED_DESIGNS'
  | 'TRAINING';

export interface FinalScoreBreakdownEntry {
  readonly category: FinalScoreCategory;
  readonly pp: number;
  readonly detail: string;
}

export interface PlayerFinalScore {
  readonly playerId: PlayerId;
  readonly finalGoals: number;
  readonly bankedShifts: number;
  readonly resources: number;
  readonly cars: number;
  readonly testedDesigns: number;
  readonly training: number;
  readonly total: number;
  readonly seatsSpentOnFinalGoals: number;
  readonly unresolvedContent: readonly string[];
  readonly breakdown: readonly FinalScoreBreakdownEntry[];
}

const DEPARTMENTS: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

const TRAINING_PP_BY_POSITION = [5, 3, 1] as const;

function scoreTraining(state: GameState): Readonly<Record<PlayerId, number>> {
  const scores = Object.fromEntries(
    state.players.map((player) => [player.id, 0]),
  ) as Record<PlayerId, number>;

  for (const department of DEPARTMENTS) {
    const rank = getTrainingRank(state, department);
    rank.forEach((playerId, index) => {
      const player = state.players.find((candidate) => candidate.id === playerId);
      if (!player || player.training[department] <= 0) return;
      scores[playerId] = (scores[playerId] ?? 0) + (TRAINING_PP_BY_POSITION[index] ?? 0);
    });
  }
  return scores;
}

function uniqueAchievementChoices(choices: readonly number[]): readonly number[] {
  return [...new Set(choices.filter((index) => Number.isInteger(index) && index >= 0))];
}

export function scoreFinalGame(
  state: GameState,
  finalGoalChoices: FinalGoalChoices,
): readonly PlayerFinalScore[] {
  const trainingScores = scoreTraining(state);

  return state.players.map((player): PlayerFinalScore => {
    const breakdown: FinalScoreBreakdownEntry[] = [];
    const unresolvedContent: string[] = [];
    let spendableSeats = player.genericRedSeats + player.conferenceSeatsFaceUp;
    let seatsSpentOnFinalGoals = 0;
    let finalGoals = 0;

    const finalGoal = state.finalGoalId === null
      ? undefined
      : state.content.finalGoals[state.finalGoalId];
    const choices = uniqueAchievementChoices(finalGoalChoices[player.id] ?? []);

    for (const achievementIndex of choices) {
      const achievement = finalGoal?.achievements[achievementIndex];
      if (!achievement) {
        unresolvedContent.push(
          state.finalGoalId === null
            ? `final-goal:missing#${achievementIndex}`
            : `${state.finalGoalId}#${achievementIndex}`,
        );
        continue;
      }
      if (getGoalMetric(state, player.id, achievement.condition) === null) {
        unresolvedContent.push(`${state.finalGoalId ?? 'final-goal:missing'}#${achievementIndex}`);
        continue;
      }
      if (!evaluateGoalCondition(state, player.id, achievement.condition)) continue;
      if (spendableSeats <= 0) continue;
      spendableSeats -= 1;
      seatsSpentOnFinalGoals += 1;
      finalGoals += achievement.pp;
    }
    breakdown.push({
      category: 'FINAL_GOALS',
      pp: finalGoals,
      detail: `${seatsSpentOnFinalGoals} Final Goal achievements scored with Seats`,
    });

    const bankedShifts = player.bankedShifts;
    breakdown.push({
      category: 'BANKED_SHIFTS',
      pp: bankedShifts,
      detail: `${player.bankedShifts} Banked Shifts × 1 PP`,
    });

    const resources = spendableSeats + player.books + player.vouchers;
    breakdown.push({
      category: 'RESOURCES',
      pp: resources,
      detail: `${spendableSeats} Seats + ${player.books} Books + ${player.vouchers} Parts Vouchers`,
    });

    let cars = 0;
    const garageCars = getPlayerGarageCars(state, player.id);
    for (const carId of garageCars) {
      const finalPP = state.content.cars[carId]?.finalPP;
      if (finalPP === null || finalPP === undefined) {
        unresolvedContent.push(carId);
        continue;
      }
      cars += finalPP;
    }
    breakdown.push({
      category: 'CARS',
      pp: cars,
      detail: `${garageCars.length} garage Cars scored from content finalPP values`,
    });

    let testedDesigns = 0;
    let testedDesignCount = 0;
    for (const designId of getPlayerUpgradedDesigns(state, player.id)) {
      if (!isTestedDesign(state, player.id, designId)) continue;
      const upgrade = state.board.designUpgrades[designId];
      if (!upgrade) continue;
      testedDesignCount += 1;
      testedDesigns += state.board.partValues[upgrade.partType] ?? 0;
    }
    breakdown.push({
      category: 'TESTED_DESIGNS',
      pp: testedDesigns,
      detail: `${testedDesignCount} Tested Designs scored once at current global Part values`,
    });

    const training = trainingScores[player.id] ?? 0;
    breakdown.push({
      category: 'TRAINING',
      pp: training,
      detail: 'Training Track ranks scored 5/3/1 PP with stack order breaking ties',
    });

    const total = finalGoals + bankedShifts + resources + cars + testedDesigns + training;
    return {
      playerId: player.id,
      finalGoals,
      bankedShifts,
      resources,
      cars,
      testedDesigns,
      training,
      total,
      seatsSpentOnFinalGoals,
      unresolvedContent,
      breakdown,
    };
  });
}
