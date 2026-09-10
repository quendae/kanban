import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  getPlayerDesigns,
  isTestedDesign,
  type CarId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
  type PartId,
} from '../src/index.js';

function upgradeContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'testing-upgrade-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:1' },
    },
    parts: {
      'part:0': { id: 'part:0', type: 'part-type:0' },
      'part:1': { id: 'part:1', type: 'part-type:1' },
      'part:2': { id: 'part:2', type: 'part-type:0' },
    },
    designs: {
      'design:0': { id: 'design:0', model: 'model:0', partType: 'part-type:0', oldestBonus: null },
      'design:1': { id: 'design:1', model: 'model:1', partType: 'part-type:1', oldestBonus: null },
    },
    upgradeSpaces: {
      'upgrade-space:0': {
        id: 'upgrade-space:0',
        model: 'model:0',
        partType: 'part-type:0',
        benefit: { kind: 'BOOK', amount: 1 },
      },
      'upgrade-space:1': {
        id: 'upgrade-space:1',
        model: 'model:1',
        partType: 'part-type:1',
        benefit: { kind: 'NONE' },
      },
    },
  };
}

function upgradeState(options?: {
  readonly partValue?: number;
  readonly certified?: boolean;
  readonly garageCar?: boolean;
  readonly claimableCar?: boolean;
  readonly occupiedSpace?: boolean;
  readonly doubleUpgradeUsed?: boolean;
  readonly globallyReserved?: boolean;
}): GameState {
  const shell = createShellGame({ seed: 'testing-upgrade', playerCount: 2 });
  const content = upgradeContent();
  const parts: Partial<Record<PartId, EntityLocation>> = {
    'part:0': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 0 },
    'part:1': { kind: 'PLAYER', playerId: 'player:0', area: 'parts', slot: 1 },
    'part:2': options?.occupiedSpace
      ? { kind: 'BOARD', area: 'upgrade-space:0', slot: 0 }
      : { kind: 'SUPPLY' },
  };
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': options?.garageCar
      ? { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 }
      : options?.claimableCar
        ? { kind: 'BOARD', area: 'test-track', slot: 0 }
        : { kind: 'SUPPLY' },
    'car:1': { kind: 'SUPPLY' },
  };
  const designs: Partial<Record<DesignId, EntityLocation>> = {
    'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
    'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
  };

  return {
    ...shell,
    content,
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: [
      {
        ...shell.players[0]!,
        currentDepartment: 'TESTING_INNOVATION',
        currentWorkstation: 'A_RIGHT',
        baseShiftsToday: 3,
        certifications: options?.certified ? ['TESTING_INNOVATION'] : [],
        training: {
          ...shell.players[0]!.training,
          TESTING_INNOVATION: options?.certified ? content.trainingRules.certificationLevel : 0,
        },
        doubleUpgradeUsed: options?.doubleUpgradeUsed ?? false,
      },
      {
        ...shell.players[1]!,
        currentDepartment: 'DESIGN',
        currentWorkstation: 'D_LEFT',
        baseShiftsToday: 2,
      },
    ],
    board: {
      ...shell.board,
      cars,
      parts,
      designs,
      partValues: { ...shell.board.partValues, 'part-type:0': options?.partValue ?? 4 },
      designUpgrades: {},
      doubleUpgradedPartTypes: options?.globallyReserved ? { 'part-type:0': 'player:1' } : {},
    },
  };
}

const normalUpgrade = {
  type: 'UPGRADE_DESIGN' as const,
  actorId: 'player:0' as const,
  designId: 'design:0' as const,
  partId: 'part:0' as const,
  upgradeSpaceId: 'upgrade-space:0' as const,
  doubleUpgrade: false,
};

