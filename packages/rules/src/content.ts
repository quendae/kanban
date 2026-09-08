import type { DesignId, KanbanOrderId, PartId } from './ids.js';

export type ModelId = `model:${number}`;
export type PartTypeId = `part-type:${number}`;
export type KanbanOrderOrientation = 'LEFT_FOUR' | 'RIGHT_FOUR';

export const MODEL_IDS = [
  'model:0',
  'model:1',
  'model:2',
  'model:3',
  'model:4',
] as const satisfies readonly ModelId[];

export const PART_TYPE_IDS = [
  'part-type:0',
  'part-type:1',
  'part-type:2',
  'part-type:3',
  'part-type:4',
  'part-type:5',
] as const satisfies readonly PartTypeId[];

export interface PartDefinition {
  readonly id: PartId;
  readonly type: PartTypeId;
}

export type DesignOldestBonus = 'BANKED_SHIFT' | 'BOOK' | null;

export interface DesignDefinition {
  readonly id: DesignId;
  readonly model: ModelId;
  readonly partType: PartTypeId | null;
  readonly oldestBonus: DesignOldestBonus;
}

export interface KanbanOrderDefinition {
  readonly id: KanbanOrderId;
  readonly symbols: readonly [
    PartTypeId,
    PartTypeId,
    PartTypeId,
    PartTypeId,
    PartTypeId,
    PartTypeId,
  ];
  readonly refillByOrientation: Readonly<
    Record<
      KanbanOrderOrientation,
      readonly [PartTypeId, PartTypeId, PartTypeId, PartTypeId]
    >
  >;
}

export interface GameContent {
  readonly id: string;
  readonly authoritative: boolean;
  readonly models: readonly ModelId[];
  readonly partTypes: readonly PartTypeId[];
  readonly parts: Readonly<Partial<Record<PartId, PartDefinition>>>;
  readonly designs: Readonly<Partial<Record<DesignId, DesignDefinition>>>;
  readonly kanbanOrders: Readonly<Partial<Record<KanbanOrderId, KanbanOrderDefinition>>>;
}

export const EMPTY_GAME_CONTENT: GameContent = {
  id: 'empty-development-content',
  authoritative: false,
  models: MODEL_IDS,
  partTypes: PART_TYPE_IDS,
  parts: {},
  designs: {},
  kanbanOrders: {},
};
