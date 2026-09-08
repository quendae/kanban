import type { KanbanOrderOrientation, PartTypeId } from './content.js';
import { getPlayerParts, getSupplyParts, getWarehouseParts } from './inventory.js';
import type { EntityLocation, GameState } from './model.js';
import type { KanbanOrderId, PartId, PlayerId } from './ids.js';

export interface WarehousePartMove {
  readonly partId: PartId;
  readonly partType: PartTypeId;
  readonly destinationSlot: number;
}

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

function occupiedWarehouseSlots(state: GameState, partType: PartTypeId): Set<number> {
  return new Set(
    Object.values(state.board.parts)
      .filter(
        (location): location is Extract<EntityLocation, { readonly kind: 'BOARD' }> =>
          location?.kind === 'BOARD' && location.area === `warehouse:${partType}`,
      )
      .map((location) => location.slot),
  );
}

function firstOpenSlot(used: Set<number>): number {
  let slot = 0;
  while (used.has(slot)) slot += 1;
  return slot;
}

export function planKanbanOrderRefill(
  state: GameState,
  orderId: KanbanOrderId,
  orientation: KanbanOrderOrientation,
): readonly WarehousePartMove[] {
  const order = state.content.kanbanOrders[orderId];
  if (!order) return [];

  const usedPartIds = new Set<PartId>();
  const reservedSlots = new Map<PartTypeId, Set<number>>();
  const moves: WarehousePartMove[] = [];

  for (const partType of order.refillByOrientation[orientation]) {
    const partId = getSupplyParts(state, partType).find((candidate) => !usedPartIds.has(candidate));
    if (!partId) continue;

    let slots = reservedSlots.get(partType);
    if (!slots) {
      slots = occupiedWarehouseSlots(state, partType);
      reservedSlots.set(partType, slots);
    }
    const destinationSlot = firstOpenSlot(slots);
    slots.add(destinationSlot);
    usedPartIds.add(partId);
    moves.push({ partId, partType, destinationSlot });
  }

  return moves;
}
