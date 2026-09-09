import type { FactoryGoalCategory } from './content.js';
import type { FactoryGoalId, PlayerId } from './ids.js';
import { getPlayerDesigns, getPlayerGarageCars } from './inventory.js';
import type { GameState } from './model.js';

export type FactoryGoalSeatOutcome = 'FLIP_OWN_SEAT' | 'GAIN_RED_SEAT';

export interface FactoryGoalAwardPlan {
  readonly playerId: PlayerId;
  readonly goalId: FactoryGoalId;
  readonly category: FactoryGoalCategory;
  readonly beforeMetric: number;
  readonly afterMetric: number;
  readonly threshold: number;
  readonly seatOutcome: FactoryGoalSeatOutcome;
}

function playerIndex(state: GameState, playerId: PlayerId): number {
  return state.players.findIndex((player) => player.id === playerId);
}

export function getFactoryGoalMetric(
  state: GameState,
  playerId: PlayerId,
  category: FactoryGoalCategory,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;

  switch (category) {
    case 'CERTIFICATIONS':
      return player.certifications.length;
    case 'CARS':
      return getPlayerGarageCars(state, playerId).length;
    case 'UPGRADED_DESIGNS': {
      const ownedDesigns = new Set(getPlayerDesigns(state, playerId));
      return Object.entries(state.board.designUpgrades).filter(
        ([designId, upgrade]) => upgrade !== undefined && ownedDesigns.has(designId as `design:${number}`),
      ).length;
    }
  }
}

export function planFactoryGoalAwards(
  before: GameState,
  after: GameState,
): readonly FactoryGoalAwardPlan[] {
  const awards: FactoryGoalAwardPlan[] = [];
  const faceDownRemaining = new Map<PlayerId, number>(
    after.players.map((player) => [player.id, player.conferenceSeatsFaceDown]),
  );
  const remainingByGoal = new Map<FactoryGoalId, number>(
    after.board.factoryGoals.map((goal) => [goal.goalId, goal.seatsRemaining]),
  );

  for (const activeGoal of after.board.factoryGoals) {
    const definition = after.content.factoryGoals[activeGoal.goalId];
    if (!definition) continue;

    for (const player of [...after.players].sort(
      (a, b) => playerIndex(after, a.id) - playerIndex(after, b.id),
    )) {
      const seatsRemaining = remainingByGoal.get(activeGoal.goalId) ?? 0;
      if (seatsRemaining <= 0) break;
      if (activeGoal.claimedBy.includes(player.id)) continue;

      const beforeMetric = getFactoryGoalMetric(before, player.id, definition.category);
      const afterMetric = getFactoryGoalMetric(after, player.id, definition.category);
      if (!(beforeMetric < definition.threshold && afterMetric >= definition.threshold)) continue;

      const availableOwnSeat = faceDownRemaining.get(player.id) ?? 0;
      const seatOutcome: FactoryGoalSeatOutcome =
        availableOwnSeat > 0 ? 'FLIP_OWN_SEAT' : 'GAIN_RED_SEAT';
      if (seatOutcome === 'FLIP_OWN_SEAT') {
        faceDownRemaining.set(player.id, availableOwnSeat - 1);
      }
      remainingByGoal.set(activeGoal.goalId, seatsRemaining - 1);

      awards.push({
        playerId: player.id,
        goalId: activeGoal.goalId,
        category: definition.category,
        beforeMetric,
        afterMetric,
        threshold: definition.threshold,
        seatOutcome,
      });
    }
  }

  return awards;
}
