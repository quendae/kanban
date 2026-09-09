import type { ModelId, PartTypeId } from './content.js';
import type { CarId, DesignId, PartId, PlayerId, UpgradeSpaceId } from './ids.js';
import type { EntityLocation, GameState } from './model.js';

type LocationMap<T extends string> = Readonly<Partial<Record<T, EntityLocation>>>;

function getOrderedIds<T extends string>(
  map: LocationMap<T>,
  matches: (location: EntityLocation, id: T) => boolean,
): T[] {
  return (Object.entries(map) as [T, EntityLocation | undefined][])
    .filter(
      (entry): entry is [T, EntityLocation] =>
        entry[1] !== undefined && matches(entry[1], entry[0]),
    )
    .sort((a, b) => {
      const slotDifference =
        ('slot' in a[1] ? a[1].slot : -1) - ('slot' in b[1] ? b[1].slot : -1);
      return slotDifference !== 0 ? slotDifference : a[0].localeCompare(b[0]);
    })
    .map(([id]) => id);
}

export function getDesignRow(state: GameState, row: 0 | 1): DesignId[] {
  return getOrderedIds(
    state.board.designs,
    (location) => location.kind === 'BOARD' && location.area === `design-row:${row}`,
  );
}

export type DesignDeckId = 'row0' | 'row1' | 'central';

export function getDesignDeck(state: GameState, deck: DesignDeckId): DesignId[] {
  return getOrderedIds(
    state.board.designs,
    (location) => location.kind === 'BOARD' && location.area === `design-deck:${deck}`,
  );
}

export function getPlayerDesigns(state: GameState, playerId: PlayerId): DesignId[] {
  return getOrderedIds(
    state.board.designs,
    (location) =>
      location.kind === 'PLAYER' &&
      location.playerId === playerId &&
      location.area === 'blueprints',
  );
}

export function getWarehouseParts(state: GameState, partType: PartTypeId): PartId[] {
  return getOrderedIds(
    state.board.parts,
    (location) => location.kind === 'BOARD' && location.area === `warehouse:${partType}`,
  );
}

export function getSupplyParts(state: GameState, partType: PartTypeId): PartId[] {
  return getOrderedIds(state.board.parts, (location) => location.kind === 'SUPPLY').filter(
    (partId) => state.content.parts[partId]?.type === partType,
  );
}

export function getPlayerParts(state: GameState, playerId: PlayerId): PartId[] {
  return getOrderedIds(
    state.board.parts,
    (location) =>
      location.kind === 'PLAYER' && location.playerId === playerId && location.area === 'parts',
  );
}

export function getRecyclingParts(state: GameState): PartId[] {
  return getOrderedIds(
    state.board.parts,
    (location) => location.kind === 'BOARD' && location.area === 'recycling',
  );
}

export function getAssemblyCars(state: GameState, model: ModelId): CarId[] {
  const graph = state.content.assemblyGraph.models[model];
  const graphNodes = new Set(Object.keys(graph?.nodes ?? {}));
  return getOrderedIds(state.board.cars, (location) => {
    if (location.kind !== 'BOARD') return false;
    if (location.area === `assembly:${model}`) return true;
    if (!location.area.startsWith('assembly-node:')) return false;
    return graphNodes.has(location.area.slice('assembly-node:'.length));
  });
}

export function getAssemblyParts(state: GameState, model: ModelId): PartId[] {
  return getOrderedIds(
    state.board.parts,
    (location) => location.kind === 'BOARD' && location.area === `assembly:${model}`,
  );
}

export function getTestTrackCars(state: GameState): CarId[] {
  return getOrderedIds(
    state.board.cars,
    (location) => location.kind === 'BOARD' && location.area === 'test-track',
  );
}

export function getPlayerGarageCars(state: GameState, playerId: PlayerId): CarId[] {
  return getOrderedIds(
    state.board.cars,
    (location) =>
      location.kind === 'PLAYER' && location.playerId === playerId && location.area === 'garage',
  );
}

export function getUpgradeParts(state: GameState, model: ModelId): PartId[] {
  const upgradedPartTypes = new Set<PartTypeId>();
  for (const [rawDesignId, upgrade] of Object.entries(state.board.designUpgrades)) {
    if (upgrade === undefined) continue;
    const designId = rawDesignId as DesignId;
    if (state.content.designs[designId]?.model === model) {
      upgradedPartTypes.add(upgrade.partType);
    }
  }

  return getOrderedIds(state.board.parts, (location, partId) => {
    if (location.kind !== 'BOARD') return false;
    if (location.area === `innovation:${model}`) return true;

    const definition = state.content.upgradeSpaces[location.area as UpgradeSpaceId];
    if (definition?.model === model) return true;
    if (definition?.model !== null) return false;

    const partType = state.content.parts[partId]?.type;
    return partType !== undefined && upgradedPartTypes.has(partType);
  });
}

export function getActiveDemands(state: GameState) {
  return state.board.activeDemands.map((demand) => ({ ...demand }));
}
