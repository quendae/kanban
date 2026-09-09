import type { ModelId, PartTypeId } from './content.js';
import type { AssemblyNodeId, CarId, PartId, PlayerId } from './ids.js';
import {
  getAssemblyParts,
  getPlayerParts,
  getTestTrackCars,
  getUpgradeParts,
} from './inventory.js';
import type { EntityLocation, GameState } from './model.js';

function getPartType(state: GameState, partId: PartId): PartTypeId | null {
  return state.content.parts[partId]?.type ?? null;
}

function getPresentPartTypes(state: GameState, model: ModelId): Set<PartTypeId> {
  return new Set(
    getAssemblyParts(state, model)
      .map((partId) => getPartType(state, partId))
      .filter((partType): partType is PartTypeId => partType !== null),
  );
}

function getUpgradedPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const upgraded = new Set(
    getUpgradeParts(state, model)
      .map((partId) => getPartType(state, partId))
      .filter((partType): partType is PartTypeId => partType !== null),
  );
  return state.content.partTypes.filter((partType) => upgraded.has(partType));
}

export function getMissingUpgradedPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const present = getPresentPartTypes(state, model);
  return getUpgradedPartTypes(state, model).filter((partType) => !present.has(partType));
}

export function getNeededPartTypes(state: GameState, model: ModelId): PartTypeId[] {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph || graph.assemblySlots <= 0) return [];

  const assemblyParts = getAssemblyParts(state, model);
  if (assemblyParts.length >= graph.assemblySlots) return [];

  const present = getPresentPartTypes(state, model);
  const missingUpgraded = getMissingUpgradedPartTypes(state, model);
  if (missingUpgraded.length > 0) return missingUpgraded;

  return state.content.partTypes.filter((partType) => !present.has(partType));
}

export function getAssemblyDestinationSlot(state: GameState, model: ModelId): number | null {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph) return null;

  const usedSlots = new Set<number>();
  for (const location of Object.values(state.board.parts)) {
    if (location?.kind === 'BOARD' && location.area === `assembly:${model}`) {
      usedSlots.add(location.slot);
    }
  }

  for (let slot = 0; slot < graph.assemblySlots; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }
  return null;
}

export function getAssemblyTurnStartCleanupPartIds(
  state: GameState,
  playerId: PlayerId,
): PartId[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (
    state.phase !== 'WORK' ||
    state.activeActorId !== playerId ||
    player?.currentDepartment !== 'ASSEMBLY' ||
    player.shiftsSpentToday !== 0
  ) {
    return [];
  }

  const partIds: PartId[] = [];
  for (const model of state.content.models) {
    const graph = state.content.assemblyGraph.models[model];
    if (!graph || graph.assemblySlots <= 0) continue;
    const modelParts = getAssemblyParts(state, model);
    if (modelParts.length >= graph.assemblySlots) partIds.push(...modelParts);
  }
  return partIds;
}

export function previewAssemblyTurnStartCleanup(
  state: GameState,
  playerId: PlayerId,
): GameState {
  const partIds = getAssemblyTurnStartCleanupPartIds(state, playerId);
  if (partIds.length === 0) return state;

  const parts = { ...state.board.parts };
  for (const partId of partIds) parts[partId] = { kind: 'SUPPLY' };
  return { ...state, board: { ...state.board, parts } };
}

export function hasAssemblyCarAvailable(state: GameState, model: ModelId): boolean {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph) return false;
  const startArea = `assembly-node:${graph.startNodeId}`;

  for (const [rawCarId, location] of Object.entries(state.board.cars)) {
    const carId = rawCarId as CarId;
    const definition = state.content.cars[carId];
    if (definition?.model !== model || location === undefined) continue;
    if (location.kind === 'SUPPLY') return true;
    if (location.kind === 'BOARD' && location.area === startArea) return true;
  }
  return false;
}

export function isPlayerAssemblyPart(
  state: GameState,
  playerId: PlayerId,
  partId: PartId,
): boolean {
  return getPlayerParts(state, playerId).includes(partId);
}

export type CarMoveReason =
  | 'CHAIN_PUSH'
  | 'EXIT_TO_TEST_TRACK'
  | 'TEST_TRACK_OVERFLOW'
  | 'TEST_TRACK_COMPACT'
  | 'SUPPLY_REFILL';

