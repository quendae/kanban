import type { GoalCondition } from './content.js';
import type { PlayerId } from './ids.js';
import {
  getPlayerDesigns,
  getPlayerGarageCars,
  getPlayerParts,
  getPlayerUpgradedDesigns,
} from './inventory.js';
import type { GameState } from './model.js';
import { isTestedDesign } from './testing.js';

export function getGoalMetric(
  state: GameState,
  playerId: PlayerId,
  condition: GoalCondition,
): number | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;

  switch (condition.metric) {
    case 'CARS':
      return getPlayerGarageCars(state, playerId).length;
    case 'TESTED_DESIGNS':
      return getPlayerUpgradedDesigns(state, playerId).filter((designId) =>
        isTestedDesign(state, playerId, designId),
      ).length;
    case 'CERTIFICATIONS':
      return player.certifications.length;
    case 'TRAINING_TOTAL':
      return Object.values(player.training).reduce((total, level) => total + level, 0);
    case 'PARTS':
      return getPlayerParts(state, playerId).length;
    case 'BLUEPRINTS':
      return getPlayerDesigns(state, playerId).length;
    case 'UPGRADED_DESIGNS':
      return getPlayerUpgradedDesigns(state, playerId).length;
    case 'BANKED_SHIFTS':
      return player.bankedShifts;
    case 'FACE_UP_SEATS':
      return player.conferenceSeatsFaceUp;
    default:
      return null;
  }
}

export function evaluateGoalCondition(
  state: GameState,
  playerId: PlayerId,
  condition: GoalCondition,
): boolean {
  const metric = getGoalMetric(state, playerId, condition);
  if (metric === null) return false;

  switch (condition.operator) {
    case 'GTE': return metric >= condition.value;
    case 'LTE': return metric <= condition.value;
    case 'EQ': return metric === condition.value;
  }
}
