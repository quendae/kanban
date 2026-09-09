import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  createShellGame,
  getDesignDeck,
  getDesignRow,
  getInvariantViolations,
  getPlayerDesigns,
  getPlayerParts,
  getRecyclingParts,
  getWarehouseParts,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type PartId,
} from '../src/index.js';

const content: GameContent = {
  ...EMPTY_GAME_CONTENT,
  id: 'test-content',
  authoritative: false,
  models: MODEL_IDS,
  partTypes: PART_TYPE_IDS,
  parts: {
    'part:0': { id: 'part:0', type: 'part-type:0' },
    'part:1': { id: 'part:1', type: 'part-type:0' },
    'part:2': { id: 'part:2', type: 'part-type:1' },
  },
  designs: {
    'design:0': { id: 'design:0', model: 'model:0', partType: null, oldestBonus: null },
    'design:1': { id: 'design:1', model: 'model:1', partType: 'part-type:0', oldestBonus: 'BOOK' },
    'design:2': { id: 'design:2', model: 'model:2', partType: null, oldestBonus: null },
  },
  kanbanOrders: {},
};

describe('M2 content and inventory state', () => {
  it('defines five opaque model IDs and six opaque part-type IDs without inventing component names', () => {
    expect(MODEL_IDS).toHaveLength(5);
    expect(new Set(MODEL_IDS).size).toBe(5);
    expect(PART_TYPE_IDS).toHaveLength(6);
    expect(new Set(PART_TYPE_IDS).size).toBe(6);
  });

  it('creates players with Original 2014 base capacities and daily Logistics flags', () => {
    const state = createShellGame({ seed: 'm2-capacities', playerCount: 2 });

    expect(state.content.authoritative).toBe(false);
    expect(state.players[0]).toMatchObject({
      partCapacity: 5,
      designCapacity: 4,
      certifications: [],
      kanbanOrderIssuedToday: false,
      logisticsVoucherTakenToday: false,
    });
  });

  it('queries Design rows/decks and part inventories from canonical entity locations', () => {
    const state = createShellGame({ seed: 'm2-locations', playerCount: 2 });
    const withContent = {
      ...state,
      content,
      board: {
        ...state.board,
        designs: {
          'design:0': { kind: 'BOARD', area: 'design-row:0', slot: 3 },
          'design:1': { kind: 'BOARD', area: 'design-deck:row0', slot: 0 },
          'design:2': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
        } as const,
        parts: {
          'part:0': { kind: 'BOARD', area: 'warehouse:part-type:0', slot: 1 },
          'part:1': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
          'part:2': { kind: 'BOARD', area: 'recycling', slot: 0 },
        } as const,
      },
    };

    expect(getDesignRow(withContent, 0)).toEqual(['design:0' as DesignId]);
    expect(getDesignDeck(withContent, 'row0')).toEqual(['design:1' as DesignId]);
    expect(getPlayerDesigns(withContent, 'player:0')).toEqual(['design:2' as DesignId]);
    expect(getWarehouseParts(withContent, 'part-type:0')).toEqual(['part:0' as PartId]);
    expect(getPlayerParts(withContent, 'player:0')).toEqual(['part:1' as PartId]);
    expect(getRecyclingParts(withContent)).toEqual(['part:2' as PartId]);
  });

  it('rejects inventory counts above the player capacities', () => {
    const state = createShellGame({ seed: 'm2-overflow', playerCount: 2 });
    const parts = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `part:${index}` as PartId,
        { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: index } satisfies EntityLocation,
      ]),
    ) as Partial<Record<PartId, EntityLocation>>;
    const designs = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [
        `design:${index}` as DesignId,
        { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: index } satisfies EntityLocation,
      ]),
    ) as Partial<Record<DesignId, EntityLocation>>;
    const broken = {
      ...state,
      board: { ...state.board, parts, designs },
    };

    const codes = getInvariantViolations(broken).map((violation) => violation.code);
    expect(codes).toContain('PART_CAPACITY_EXCEEDED');
    expect(codes).toContain('DESIGN_CAPACITY_EXCEEDED');
  });
});