export interface CarMove {
  readonly carId: CarId;
  readonly from: EntityLocation;
  readonly to: EntityLocation;
  readonly reason: CarMoveReason;
  readonly exitPP?: 1 | 2;
}

export type AssemblyPushFailureReason =
  | 'GRAPH_MISSING'
  | 'START_NODE_MISSING'
  | 'NODE_MISSING'
  | 'DEAD_END'
  | 'CYCLE_DETECTED'
  | 'CAR_NOT_AVAILABLE'
  | 'PATH_CHOICE_REQUIRED'
  | 'INVALID_PATH_CHOICE';

export type AssemblyPushPlan =
  | {
      readonly ok: true;
      readonly moves: readonly CarMove[];
      readonly ppAwarded: number;
    }
  | {
      readonly ok: false;
      readonly reason: AssemblyPushFailureReason;
      readonly choices?: readonly AssemblyNodeId[];
    };

function nodeArea(nodeId: AssemblyNodeId): string {
  return `assembly-node:${nodeId}`;
}

function getCarAtNode(state: GameState, nodeId: AssemblyNodeId): CarId | null {
  const area = nodeArea(nodeId);
  const matches = (Object.entries(state.board.cars) as [CarId, EntityLocation | undefined][])
    .filter(
      (entry): entry is [CarId, EntityLocation] =>
        entry[1] !== undefined && entry[1].kind === 'BOARD' && entry[1].area === area,
    )
    .map(([carId]) => carId)
    .sort((a, b) => a.localeCompare(b));
  return matches[0] ?? null;
}

function getSupplyCar(state: GameState, model: ModelId): CarId | null {
  const candidates = (Object.entries(state.board.cars) as [CarId, EntityLocation | undefined][])
    .filter(
      (entry): entry is [CarId, EntityLocation] =>
        entry[1]?.kind === 'SUPPLY' && state.content.cars[entry[0]]?.model === model,
    )
    .map(([carId]) => carId)
    .sort((a, b) => a.localeCompare(b));
  return candidates[0] ?? null;
}

function withExitPP(move: Omit<CarMove, 'exitPP'>, exitPP: 1 | 2 | undefined): CarMove {
  return exitPP === undefined ? move : { ...move, exitPP };
}

function testTrackExitMoves(
  state: GameState,
  carId: CarId,
  from: EntityLocation,
  exitPP: 1 | 2 | undefined,
): readonly CarMove[] {
  const capacity = state.content.testingRules.testTrackCapacity;
  const existing = getTestTrackCars(state);
  if (capacity <= 0) {
    return [
      withExitPP(
        { carId, from, to: { kind: 'SUPPLY' }, reason: 'TEST_TRACK_OVERFLOW' },
        exitPP,
      ),
    ];
  }

  if (existing.length < capacity) {
    return [
      withExitPP(
        {
          carId,
          from,
          to: { kind: 'BOARD', area: 'test-track', slot: existing.length },
          reason: 'EXIT_TO_TEST_TRACK',
        },
        exitPP,
      ),
    ];
  }

  const moves: CarMove[] = [];
  const oldest = existing[0];
  if (oldest !== undefined) {
    const oldestLocation = state.board.cars[oldest];
    if (oldestLocation !== undefined) {
      moves.push({
        carId: oldest,
        from: oldestLocation,
        to: { kind: 'SUPPLY' },
        reason: 'TEST_TRACK_OVERFLOW',
      });
    }
  }

  existing.slice(1, capacity).forEach((trackCarId, index) => {
    const location = state.board.cars[trackCarId];
    if (location === undefined) return;
    moves.push({
      carId: trackCarId,
      from: location,
      to: { kind: 'BOARD', area: 'test-track', slot: index },
      reason: 'TEST_TRACK_COMPACT',
    });
  });

  moves.push(
    withExitPP(
      {
        carId,
        from,
        to: { kind: 'BOARD', area: 'test-track', slot: capacity - 1 },
        reason: 'EXIT_TO_TEST_TRACK',
      },
      exitPP,
    ),
  );
  return moves;
}

