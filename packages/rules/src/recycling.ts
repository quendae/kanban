import type { PartId, PlayerId } from './ids.js';
import { getRecyclingParts } from './inventory.js';
import type { GameState } from './model.js';

export type RecyclingSwapFailure =
  | 'OUTGOING_NOT_OWNED'
  | 'INCOMING_NOT_AVAILABLE'
  | 'TYPE_OCCUPIED'
  | 'PART_DEFINITION_MISSING'
  | 'POOL_INVALID';

export type RecyclingSwapPlan =
  | {
      readonly ok: true;
      readonly playerSlot: number;
      readonly recyclingSlot: number;
    }
  | {
      readonly ok: false;
      readonly reason: RecyclingSwapFailure;
    };

export function getRecyclingSwapPlan(
  state: GameState,
  playerId: PlayerId,
  outgoingPartId: PartId,
  incomingPartId: PartId,
): RecyclingSwapPlan {
  const outgoing = state.board.parts[outgoingPartId];
  if (
    outgoing?.kind !== 'PLAYER' ||
    outgoing.playerId !== playerId ||
    outgoing.area !== 'parts'
  ) {
    return { ok: false, reason: 'OUTGOING_NOT_OWNED' };
  }

  const incoming = state.board.parts[incomingPartId];
  if (incoming?.kind !== 'BOARD' || incoming.area !== 'recycling') {
    return { ok: false, reason: 'INCOMING_NOT_AVAILABLE' };
  }

  const recyclingParts = getRecyclingParts(state);
  if (recyclingParts.length > 3) return { ok: false, reason: 'POOL_INVALID' };

  const outgoingDefinition = state.content.parts[outgoingPartId];
  const incomingDefinition = state.content.parts[incomingPartId];
  if (!outgoingDefinition || !incomingDefinition) {
    return { ok: false, reason: 'PART_DEFINITION_MISSING' };
  }

  const remainingTypes = recyclingParts
    .filter((partId) => partId !== incomingPartId)
    .map((partId) => state.content.parts[partId]?.type)
    .filter((partType) => partType !== undefined);

  if (remainingTypes.includes(outgoingDefinition.type)) {
    return { ok: false, reason: 'TYPE_OCCUPIED' };
  }

  return {
    ok: true,
    playerSlot: outgoing.slot,
    recyclingSlot: incoming.slot,
  };
}