describe('Testing & Innovation — Design upgrades', () => {
  it('spends 1 Shift, moves the matching physical Part, raises value by one and awards 2 PP', () => {
    const result = applyCommand(upgradeState(), normalUpgrade);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.shiftsSpentToday).toBe(1);
    expect(result.state.players[0]?.pp).toBe(2);
    expect(result.state.board.partValues['part-type:0']).toBe(5);
    expect(result.state.board.parts['part:0']).toEqual({ kind: 'BOARD', area: 'upgrade-space:0', slot: 0 });
    expect(result.state.board.designUpgrades['design:0']).toEqual({ partType: 'part-type:0', doubleUpgrade: false });
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'DESIGN_UPGRADED', benefit: { kind: 'BOOK', amount: 1 }, previousPartValue: 4, newPartValue: 5, ppAwarded: 2,
    }));
  });

  it('moves the upgraded Design out of the blueprint hand and frees its blueprint slot', () => {
    const result = applyCommand(upgradeState(), normalUpgrade);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.state.board.designs['design:0']).toEqual({
      kind: 'PLAYER',
      playerId: 'player:0',
      area: 'upgraded-designs',
      slot: 0,
    });
    expect(getPlayerDesigns(result.state, 'player:0')).toEqual(['design:1']);
  });

  it('does not allow an upgraded Design to be spent again as a Claim Cars blueprint', () => {
    const upgraded = applyCommand(upgradeState({ claimableCar: true }), normalUpgrade);
    expect(upgraded.status).toBe('ACCEPTED');
    if (upgraded.status !== 'ACCEPTED') return;

    const claim = applyCommand(upgraded.state, {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [{ carId: 'car:0', designId: 'design:0', garageSlot: 0 }],
    });
    expect(claim.status).toBe('REJECTED');
    if (claim.status === 'REJECTED') expect(claim.errors).toContain('CLAIM_DESIGN_NOT_OWNED');
  });

  it('caps Part value at 6 while preserving the normal +2 PP reward', () => {
    const result = applyCommand(upgradeState({ partValue: 6 }), normalUpgrade);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.board.partValues['part-type:0']).toBe(6);
    expect(result.state.players[0]?.pp).toBe(2);
  });

  it('rejects mismatched resources and an occupied Upgrade Space', () => {
    const mismatch = applyCommand(upgradeState(), { ...normalUpgrade, partId: 'part:1' });
    expect(mismatch.status).toBe('REJECTED');
    if (mismatch.status === 'REJECTED') expect(mismatch.errors).toContain('UPGRADE_PART_TYPE_MISMATCH');

    const occupied = applyCommand(upgradeState({ occupiedSpace: true }), normalUpgrade);
    expect(occupied.status).toBe('REJECTED');
    if (occupied.status === 'REJECTED') expect(occupied.errors).toContain('UPGRADE_SPACE_OCCUPIED');
  });

  it('derives Tested Design from an upgraded owned Design plus a same-model garage car', () => {
    const withoutCar = applyCommand(upgradeState(), normalUpgrade);
    expect(withoutCar.status).toBe('ACCEPTED');
    if (withoutCar.status !== 'ACCEPTED') return;
    expect(isTestedDesign(withoutCar.state, 'player:0', 'design:0')).toBe(false);

    const withCar = applyCommand(upgradeState({ garageCar: true }), normalUpgrade);
    expect(withCar.status).toBe('ACCEPTED');
    if (withCar.status !== 'ACCEPTED') return;
    expect(isTestedDesign(withCar.state, 'player:0', 'design:0')).toBe(true);
    expect(isTestedDesign(withCar.state, 'player:0', 'design:1')).toBe(false);
  });

  it('requires Testing certification for a double upgrade and awards base PP plus the resulting Part value', () => {
    const command = { ...normalUpgrade, doubleUpgrade: true };
    const uncertified = applyCommand(upgradeState(), command);
    expect(uncertified.status).toBe('REJECTED');
    if (uncertified.status === 'REJECTED') expect(uncertified.errors).toContain('DOUBLE_UPGRADE_REQUIRES_CERTIFICATION');

    const result = applyCommand(upgradeState({ certified: true, partValue: 3 }), command);
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.board.partValues['part-type:0']).toBe(5);
    expect(result.state.players[0]?.pp).toBe(7);
    expect(result.state.players[0]?.doubleUpgradeUsed).toBe(true);
    expect(result.state.board.doubleUpgradedPartTypes['part-type:0']).toBe('player:0');
    expect(result.state.board.designUpgrades['design:0']).toEqual({ partType: 'part-type:0', doubleUpgrade: true });
  });

  it('allows only one double upgrade per player and globally reserves its Part Type', () => {
    const command = { ...normalUpgrade, doubleUpgrade: true };

    const alreadyUsed = applyCommand(upgradeState({ certified: true, doubleUpgradeUsed: true }), command);
    expect(alreadyUsed.status).toBe('REJECTED');
    if (alreadyUsed.status === 'REJECTED') expect(alreadyUsed.errors).toContain('DOUBLE_UPGRADE_ALREADY_USED');

    const reserved = applyCommand(upgradeState({ certified: true, globallyReserved: true }), command);
    expect(reserved.status).toBe('REJECTED');
    if (reserved.status === 'REJECTED') expect(reserved.errors).toContain('DOUBLE_UPGRADE_PART_TYPE_RESERVED');
  });
});