export function planAssemblyPush(
  state: GameState,
  model: ModelId,
  pathChoices: readonly AssemblyNodeId[],
): AssemblyPushPlan {
  const graph = state.content.assemblyGraph.models[model];
  if (!graph) return { ok: false, reason: 'GRAPH_MISSING' };
  const modelGraph = graph;
  if (!modelGraph.nodes[modelGraph.startNodeId]) {
    return { ok: false, reason: 'START_NODE_MISSING' };
  }

  const moves: CarMove[] = [];
  let ppAwarded = 0;
  let choiceIndex = 0;
  const visiting = new Set<AssemblyNodeId>();

  function moveCarFromNode(carId: CarId, nodeId: AssemblyNodeId): AssemblyPushPlan | null {
    if (visiting.has(nodeId)) return { ok: false, reason: 'CYCLE_DETECTED' };
    const node = modelGraph.nodes[nodeId];
    if (!node) return { ok: false, reason: 'NODE_MISSING' };
    const from = state.board.cars[carId];
    if (!from) return { ok: false, reason: 'CAR_NOT_AVAILABLE' };
    if (node.next.length === 0) return { ok: false, reason: 'DEAD_END' };

    let edge = node.next[0];
    if (node.next.length > 1) {
      const requested = pathChoices[choiceIndex];
      if (requested === undefined) {
        return {
          ok: false,
          reason: 'PATH_CHOICE_REQUIRED',
          choices: node.next.map((candidate) => candidate.to),
        };
      }
      edge = node.next.find((candidate) => candidate.to === requested);
      if (!edge) return { ok: false, reason: 'INVALID_PATH_CHOICE' };
      choiceIndex += 1;
    }
    if (!edge) return { ok: false, reason: 'DEAD_END' };

    const target = modelGraph.nodes[edge.to];
    if (!target) return { ok: false, reason: 'NODE_MISSING' };
    if (target.kind === 'EXIT') {
      moves.push(...testTrackExitMoves(state, carId, from, edge.exitPP));
      ppAwarded += edge.exitPP ?? 0;
      return null;
    }

    visiting.add(nodeId);
    const displaced = getCarAtNode(state, edge.to);
    if (displaced !== null) {
      const failure = moveCarFromNode(displaced, edge.to);
      if (failure !== null) return failure;
    }
    visiting.delete(nodeId);

    moves.push({
      carId,
      from,
      to: { kind: 'BOARD', area: nodeArea(edge.to), slot: 0 },
      reason: 'CHAIN_PUSH',
    });
    return null;
  }

  const startCar = getCarAtNode(state, modelGraph.startNodeId);
  if (startCar === null) {
    const supplyCar = getSupplyCar(state, model);
    if (supplyCar === null) return { ok: false, reason: 'CAR_NOT_AVAILABLE' };
    const from = state.board.cars[supplyCar];
    if (!from) return { ok: false, reason: 'CAR_NOT_AVAILABLE' };
    if (pathChoices.length > 0) return { ok: false, reason: 'INVALID_PATH_CHOICE' };
    return {
      ok: true,
      moves: [
        {
          carId: supplyCar,
          from,
          to: { kind: 'BOARD', area: nodeArea(modelGraph.startNodeId), slot: 0 },
          reason: 'SUPPLY_REFILL',
        },
      ],
      ppAwarded: 0,
    };
  }

  const failure = moveCarFromNode(startCar, modelGraph.startNodeId);
  if (failure !== null) return failure;
  if (choiceIndex !== pathChoices.length) return { ok: false, reason: 'INVALID_PATH_CHOICE' };

  const supplyCar = getSupplyCar(state, model);
  if (supplyCar !== null) {
    const from = state.board.cars[supplyCar];
    if (from !== undefined) {
      moves.push({
        carId: supplyCar,
        from,
        to: { kind: 'BOARD', area: nodeArea(modelGraph.startNodeId), slot: 0 },
        reason: 'SUPPLY_REFILL',
      });
    }
  }

  return { ok: true, moves, ppAwarded };
}

export function getAssemblyPathChoiceSequences(
  state: GameState,
  model: ModelId,
): readonly (readonly AssemblyNodeId[])[] {
  const queue: AssemblyNodeId[][] = [[]];
  const resolved: AssemblyNodeId[][] = [];
  const maxCandidates = 128;

  while (queue.length > 0 && resolved.length + queue.length <= maxCandidates) {
    const choices = queue.shift();
    if (!choices) break;
    const plan = planAssemblyPush(state, model, choices);
    if (plan.ok) {
      resolved.push(choices);
      continue;
    }
    if (plan.reason !== 'PATH_CHOICE_REQUIRED' || !plan.choices) continue;
    for (const choice of plan.choices) queue.push([...choices, choice]);
  }

  return resolved;
}
