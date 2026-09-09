import {
  MODEL_IDS,
  PART_TYPE_IDS,
  createShellGame,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type KanbanOrderDefinition,
  type KanbanOrderId,
  type PartId,
  type PartTypeId,
} from '@kanban/rules';

function partId(index: number): PartId {
  return `part:${index}` as PartId;
}

function designId(index: number): DesignId {
  return `design:${index}` as DesignId;
}

function orderId(index: number): KanbanOrderId {
  return `kanban-order:${index}` as KanbanOrderId;
}

function partType(index: number): PartTypeId {
  return PART_TYPE_IDS[index % PART_TYPE_IDS.length]!;
}

function makeOrder(
  index: number,
  symbols: readonly [PartTypeId, PartTypeId, PartTypeId, PartTypeId, PartTypeId, PartTypeId],
): KanbanOrderDefinition {
  return {
    id: orderId(index),
    symbols,
    refillByOrientation: {
      LEFT_FOUR: [symbols[0], symbols[1], symbols[2], symbols[3]],
      RIGHT_FOUR: [symbols[2], symbols[3], symbols[4], symbols[5]],
    },
  };
}

const parts = Object.fromEntries(
  Array.from({ length: 18 }, (_, index) => {
    const id = partId(index);
    return [id, { id, type: partType(index) }];
  }),
) as GameContent['parts'];

const designs = Object.fromEntries(
  Array.from({ length: 14 }, (_, index) => {
    const id = designId(index);
    return [
      id,
      {
        id,
        model: MODEL_IDS[index % MODEL_IDS.length]!,
        partType: index % 3 === 2 ? null : partType(index),
        oldestBonus: index === 3 ? 'BANKED_SHIFT' : index === 7 ? 'BOOK' : null,
      },
    ];
  }),
) as GameContent['designs'];

const kanbanOrders: GameContent['kanbanOrders'] = {
  [orderId(0)]: makeOrder(0, [
    PART_TYPE_IDS[0],
    PART_TYPE_IDS[1],
    PART_TYPE_IDS[2],
    PART_TYPE_IDS[0],
    PART_TYPE_IDS[3],
    PART_TYPE_IDS[4],
  ]),
  [orderId(1)]: makeOrder(1, [
    PART_TYPE_IDS[1],
    PART_TYPE_IDS[2],
    PART_TYPE_IDS[3],
    PART_TYPE_IDS[4],
    PART_TYPE_IDS[5],
    PART_TYPE_IDS[0],
  ]),
  [orderId(2)]: makeOrder(2, [
    PART_TYPE_IDS[5],
    PART_TYPE_IDS[4],
    PART_TYPE_IDS[3],
    PART_TYPE_IDS[2],
    PART_TYPE_IDS[1],
    PART_TYPE_IDS[0],
  ]),
  [orderId(3)]: makeOrder(3, [
    PART_TYPE_IDS[2],
    PART_TYPE_IDS[4],
    PART_TYPE_IDS[0],
    PART_TYPE_IDS[5],
    PART_TYPE_IDS[1],
    PART_TYPE_IDS[3],
  ]),
};

export const DEVELOPMENT_CONTENT: GameContent = {
  id: 'synthetic-development-content',
  authoritative: false,
  rules: { logisticsVoucherShiftCost: 0 },
  models: MODEL_IDS,
  partTypes: PART_TYPE_IDS,
  parts,
  designs,
  kanbanOrders,
};

function developmentPartLocations(): Readonly<Partial<Record<PartId, EntityLocation>>> {
  const locations: Partial<Record<PartId, EntityLocation>> = {};

  PART_TYPE_IDS.forEach((type, index) => {
    locations[partId(index)] = { kind: 'BOARD', area: `warehouse:${type}`, slot: 0 };
  });

  [6, 7, 8].forEach((index, slot) => {
    locations[partId(index)] = { kind: 'BOARD', area: 'recycling', slot };
  });

  for (let index = 9; index < 18; index += 1) {
    locations[partId(index)] = { kind: 'SUPPLY' };
  }

  return locations;
}

function developmentDesignLocations(): Readonly<Partial<Record<DesignId, EntityLocation>>> {
  const locations: Partial<Record<DesignId, EntityLocation>> = {};

  for (let slot = 0; slot < 4; slot += 1) {
    locations[designId(slot)] = { kind: 'BOARD', area: 'design-row:0', slot };
    locations[designId(4 + slot)] = { kind: 'BOARD', area: 'design-row:1', slot };
  }

  locations[designId(8)] = { kind: 'BOARD', area: 'design-deck:row0', slot: 0 };
  locations[designId(9)] = { kind: 'BOARD', area: 'design-deck:row0', slot: 1 };
  locations[designId(10)] = { kind: 'BOARD', area: 'design-deck:row1', slot: 0 };
  locations[designId(11)] = { kind: 'BOARD', area: 'design-deck:row1', slot: 1 };
  locations[designId(12)] = { kind: 'BOARD', area: 'design-deck:central', slot: 0 };
  locations[designId(13)] = { kind: 'BOARD', area: 'design-deck:central', slot: 1 };

  return locations;
}

export function createDevelopmentGame(): GameState {
  const shell = createShellGame({ seed: 'development', playerCount: 4 });

  return {
    ...shell,
    content: DEVELOPMENT_CONTENT,
    board: {
      ...shell.board,
      parts: developmentPartLocations(),
      designs: developmentDesignLocations(),
    },
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? { ...player, kanbanOrders: [orderId(0), orderId(1)] }
        : player,
    ),
    kanbanOrderDeck: [orderId(2), orderId(3)],
  };
}
