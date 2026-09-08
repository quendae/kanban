import type { PartTypeId } from './content.js';
import type { DesignId, PartId, PlayerId } from './ids.js';
import type { EntityLocation, GameState } from './model.js';

type LocationMap<T extends string> = Readonly<Partial<Record<T, EntityLocation>>>;

function getOrderedIds<T extends string>(
  map: LocationMap<T>,
  matches: (location: EntityLocation) => boolean,
): T[] {
  return (Object.entries(map) as [T, EntityLocation | undefined][])
    .filter((entry): entry is [T, EntityLocation] => entry[1] !== undefined && matches(entry[1]))
    .sort((a, b) => {
      const slotDifference = ('slot' in a[1] ? a[1].slot : -1) - ('slot' in b[1] ? b[1].slot : -1);
      return slotDifference !== 0 ? slotDifference : a[0].localeCompare(b[0]);
    })
    .map(([id]) => id);
}

export function getDesignRow(state: GameState, row: 0 | 1): DesignId[] {
  return getOrderedIds(state.board.designs, (location) =>
    location.kind === 'BOARD' && location.area === `design-row:${row}`,
  );
}

export type DesignDeckId = 'row0' | 'row1' | 'central';

export function getDesignDeck(state: GameState, deck: DesignDeckId): DesignId[] {
  return getOrderedIds(state.board.designs, (location) =>
    location.kind === 'BOARD' && location.area === `design-deck:${deck}`,
  );
}

export function getPlayerDesigns(state: GameState, playerId: PlayerId): DesignId[] {
  return getOrderedIds(state.board.designs, (location) =>
    location.kind === 'PLAYER' &&
    location.playerId === playerId &&
    location.area === 'blueprints',
  );
}

export function getWarehouseParts(state: GameState, partType: PartTypeId): PartId[] {
  return getOrderedIds(state.board.parts, (location) =>
    location.kind === 'BOARD' && location.area === `warehouse:${partType}`,
  );
}

export function getPlayerParts(state: GameState, playerId: PlayerId): PartId[] {
  return getOrderedIds(state.board.parts, (location) =>
    location.kind === 'PLAYER' &&
    location.playerId === playerId &&
    location.area === 'parts',
  );
}

export function getRecyclingParts(state: GameState): PartId[] {
  return getOrderedIds(state.board.parts, (location) =>
    location.kind === 'BOARD' && location.area === 'recycling',
  );
}
