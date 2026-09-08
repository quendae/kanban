import { describe, expect, it } from 'vitest';
import { getWorkstation, WORKSTATIONS } from '../src/workstations.js';

describe('Original 2014 Workstation Alley', () => {
  it('keeps the exact A-to-F left-to-right workstation order', () => {
    expect(WORKSTATIONS.map((station) => station.id)).toEqual([
      'A_LEFT',
      'A_RIGHT',
      'B_LEFT',
      'B_RIGHT',
      'C_LEFT',
      'C_RIGHT',
      'D_LEFT',
      'D_RIGHT',
      'E_LEFT',
      'E_RIGHT',
      'F_SANDRA',
    ]);
    expect(WORKSTATIONS.map((station) => station.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('maps A-E to the verified departments and F to Sandra administration', () => {
    expect(WORKSTATIONS.map((station) => station.department)).toEqual([
      'TESTING_INNOVATION',
      'TESTING_INNOVATION',
      'ASSEMBLY',
      'ASSEMBLY',
      'LOGISTICS',
      'LOGISTICS',
      'DESIGN',
      'DESIGN',
      'ADMINISTRATION',
      'ADMINISTRATION',
      'ADMINISTRATION',
    ]);
  });

  it('assigns 2/3 Shifts except Administration 1/2 and reserves only F for Sandra', () => {
    expect(WORKSTATIONS.map((station) => station.shifts)).toEqual([
      2, 3, 2, 3, 2, 3, 2, 3, 1, 2, 0,
    ]);
    expect(WORKSTATIONS.filter((station) => station.reservedForSandra).map((station) => station.id)).toEqual([
      'F_SANDRA',
    ]);
    expect(getWorkstation('C_RIGHT')).toMatchObject({
      department: 'LOGISTICS',
      shifts: 3,
      order: 5,
    });
  });
});
