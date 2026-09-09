import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  createShellGame,
  type AssemblyNodeId,
  type CarId,
  type DemandId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type KanbanOrderDefinition,
  type KanbanOrderId,
  type ModelId,
  type PartId,
  type PartTypeId,
  type UpgradeSpaceId,
} from '@kanban/rules';

function partId(index: number): PartId {
  return `part:${index}` as PartId;
}

function carId(index: number): CarId {
  return `car:${index}` as CarId;
}

function designId(index: number): DesignId {
  return `design:${index}` as DesignId;
}

function orderId(index: number): KanbanOrderId {
  return `kanban-order:${index}` as KanbanOrderId;
}

function demandId(index: number): DemandId {
  return `demand:${index}` as DemandId;
}

function upgradeSpaceId(index: number): UpgradeSpaceId {
  return `upgrade-space:${index}` as UpgradeSpaceId;
}

function partType(index: number): PartTypeId {
  return PART_TYPE_IDS[index % PART_TYPE_IDS.length]!;
}

function assemblyNodeId(modelIndex: number, stage: 'start' | 'line' | 'exit'): AssemblyNodeId {
  return `assembly-node:m${modelIndex}:${stage}` as AssemblyNodeId;
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

const cars = Object.fromEntries(
  Array.from({ length: 20 }, (_, index) => {
    const id = carId(index);
    const modelIndex = Math.min(MODEL_IDS.length - 1, Math.floor(index / 4));
    return [id, { id, model: MODEL_IDS[modelIndex]! }];
  }),
) as GameContent['cars'];

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

const demands = Object.fromEntries(
  MODEL_IDS.map((model, index) => {
    const id = demandId(index);
    return [id, { id, model, redSeatCount: index % 2 === 0 ? 2 : 1 }];
  }),
) as GameContent['demands'];

const assemblyModels = Object.fromEntries(
  MODEL_IDS.map((model, index) => {
    const start = assemblyNodeId(index, 'start');
    const line = assemblyNodeId(index, 'line');
    const exit = assemblyNodeId(index, 'exit');
    return [
      model,
      {
        startNodeId: start,
        nodes: {
          [start]: { id: start, kind: 'START', next: [{ to: line }] },
          [line]: {
            id: line,
            kind: 'CONVEYOR',
            next: [{ to: exit, exitPP: index % 2 === 0 ? 1 : 2 }],
          },
          [exit]: { id: exit, kind: 'EXIT', next: [] },
        },
        assemblySlots: 2,
      },
    ];
  }),
) as GameContent['assemblyGraph']['models'];

const upgradeSpaces = Object.fromEntries(
  PART_TYPE_IDS.map((type, index) => {
    const id = upgradeSpaceId(index);
    return [
      id,
      {
        id,
        model: null,
        partType: type,
        benefit:
          index === 0
            ? { kind: 'BOOK', amount: 1 }
            : index === 1
              ? { kind: 'PP', amount: 1 }
              : { kind: 'NONE' },
      },
    ];
  }),
) as GameContent['upgradeSpaces'];

export const DEVELOPMENT_CONTENT: GameContent = {
  ...EMPTY_GAME_CONTENT,
  id: 'synthetic-development-content',
  authoritative: false,
  rules: { logisticsVoucherShiftCost: 0 },
  models: MODEL_IDS,
  partTypes: PART_TYPE_IDS,
  parts,
  cars,
  designs,
  kanbanOrders,
  demands,
  assemblyGraph: { models: assemblyModels },
  garageBenefits: [
    { kind: 'BOOK', amount: 1 },
    { kind: 'PP', amount: 1 },
    { kind: 'VOUCHER', amount: 1 },
    { kind: 'NONE' },
  ],
  upgradeSpaces,
  testingRules: {
    testTrackCapacity: 4,
    maxPartValue: 6,
    claimCostByPosition: [1, 2, 2, 3],
    meetingThresholds: [4, 8, 12],
  },
};

function developmentPartLocations(): Readonly<Partial<Record<PartId, EntityLocation>>> {
  const locations: Partial<Record<PartId, EntityLocation>> = {};
  for (let index = 0; index < 18; index += 1) {
    locations[partId(index)] = { kind: 'SUPPLY' };
  }

  PART_TYPE_IDS.forEach((type, index) => {
    locations[partId(index)] = { kind: 'BOARD', area: `warehouse:${type}`, slot: 0 };
  });

  [6, 7, 8].forEach((index, slot) => {
    locations[partId(index)] = { kind: 'BOARD', area: 'recycling', slot };
  });

  locations[partId(9)] = { kind: 'BOARD', area: 'assembly:model:0', slot: 0 };
  locations[partId(10)] = { kind: 'BOARD', area: 'assembly:model:1', slot: 0 };
  locations[partId(13)] = { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 };
  locations[partId(14)] = { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 };

  return locations;
}

function developmentCarLocations(): Readonly<Partial<Record<CarId, EntityLocation>>> {
  const locations: Partial<Record<CarId, EntityLocation>> = {};
  for (let index = 0; index < 20; index += 1) {
    locations[carId(index)] = { kind: 'SUPPLY' };
  }

  [0, 4, 8, 12].forEach((index, slot) => {
    locations[carId(index)] = { kind: 'BOARD', area: 'test-track', slot };
  });

  locations[carId(1)] = {
    kind: 'BOARD',
    area: `assembly-node:${assemblyNodeId(0, 'start')}`,
    slot: 0,
  };
  locations[carId(2)] = {
    kind: 'BOARD',
    area: `assembly-node:${assemblyNodeId(0, 'line')}`,
    slot: 0,
  };
  locations[carId(5)] = {
    kind: 'BOARD',
    area: `assembly-node:${assemblyNodeId(1, 'start')}`,
    slot: 0,
  };
  locations[carId(16)] = {
    kind: 'PLAYER',
    playerId: 'player:0',
    area: 'garage',
    slot: 0,
  };

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
  locations[designId(13)] = {
    kind: 'PLAYER',
    playerId: 'player:0',
    area: 'blueprints',
    slot: 0,
  };

  return locations;
}

function syntheticPartValues(): GameState['board']['partValues'] {
  const values = [1, 2, 1, 3, 2, 1] as const;
  return Object.fromEntries(
    PART_TYPE_IDS.map((type, index) => [type, values[index] ?? 0]),
  ) as GameState['board']['partValues'];
}

export function createDevelopmentGame(): GameState {
  const shell = createShellGame({ seed: 'development', playerCount: 4 });

  return {
    ...shell,
    content: DEVELOPMENT_CONTENT,
    board: {
      ...shell.board,
      cars: developmentCarLocations(),
      parts: developmentPartLocations(),
      designs: developmentDesignLocations(),
      partValues: syntheticPartValues(),
      activeDemands: [
        { demandId: demandId(0), redSeatsRemaining: 2 },
        { demandId: demandId(1), redSeatsRemaining: 1 },
        { demandId: demandId(2), redSeatsRemaining: 2 },
      ],
      demandDeck: [demandId(3), demandId(4)],
      demandDiscard: [],
      paceCarPosition: 1,
      nextMeetingThreshold: 4,
    },
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? { ...player, kanbanOrders: [orderId(0), orderId(1)] }
        : player,
    ),
    kanbanOrderDeck: [orderId(2), orderId(3)],
  };
}
