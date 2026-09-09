import type { ModelId, PartTypeId } from './content.js';
import type { CarId, PartId, PlayerId } from './ids.js';
import { getAssemblyParts, getPlayerParts, getUpgradeParts } from './inventory.js';
import type { GameState } from './model.js';

function getPartType(state: GameState, partId: PartId): PartTypeId | null {
  return state.content.parts[partId]?.type ?? null;
}

function getPresentPartTypes(state: GameState, model: ModelId): Set<PartTypeId> {
  return new Set(
    getAssemblyParts(state, model)
      .map((partId) => getPartType(state, partId))
      .filter((partType): partType is PartTypeId => partType !== null),
  );
}

function getUpgradedPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const upgraded = new Set(
    getUpgradeParts(state, model)
      .map((partId) => getPartType(state, partId))
      .filter((partType): partType is PartTypeId => partType !== null),
  );
  return state.content.partTypes.filter((partType) => upgraded.has(partType));
}

export function getMissingUpgradedPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const present = getPresentPartTypes(state, model);
  return getUpgradedPartTypes(state, model).filter((partType) => !present.has(partType));
}

export function getNeededPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph || graph.assemblySlots <= 0) return [];

  const assemblyParts = getAssemblyParts(state, model);
  if (assemblyParts.length >= graph.assemblySlots) return [];

  const present = getPresentPartTypes(state, model);
  const missingUpgraded = getMissingUpgradedPartTypes(state, model);
  if (missingUpgraded.length > 0) return missingUpgraded;

  return state.content.partTypes.filter((partType) => !present.has(partType));
}

export function getAssemblyDestinationSlot(state: GameState, model: ModelId): number | null {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph) return null;

  const usedSlots = new Set<number>();
  for (const location of Object.values(state.board.parts)) {
    if (location?.kind === 'BOARD' && location.area === `assembly:${model}`) {
      usedSlots.add(location.slot);
    }
  }

  for (let slot = 0; slot < graph.assemblySlots; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }
  return null;
}

export function getAssemblyTurnStartCleanupPartIds(
  state: GameState,
  playerId: PlayerId,
): PartId[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (
    state.phase !== 'WORK' ||
    state.activeActorId !== playerId ||
    player?.currentDepartment !== 'ASSEMBLY' ||
    player.shiftsSpentToday !== 0
  ) {
    return [];
  }

  const partIds: PartId[] = [];
  for (const model of state.content.models) {
    const graph = state.content.assemblyGraph.models[model];
    if (!graph || graph.assemblySlots <= 0) continue;
    const modelParts = getAssemblyParts(state, model);
    if (modelParts.length >= graph.assemblySlots) partIds.push(...modelParts);
  }
  return partIds;
}

export function previewAssemblyTurnStartCleanup(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const partIds = getAssemblyTurnStartCleanupPartIds(state, playerId);
  if (partIds.length === 0) return state;

  const parts = { ...state.board.parts };
  for (const partId of partIds) parts[partId] = { kind: 'SUPPLY' };
  return { ...state, board: { ...state.board, parts } };
}

export function hasAssemblyCarAvailable(state: GameState, model: ModelId): boolean {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph) return false;
  const startArea = `assembly-node:${graph.startNodeId}`;

  for (const [rawCarId, location] of Object.entries(state.board.cars)) {
    const carId = rawCarId as CarId;
    const definition = state.content.cars[carId];
    if (definition?.model !== model || location === undefined) continue;
    if (location.kind === 'SUPPLY') return true;
    if (location.kind === 'BOARD' && location.area === startArea) return true;
  }
  return false;
}

export function isPlayerAssemblyPart(
  state: GameState,
  playerId: PlayerId,
  partId: PartId,
): boolean {
  return getPlayerParts(state, playerId).includes(partId);
}
