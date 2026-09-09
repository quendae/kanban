import type { DesignId, PlayerId } from './ids.js';
import {
  getDesignDeck,
  getDesignRow,
  getPlayerDesigns,
  type DesignDeckId,
} from './inventory.js';
import type { EntityLocation, GameState, PendingRewardType } from './model.js';

export interface DesignMove {
  readonly designId: DesignId;
  readonly location: EntityLocation;
}

function isDesignCertified(state: GameState, playerId: PlayerId): boolean {
  return state.players
    .find((player) => player.id === playerId)
    ?.certifications.includes('DESIGN') ?? false;
}

export function getSelectableDesignIds(state: GameState, playerId: PlayerId): DesignId[] {
  const visible = [...getDesignRow(state, 0), ...getDesignRow(state, 1)];
  if (!isDesignCertified(state, playerId)) return visible;

  const fresh = (['row0', 'row1', 'central'] as const)
    .map((deck) => getDesignDeck(state, deck)[0])
    .filter((designId): designId is DesignId => designId !== undefined);

  return [...visible, ...fresh];
}

export function getOpenBlueprintSlot(state: GameState, playerId: PlayerId): number | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  const usedSlots = new Set(
    Object.values(state.board.designs)
      .filter(
        (location): location is Extract<EntityLocation, { readonly kind: 'PLAYER' }> =>
          location?.kind === 'PLAYER' &&
          location.playerId === playerId &&
          location.area === 'blueprints',
      )
      .map((location) => location.slot),
  );

  for (let slot = 0; slot < player.designCapacity; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }
  return null;
}

export function getOldestDesignBonus(
  state: GameState,
  designId: DesignId,
): PendingRewardType | null {
  const location = state.board.designs[designId];
  if (
    location?.kind !== 'BOARD' ||
    !location.area.startsWith('design-row:') ||
    location.slot !== 3
  ) {
    return null;
  }

  return state.content.designs[designId]?.oldestBonus ?? null;
}

function sourceDeckForRow(row: 0 | 1): DesignDeckId {
  return row === 0 ? 'row0' : 'row1';
}

export function planDesignReplenishment(state: GameState): readonly DesignMove[] {
  const moves: DesignMove[] = [];
  const central = getDesignDeck(state, 'central');
  let centralCursor = 0;

  for (const row of [0, 1] as const) {
    const survivors = getDesignRow(state, row);
    const firstOccupiedSlot = Math.max(0, 4 - survivors.length);

    survivors.forEach((designId, index) => {
      moves.push({
        designId,
        location: {
          kind: 'BOARD',
          area: `design-row:${row}`,
          slot: firstOccupiedSlot + index,
        },
      });
    });

    const sideDeck = getDesignDeck(state, sourceDeckForRow(row));
    let sideCursor = 0;
    for (let slot = 0; slot < firstOccupiedSlot; slot += 1) {
      const fromSide = sideDeck[sideCursor];
      const designId = fromSide ?? central[centralCursor];
      if (designId === undefined) break;
      if (fromSide !== undefined) sideCursor += 1;
      else centralCursor += 1;

      moves.push({
        designId,
        location: { kind: 'BOARD', area: `design-row:${row}`, slot },
      });
    }
  }

  return moves;
}

export function hasDesignCapacity(state: GameState, playerId: PlayerId): boolean {
  const player = state.players.find((candidate) => candidate.id === playerId);
  return player !== undefined && getPlayerDesigns(state, playerId).length < player.designCapacity;
}
