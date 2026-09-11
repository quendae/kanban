import type { GameState } from './model.js';

export function isEndGameTriggered(state: GameState): boolean {
  return (
    (state.week >= 3 && state.productionCycle >= 2) ||
    (state.week >= 2 && state.productionCycle >= 3)
  );
}
