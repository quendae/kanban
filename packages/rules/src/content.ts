import type {
  AssemblyNodeId,
  AwardPlaqueId,
  CarId,
  DemandId,
  DesignId,
  FactoryGoalId,
  KanbanOrderId,
  PartId,
  UpgradeSpaceId,
} from './ids.js';

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

export interface CarDefinition {
  readonly id: CarId;
  readonly model: ModelId;
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

export interface DemandDefinition {
  readonly id: DemandId;
  readonly model: ModelId;
  readonly redSeatCount: number;
}

export interface AssemblyEdgeDefinition {
  readonly to: AssemblyNodeId;
  readonly exitPP?: 1 | 2;
}

export interface AssemblyNodeDefinition {
  readonly id: AssemblyNodeId;
  readonly kind: 'START' | 'CONVEYOR' | 'EXIT';
  readonly next: readonly AssemblyEdgeDefinition[];
}

export interface AssemblyModelGraphDefinition {
  readonly startNodeId: AssemblyNodeId;
  readonly nodes: Readonly<Partial<Record<AssemblyNodeId, AssemblyNodeDefinition>>>;
  readonly assemblySlots: number;
}

export interface AssemblyGraphDefinition {
  readonly models: Readonly<Partial<Record<ModelId, AssemblyModelGraphDefinition>>>;
}

export type GarageBenefit =
  | { readonly kind: 'NONE' }
  | {
      readonly kind: 'BANKED_SHIFT' | 'BOOK' | 'VOUCHER' | 'RED_SEAT' | 'PP';
      readonly amount: number;
    };

export interface UpgradeSpaceDefinition {
  readonly id: UpgradeSpaceId;
  readonly model: ModelId | null;
  readonly partType: PartTypeId | null;
  readonly benefit: GarageBenefit;
}

export interface TestingRulesConfig {
  readonly testTrackCapacity: number;
  readonly maxPartValue: number;
  readonly claimCostByPosition: readonly [1 | 2 | 3, 1 | 2 | 3, 1 | 2 | 3, 1 | 2 | 3];
  readonly meetingThresholds: readonly number[];
}

export interface TrainingRulesConfig {
  readonly certificationLevel: number;
  readonly expertLevel: number;
}

export type AwardPlaqueReward =
  | { readonly kind: 'BANKED_SHIFT'; readonly amount: 1 }
  | { readonly kind: 'PP'; readonly amount: 2 }
  | { readonly kind: 'BOOK'; readonly amount: 1 }
  | { readonly kind: 'VOUCHER'; readonly amount: 1 };

export interface AwardPlaqueDefinition {
  readonly id: AwardPlaqueId;
  readonly reward: AwardPlaqueReward;
}

export type FactoryGoalCategory = 'CERTIFICATIONS' | 'CARS' | 'UPGRADED_DESIGNS';

export interface FactoryGoalDefinition {
  readonly id: FactoryGoalId;
  readonly category: FactoryGoalCategory;
  readonly threshold: number;
  readonly initialSeatsByPlayerCount: Readonly<Record<2 | 3 | 4, number>>;
}

export interface GameRulesConfig {
  readonly logisticsVoucherShiftCost: 0 | 1;
}

export const DEFAULT_GAME_RULES: GameRulesConfig = {
  logisticsVoucherShiftCost: 0,
};

export const DEFAULT_TESTING_RULES: TestingRulesConfig = {
  testTrackCapacity: 4,
  maxPartValue: 6,
  claimCostByPosition: [1, 2, 2, 3],
  meetingThresholds: [4, 8, 12],
};

export const DEFAULT_TRAINING_RULES: TrainingRulesConfig = {
  certificationLevel: 4,
  expertLevel: 5,
};

export interface GameContent {
  readonly id: string;
  readonly authoritative: boolean;
  readonly rules?: GameRulesConfig;
  readonly models: readonly ModelId[];
  readonly partTypes: readonly PartTypeId[];
  readonly parts: Readonly<Partial<Record<PartId, PartDefinition>>>;
  readonly cars: Readonly<Partial<Record<CarId, CarDefinition>>>;
  readonly designs: Readonly<Partial<Record<DesignId, DesignDefinition>>>;
  readonly kanbanOrders: Readonly<Partial<Record<KanbanOrderId, KanbanOrderDefinition>>>;
  readonly demands: Readonly<Partial<Record<DemandId, DemandDefinition>>>;
  readonly assemblyGraph: AssemblyGraphDefinition;
  readonly garageBenefits?: readonly GarageBenefit[];
  readonly upgradeSpaces: Readonly<Partial<Record<UpgradeSpaceId, UpgradeSpaceDefinition>>>;
  readonly testingRules: TestingRulesConfig;
  readonly trainingRules: TrainingRulesConfig;
  readonly awardPlaques: Readonly<Partial<Record<AwardPlaqueId, AwardPlaqueDefinition>>>;
  readonly factoryGoals: Readonly<Partial<Record<FactoryGoalId, FactoryGoalDefinition>>>;
}

export function getGameRules(content: GameContent): GameRulesConfig {
  return content.rules ?? DEFAULT_GAME_RULES;
}

export const EMPTY_GAME_CONTENT: GameContent = {
  id: 'empty-development-content',
  authoritative: false,
  rules: DEFAULT_GAME_RULES,
  models: MODEL_IDS,
  partTypes: PART_TYPE_IDS,
  parts: {},
  cars: {},
  designs: {},
  kanbanOrders: {},
  demands: {},
  assemblyGraph: { models: {} },
  garageBenefits: [],
  upgradeSpaces: {},
  testingRules: DEFAULT_TESTING_RULES,
  trainingRules: DEFAULT_TRAINING_RULES,
  awardPlaques: {},
  factoryGoals: {},
};
