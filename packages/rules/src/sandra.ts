import type { Department } from './enums.js';
import type { DesignId, PartId, PlayerId } from './ids.js';
import {
  getDesignDeck,
  getPlayerDesigns,
  getPlayerGarageCars,
  getPlayerParts,
  getWarehouseParts,
} from './inventory.js';
import type { EntityLocation, GameState } from './model.js';
import { shuffle, type RngState } from './rng.js';
import type { WorkstationId } from './workstations.js';

export type SandraMode = 'NICE' | 'MEAN';
type BoardLocation = Extract<EntityLocation, { readonly kind: 'BOARD' }>;

export interface SandraAuditResult {
  readonly playerId: PlayerId;
  readonly trainingLevel: number;
  readonly metric: number;
  readonly predicatePassed: boolean;
  readonly ppDelta: number;
}

export interface SandraAuditPlan {
  readonly department: Department;
  readonly mode: SandraMode;
  readonly auditedPlayerIds: readonly PlayerId[];
  readonly trainingLevel: number;
  readonly results: readonly SandraAuditResult[];
}

export type SandraDepartmentTask =
  | {
      readonly kind: 'TESTING';
      readonly previousPaceCarPosition: number;
      readonly paceCarPosition: number;
      readonly meetingThresholdCrossed: boolean;
    }
  | {
      readonly kind: 'ASSEMBLY';
      readonly returnedPartIds: readonly PartId[];
    }
  | {
      readonly kind: 'LOGISTICS';
      readonly returnedPartIds: readonly PartId[];
    }
  | {
      readonly kind: 'DESIGN';
      readonly returnedDesignIds: readonly DesignId[];
      readonly centralDeck: readonly DesignId[];
      readonly rng: RngState;
    }
  | {
      readonly kind: 'ADMINISTRATION';
    };

export interface SandraVisitPlan {
  readonly department: Department;
  readonly workstationId: WorkstationId;
  readonly audit: SandraAuditPlan;
  readonly task: SandraDepartmentTask;
}

const DEPARTMENT_ORDER = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
] as const satisfies readonly Department[];

const DEPARTMENT_WORKSTATIONS: Readonly<Record<Exclude<Department, 'ADMINISTRATION'>, readonly [WorkstationId, WorkstationId]>> = {
  TESTING_INNOVATION: ['A_LEFT', 'A_RIGHT'],
  ASSEMBLY: ['B_LEFT', 'B_RIGHT'],
  LOGISTICS: ['C_LEFT', 'C_RIGHT'],
  DESIGN: ['D_LEFT', 'D_RIGHT'],
};

function nextDepartmentCandidates(current: Department | 'SANDRA_DESK'): readonly Department[] {
  const currentDepartment: Department = current === 'SANDRA_DESK' ? 'ADMINISTRATION' : current;
  const start = DEPARTMENT_ORDER.indexOf(currentDepartment);
  return Array.from({ length: DEPARTMENT_ORDER.length }, (_, offset) =>
    DEPARTMENT_ORDER[(start + offset + 1) % DEPARTMENT_ORDER.length]!,
  );
}

function firstFreeSandraWorkstation(state: GameState, department: Department): WorkstationId | null {
  if (department === 'ADMINISTRATION') return 'F_SANDRA';
  const occupied = new Set(state.players.map((player) => player.currentWorkstation));
  return DEPARTMENT_WORKSTATIONS[department].find((workstationId) => !occupied.has(workstationId)) ?? null;
}

export function getSandraPerformanceMetric(
  state: GameState,
  playerId: PlayerId,
  department: Department,
): number {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return 0;

  switch (department) {
    case 'TESTING_INNOVATION':
      return getPlayerDesigns(state, playerId).filter(
        (designId) => state.board.designUpgrades[designId] !== undefined,
      ).length;
    case 'ASSEMBLY':
      return getPlayerGarageCars(state, playerId).length;
    case 'LOGISTICS':
      return getPlayerParts(state, playerId).length;
    case 'DESIGN':
      return getPlayerDesigns(state, playerId).length;
    case 'ADMINISTRATION':
      return player.certifications.length;
  }
}

function passesPerformancePredicate(mode: SandraMode, metric: number): boolean {
  return mode === 'NICE' ? metric >= 2 : metric <= 2;
}

