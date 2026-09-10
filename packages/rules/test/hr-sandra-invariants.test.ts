import { describe, expect, it } from 'vitest';
import {
  createShellGame,
  getInvariantViolations,
  type Department,
  type GameState,
  type InvariantCode,
} from '../src/index.js';

function codes(state: GameState): readonly InvariantCode[] {
  return getInvariantViolations(state).map((violation) => violation.code);
}

function withPlayer(
  state: GameState,
  update: (player: GameState['players'][number]) => GameState['players'][number],
): GameState {
  return {
    ...state,
    players: state.players.map((player, index) => index === 0 ? update(player) : player),
  };
}

const departments: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

describe('M4 HR and Sandra invariants', () => {
  it('rejects training values outside the configured integer range', () => {
    const shell = createShellGame({ seed: 'invalid-training', playerCount: 2 });
    for (const invalid of [-1, 1.5, shell.content.trainingRules.expertLevel + 1]) {
      const state = withPlayer(shell, (player) => ({
        ...player,
        training: { ...player.training, DESIGN: invalid },
      }));
      expect(codes(state)).toContain('INVALID_TRAINING_LEVEL');
    }
  });

  it('requires certification and expert flags to agree with configured training thresholds', () => {
    const shell = createShellGame({ seed: 'invalid-hr-transition', playerCount: 2 });
    const certifiedTooEarly = withPlayer(shell, (player) => ({
      ...player,
      certifications: ['LOGISTICS'],
      training: { ...player.training, LOGISTICS: shell.content.trainingRules.certificationLevel - 1 },
    }));
    expect(codes(certifiedTooEarly)).toContain('CERTIFICATION_TRAINING_MISMATCH');

    const expertFlagTooEarly = withPlayer(shell, (player) => ({
      ...player,
      expertDepartments: ['ASSEMBLY'],
      training: { ...player.training, ASSEMBLY: shell.content.trainingRules.expertLevel - 1 },
    }));
    expect(codes(expertFlagTooEarly)).toContain('EXPERT_TRAINING_MISMATCH');

    const missingExpertFlag = withPlayer(shell, (player) => ({
      ...player,
      certifications: ['DESIGN'],
      training: { ...player.training, DESIGN: shell.content.trainingRules.expertLevel },
    }));
    expect(codes(missingExpertFlag)).toContain('EXPERT_TRAINING_MISMATCH');
  });

  it('rejects duplicate Award Plaques in any department pool', () => {
    const shell = createShellGame({ seed: 'duplicate-plaques', playerCount: 2 });
    const state: GameState = {
      ...shell,
      board: {
        ...shell.board,
        awardPlaquePools: {
          ...shell.board.awardPlaquePools,
          DESIGN: ['award-plaque:0', 'award-plaque:0'],
        },
      },
    };
    expect(codes(state)).toContain('DUPLICATE_AWARD_PLAQUE');
  });

  it('keeps conference Seat counts nonnegative and within the unlocked capacity', () => {
    const shell = createShellGame({ seed: 'invalid-seats', playerCount: 2 });
    const negative = withPlayer(shell, (player) => ({ ...player, conferenceSeatsFaceUp: -1 }));
    expect(codes(negative)).toContain('INVALID_CONFERENCE_SEATS');

    const tooMany = withPlayer(shell, (player) => ({
      ...player,
      conferenceSeatsFaceUp: 2,
      conferenceSeatsFaceDown: 3,
    }));
    expect(codes(tooMany)).toContain('INVALID_CONFERENCE_SEATS');

    const adminCertified = withPlayer(shell, (player) => ({
      ...player,
      certifications: ['ADMINISTRATION'],
      training: {
        ...player.training,
        ADMINISTRATION: shell.content.trainingRules.certificationLevel,
      },
      conferenceSeatsFaceUp: 2,
      conferenceSeatsFaceDown: 3,
    }));
    expect(codes(adminCertified)).not.toContain('INVALID_CONFERENCE_SEATS');
  });

  it('rejects negative Factory Goal Seat pools', () => {
    const shell = createShellGame({ seed: 'negative-factory-goal', playerCount: 2 });
    const state: GameState = {
      ...shell,
      board: {
        ...shell.board,
        factoryGoals: [{ goalId: 'factory-goal:0', seatsRemaining: -1, claimedBy: [] }],
      },
    };
    expect(codes(state)).toContain('NEGATIVE_FACTORY_GOAL_SEATS');
  });

  it('requires Sandra workstation and department to describe the same physical location', () => {
    const shell = createShellGame({ seed: 'sandra-pairing', playerCount: 2 });

    const mismatched: GameState = {
      ...shell,
      sandra: { ...shell.sandra, department: 'DESIGN', workstation: 'A_LEFT' },
    };
    expect(codes(mismatched)).toContain('SANDRA_WORKSTATION_MISMATCH');

    const validDesk: GameState = {
      ...shell,
      sandra: { ...shell.sandra, department: 'SANDRA_DESK', workstation: 'F_SANDRA' },
    };
    expect(codes(validDesk)).not.toContain('SANDRA_WORKSTATION_MISMATCH');

    for (const department of departments) {
      expect(department).toBeTruthy();
    }
  });
});
