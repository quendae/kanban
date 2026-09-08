import type { PartTypeId } from './content.js';
import { getPlayerParts, getWarehouseParts } from './inventory.js';
import type { EntityLocation, GameState } from './model.js';
import type { PartId, PlayerId } from './ids.js';

export function getOpenPartSlots(
  state: GameState,
  playerId: PlayerId,
  quantity: number,
): readonly number[] | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || !Number.isInteger(quantity) || quantity < 1) return null;

  const used = new Set(
    Object.values(state.board.parts)
      .filter(
        (location): location is Extract<EntityLocation, { readonly kind: 'PLAYER' }> =>
          location?.kind === 'PLAYER' &&
          location.playerId === playerId &&
          location.area === 'parts',
      )
      .map((location) => location.slot),
  );
  const free: number[] = [];
  for (let slot = 0; slot < player.partCapacity && free.length < quantity; slot += 1) {
    if (!used.has(slot)) free.push(slot);
  }
  return free.length === quantity ? free : null;
}

export function getPartCollection(
  state: GameState,
  playerId: PlayerId,
  partType: PartTypeId,
  quantity: number,
): { readonly partIds: readonly PartId[]; readonly destinationSlots: readonly number[] } | null {
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  const available = getWarehouseParts(state, partType);
  if (available.length < quantity) return null;
  const destinationSlots = getOpenPartSlots(state, playerId, quantity);
  if (destinationSlots === null) return null;
  return { partIds: available.slice(0, quantity), destinationSlots };
}

export function getMaximumCollectableQuantity(
  state: GameState,
  playerId: PlayerId,
  partType: PartTypeId,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;
  const storageLeft = Math.max(0, player.partCapacity - getPlayerParts(state, playerId).length);
  return Math.min(storageLeft, getWarehouseParts(state, partType).length);
}