export function planSandraAudit(state: GameState, department: Department): SandraAuditPlan {
  const mode = state.sandra.mode;
  const levels = state.players.map((player) => player.training[department]);
  const trainingLevel = mode === 'NICE' ? Math.max(...levels) : Math.min(...levels);
  const candidates = mode === 'NICE' && trainingLevel === 0
    ? []
    : state.players.filter((player) => player.training[department] === trainingLevel);

  const results: SandraAuditResult[] = candidates.map((player) => {
    const metric = getSandraPerformanceMetric(state, player.id, department);
    const predicatePassed = passesPerformancePredicate(mode, metric);
    let ppDelta = 0;
    if (predicatePassed && mode === 'NICE') {
      ppDelta = player.bankedShifts;
    } else if (predicatePassed && mode === 'MEAN') {
      ppDelta = -Math.min(player.pp, Math.max(0, 5 - player.bankedShifts));
    }
    return {
      playerId: player.id,
      trainingLevel,
      metric,
      predicatePassed,
      ppDelta,
    };
  });

  return {
    department,
    mode,
    auditedPlayerIds: results.map((result) => result.playerId),
    trainingLevel,
    results,
  };
}

function planTestingTask(state: GameState): SandraDepartmentTask {
  const previousPaceCarPosition = state.board.paceCarPosition;
  const paceCarPosition = previousPaceCarPosition + 1;
  const threshold = state.board.nextMeetingThreshold;
  return {
    kind: 'TESTING',
    previousPaceCarPosition,
    paceCarPosition,
    meetingThresholdCrossed:
      !state.meetingScheduled &&
      previousPaceCarPosition < threshold &&
      paceCarPosition >= threshold,
  };
}

function planAssemblyTask(state: GameState): SandraDepartmentTask {
  const returnedPartIds = (Object.entries(state.board.parts) as [PartId, EntityLocation | undefined][])
    .filter((entry): entry is [PartId, BoardLocation] =>
      entry[1]?.kind === 'BOARD' && entry[1].area.startsWith('assembly:'),
    )
    .map(([partId]) => partId)
    .sort((a, b) => a.localeCompare(b));
  return { kind: 'ASSEMBLY', returnedPartIds };
}

function planLogisticsTask(state: GameState): SandraDepartmentTask {
  const returnedPartIds = state.content.partTypes.flatMap((partType) =>
    getWarehouseParts(state, partType).slice(1),
  );
  return { kind: 'LOGISTICS', returnedPartIds };
}

function rightmostVisibleDesigns(state: GameState): DesignId[] {
  return (Object.entries(state.board.designs) as [DesignId, EntityLocation | undefined][])
    .filter((entry): entry is [DesignId, BoardLocation] =>
      entry[1]?.kind === 'BOARD' &&
      (entry[1].area === 'design-row:0' || entry[1].area === 'design-row:1') &&
      entry[1].slot >= 2,
    )
    .sort((a, b) => {
      const slotDifference = b[1].slot - a[1].slot;
      if (slotDifference !== 0) return slotDifference;
      return a[1].area.localeCompare(b[1].area);
    })
    .slice(0, 4)
    .map(([designId]) => designId);
}

function planDesignTask(state: GameState): SandraDepartmentTask {
  const returnedDesignIds = rightmostVisibleDesigns(state);
  const central = getDesignDeck(state, 'central');
  const shuffled = shuffle(state.rng, [...central, ...returnedDesignIds]);
  return {
    kind: 'DESIGN',
    returnedDesignIds,
    centralDeck: shuffled.values,
    rng: shuffled.rng,
  };
}

export function planSandraDepartmentTask(
  state: GameState,
  department: Department,
): SandraDepartmentTask {
  switch (department) {
    case 'TESTING_INNOVATION': return planTestingTask(state);
    case 'ASSEMBLY': return planAssemblyTask(state);
    case 'LOGISTICS': return planLogisticsTask(state);
    case 'DESIGN': return planDesignTask(state);
    case 'ADMINISTRATION': return { kind: 'ADMINISTRATION' };
  }
}

export function planSandraVisit(state: GameState): SandraVisitPlan {
  for (const department of nextDepartmentCandidates(state.sandra.department)) {
    const workstationId = firstFreeSandraWorkstation(state, department);
    if (workstationId === null) continue;
    return {
      department,
      workstationId,
      audit: planSandraAudit(state, department),
      task: planSandraDepartmentTask(state, department),
    };
  }
  throw new Error('Sandra has no legal department destination');
}
