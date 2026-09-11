import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  createShellGame,
  resolveWinners,
  type CarId,
  type DesignId,
  type GameState,
} from '../src/index.js';

const C0 = 'car:20' as CarId;
const C1 = 'car:21' as CarId;
const C2 = 'car:22' as CarId;
const D0 = 'design:20' as DesignId;

function winnerFixture(options: {
  readonly equalCars?: boolean;
  readonly player1TestedDesign?: boolean;
  readonly fullTie?: boolean;
} = {}): GameState {
  const shell = createShellGame({ seed: 'winner-resolution', playerCount: 3 });
  const p1HasSecondCar = options.equalCars || options.fullTie;
  const p1HasTested = options.player1TestedDesign || options.fullTie;

  return {
    ...shell,
    phase: 'GAME_OVER',
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'winner-resolution-fixture',
      authoritative: false,
      cars: {
        [C0]: { id: C0, model: 'model:0', finalPP: 2 },
        [C1]: { id: C1, model: 'model:0', finalPP: 2 },
        [C2]: { id: C2, model: 'model:0', finalPP: 2 },
      },
      designs: {
        [D0]: { id: D0, model: 'model:0', partType: 'part-type:0', oldestBonus: null },
      },
    },
    board: {
      ...shell.board,
      cars: {
        [C0]: { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
        [C1]: { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 1 },
        [C2]: p1HasSecondCar
          ? { kind: 'PLAYER', playerId: 'player:1', area: 'garage', slot: 1 }
          : { kind: 'SUPPLY' },
      },
      designs: p1HasTested
        ? { [D0]: { kind: 'PLAYER', playerId: 'player:1', area: 'upgraded-designs', slot: 0 } }
        : {},
      designUpgrades: p1HasTested
        ? { [D0]: { partType: 'part-type:0', doubleUpgrade: false } }
        : {},
    },
    players: shell.players.map((player) => {
      if (player.id === 'player:0') {
        return {
          ...player,
          pp: 50,
          bankedShifts: options.fullTie ? 2 : 3,
          certifications: options.fullTie ? ['DESIGN'] : ['DESIGN', 'LOGISTICS'],
        };
      }
      if (player.id === 'player:1') {
        return {
          ...player,
          pp: 50,
          bankedShifts: 2,
          certifications: ['DESIGN'],
        };
      }
      return { ...player, pp: 40 };
    }),
  };
}

describe('Original 2014 winner resolution', () => {
  it('uses Cars before later tie-break criteria when PP is tied', () => {
    const resolution = resolveWinners(winnerFixture());
    expect(resolution.winnerIds).toEqual(['player:0']);
    expect(resolution.steps.map((step) => step.criterion)).toEqual(['PP', 'CARS']);
  });

  it('uses Tested Designs after Cars when car count remains tied', () => {
    const resolution = resolveWinners(winnerFixture({ equalCars: true, player1TestedDesign: true }));
    expect(resolution.winnerIds).toEqual(['player:1']);
    expect(resolution.steps.map((step) => step.criterion)).toEqual([
      'PP',
      'CARS',
      'TESTED_DESIGNS',
    ]);
  });

  it('declares shared victory when all tie-break criteria remain tied', () => {
    const state = winnerFixture({ fullTie: true });
    const resolution = resolveWinners({
      ...state,
      board: {
        ...state.board,
        designs: {},
        designUpgrades: {},
      },
    });

    expect(resolution.winnerIds).toEqual(['player:0', 'player:1']);
    expect(resolution.steps.map((step) => step.criterion)).toEqual([
      'PP',
      'CARS',
      'TESTED_DESIGNS',
      'BANKED_SHIFTS',
      'CERTIFICATIONS',
    ]);
  });
});
