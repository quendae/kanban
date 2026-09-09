import type { ModelId } from './content.js';
import type { DesignId, PlayerId } from './ids.js';
import { getPlayerGarageCars } from './inventory.js';
import type { GameState } from './model.js';

export interface WeeklyModelScore {
  readonly model: ModelId;
  readonly garageCars: number;
  readonly ownUpgrades: number;
  readonly otherUpgrades: number;
  readonly pointsPerCar: number;
  readonly points: number;
}

export interface PlayerWeeklyScore {
  readonly playerId: PlayerId;
  readonly models: readonly WeeklyModelScore[];
  readonly total: number;
}

function getUpgradeOwner(state: GameState, designId: DesignId): PlayerId | null {
  const location = state.board.designs[designId];
  if (location?.kind !== 'PLAYER' || location.area !== 'blueprints') return null;
  return location.playerId;
}

function getModelUpgradeCounts(
  state: GameState,
  playerId: PlayerId,
  model: ModelId,
): { readonly ownUpgrades: number; readonly otherUpgrades: number } {
  let ownUpgrades = 0;
  let otherUpgrades = 0;

  for (const [rawDesignId, upgrade] of Object.entries(state.board.designUpgrades)) {
    if (upgrade === undefined) continue;
    const designId = rawDesignId as DesignId;
    if (state.content.designs[designId]?.model !== model) continue;

    const ownerId = getUpgradeOwner(state, designId);
    if (ownerId === playerId) ownUpgrades += 1;
    else if (ownerId !== null) otherUpgrades += 1;
  }

  return { ownUpgrades, otherUpgrades };
}

export function scoreEndOfWeek(state: GameState): readonly PlayerWeeklyScore[] {
  return state.players.map((player) => {
    const garageCars = getPlayerGarageCars(state, player.id);
    const models: WeeklyModelScore[] = [];

    for (const model of state.content.models) {
      const modelCars = garageCars.filter(
        (carId) => state.content.cars[carId]?.model === model,
      ).length;
      if (modelCars === 0) continue;

      const { ownUpgrades, otherUpgrades } = getModelUpgradeCounts(state, player.id, model);
      const pointsPerCar = ownUpgrades * 2 + otherUpgrades;
      models.push({
        model,
        garageCars: modelCars,
        ownUpgrades,
        otherUpgrades,
        pointsPerCar,
        points: pointsPerCar * modelCars,
      });
    }

    return {
      playerId: player.id,
      models,
      total: models.reduce((total, model) => total + model.points, 0),
    };
  });
}
