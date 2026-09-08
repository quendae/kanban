import type { Department } from './enums.js';

export type WorkstationId =
  | 'A_LEFT'
  | 'A_RIGHT'
  | 'B_LEFT'
  | 'B_RIGHT'
  | 'C_LEFT'
  | 'C_RIGHT'
  | 'D_LEFT'
  | 'D_RIGHT'
  | 'E_LEFT'
  | 'E_RIGHT'
  | 'F_SANDRA';

export interface WorkstationDefinition {
  readonly id: WorkstationId;
  readonly order: number;
  readonly department: Department;
  readonly shifts: 0 | 1 | 2 | 3;
  readonly reservedForSandra: boolean;
}

export const WORKSTATIONS = [
  {
    id: 'A_LEFT',
    order: 0,
    department: 'TESTING_INNOVATION',
    shifts: 2,
    reservedForSandra: false,
  },
  {
    id: 'A_RIGHT',
    order: 1,
    department: 'TESTING_INNOVATION',
    shifts: 3,
    reservedForSandra: false,
  },
  {
    id: 'B_LEFT',
    order: 2,
    department: 'ASSEMBLY',
    shifts: 2,
    reservedForSandra: false,
  },
  {
    id: 'B_RIGHT',
    order: 3,
    department: 'ASSEMBLY',
    shifts: 3,
    reservedForSandra: false,
  },
  {
    id: 'C_LEFT',
    order: 4,
    department: 'LOGISTICS',
    shifts: 2,
    reservedForSandra: false,
  },
  {
    id: 'C_RIGHT',
    order: 5,
    department: 'LOGISTICS',
    shifts: 3,
    reservedForSandra: false,
  },
  {
    id: 'D_LEFT',
    order: 6,
    department: 'DESIGN',
    shifts: 2,
    reservedForSandra: false,
  },
  {
    id: 'D_RIGHT',
    order: 7,
    department: 'DESIGN',
    shifts: 3,
    reservedForSandra: false,
  },
  {
    id: 'E_LEFT',
    order: 8,
    department: 'ADMINISTRATION',
    shifts: 1,
    reservedForSandra: false,
  },
  {
    id: 'E_RIGHT',
    order: 9,
    department: 'ADMINISTRATION',
    shifts: 2,
    reservedForSandra: false,
  },
  {
    id: 'F_SANDRA',
    order: 10,
    department: 'ADMINISTRATION',
    shifts: 0,
    reservedForSandra: true,
  },
] as const satisfies readonly WorkstationDefinition[];

export function getWorkstation(id: WorkstationId): WorkstationDefinition {
  const station = WORKSTATIONS.find((candidate) => candidate.id === id);
  if (!station) {
    throw new Error(`Unknown workstation: ${id}`);
  }
  return station;
}
