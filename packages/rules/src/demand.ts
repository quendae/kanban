import type { ModelId } from './content.js';
import type { DemandId } from './ids.js';
import { getAssemblyParts } from './inventory.js';
import type { ActiveDemandState, GameState } from './model.js';
import { shuffle, type RngState } from './rng.js';

export function willCompleteAssemblyModel(state: GameState, model: ModelId): boolean {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph || graph.assemblySlots <= 0) return false;
  return getAssemblyParts(state, model).length + 1 === graph.assemblySlots;
}

export function getMatchingDemandId(state: GameState, model: ModelId): DemandId | null {
  for (const active of state.board.activeDemands) {
    if (active.redSeatsRemaining <= 0) continue;
    const definition = state.content.demands[active.demandId];
    if (definition?.model === model) return active.demandId;
  }
  return null;
}

export interface DemandRefreshPlan {
  readonly activeDemands: readonly ActiveDemandState[];
  readonly demandDeck: readonly DemandId[];
  readonly demandDiscard: readonly DemandId[];
  readonly rng: RngState;
}

function activeDemand(state: GameState, demandId: DemandId): ActiveDemandState | null {
  const definition = state.content.demands[demandId];
  if (!definition) return null;
  return { demandId, redSeatsRemaining: definition.redSeatCount };
}

export function planDemandRefresh(state: GameState): DemandRefreshPlan | null {
  const exhaustedIndices = state.board.activeDemands
    .map((demand, index) => (demand.redSeatsRemaining === 0 ? index : -1))
    .filter((index) => index >= 0);
  if (exhaustedIndices.length === 0) return null;

  const active = state.board.activeDemands.map((demand) => ({ ...demand }));
  const deck = [...state.board.demandDeck];
  const newlyDiscarded: DemandId[] = [];
  const stillNeedsReplacement: number[] = [];

  for (const index of exhaustedIndices) {
    const current = active[index];
    if (!current) continue;
    newlyDiscarded.push(current.demandId);

    const nextId = deck.shift();
    if (nextId === undefined) {
      stillNeedsReplacement.push(index);
      continue;
    }
    const replacement = activeDemand(state, nextId);
    if (replacement === null) {
      stillNeedsReplacement.push(index);
      continue;
    }
    active[index] = replacement;
  }

  const recyclePool = [...state.board.demandDiscard, ...newlyDiscarded];
  const shuffled = shuffle(state.rng, recyclePool);
  const recycled = [...shuffled.values];

  for (const index of stillNeedsReplacement) {
    while (recycled.length > 0) {
      const nextId = recycled.shift();
      if (nextId === undefined) break;
      const replacement = activeDemand(state, nextId);
      if (replacement === null) continue;
      active[index] = replacement;
      break;
    }
  }

  return {
    activeDemands: active,
    demandDeck: [...deck, ...recycled],
    demandDiscard: [],
    rng: shuffled.rng,
  };
}
