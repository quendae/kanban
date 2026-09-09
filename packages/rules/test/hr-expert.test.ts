import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  applyCommand,
  createShellGame,
  getLegalCommands,
  type AwardPlaqueId,
  type AwardPlaqueReward,
  type GameContent,
  type GameState,
} from '../src/index.js';

const plaqueIds = [
  'award-plaque:0',
  'award-plaque:1',
  'award-plaque:2',
  'award-plaque:3',
] as const satisfies readonly AwardPlaqueId[];

const rewards: readonly AwardPlaqueReward[] = [
  { kind: 'BANKED_SHIFT', amount: 1 },
  { kind: 'PP', amount: 2 },
  { kind: 'BOOK', amount: 1 },
  { kind: 'VOUCHER', amount: 1 },
];

function expertContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'expert-awards-fixture',
    awardPlaques: Object.fromEntries(
      plaqueIds.map((id, index) => [id, { id, reward: rewards[index]! }]),
    ),
  };
}

function expertState(playerIndex = 0): GameState {
  const shell = createShellGame({ seed: `expert-${playerIndex}`, playerCount: 2 });
  return {
    ...shell,
    content: expertContent(),
    phase: 'WORK',
    activeActorId: `player:${playerIndex}`,
    workOrder: [`player:${playerIndex}`, `player:${1 - playerIndex}`],
    workCursor: 0,
    players: shell.players.map((player, index) => ({
      ...player,
      currentDepartment: index === playerIndex ? 'DESIGN' : 'LOGISTICS',
      currentWorkstation: index === playerIndex ? 'D_RIGHT' : 'C_LEFT',
      baseShiftsToday: index === playerIndex ? 3 : 2,
      certifications: index === playerIndex ? ['DESIGN'] : [],
      certificationPosition: index === playerIndex ? 1 : 0,
      training: {
        ...player.training,
        DESIGN: index === playerIndex ? 4 : 0,
      },
    })),
    board: {
      ...shell.board,
      awardPlaquePools: {
        ...shell.board.awardPlaquePools,
        DESIGN: [...plaqueIds],
      },
    },
  };
}

function reachExpert(state: GameState) {
  return applyCommand(state, {
    type: 'TRAIN_DEPARTMENT' as const,
    actorId: state.activeActorId as `player:${number}`,
    department: 'DESIGN' as const,
    source: 'SHIFT' as const,
  });
}

describe('Human Resources — expert and Award Plaques', () => {
  it('awards the department expert Seat only to the first expert and requires a plaque choice', () => {
    const first = reachExpert(expertState());
    expect(first.status).toBe('ACCEPTED');
    if (first.status !== 'ACCEPTED') return;

    expect(first.state.players[0]?.training.DESIGN).toBe(5);
    expect(first.state.players[0]?.expertDepartments).toEqual(['DESIGN']);
    expect(first.state.players[0]?.conferenceSeatsFaceUp).toBe(2);
    expect(first.state.players[0]?.conferenceSeatsFaceDown).toBe(2);
    expect(first.state.board.expertSeatAvailable.DESIGN).toBe(false);
    expect(first.state.pendingAwardPlaqueChoice).toEqual({
      playerId: 'player:0',
      department: 'DESIGN',
    });
    expect(first.events.map((event) => event.type)).toContain('PLAYER_BECAME_EXPERT');
    expect(first.events.map((event) => event.type)).toContain('EXPERT_SEAT_AWARDED');

    const secondBase = expertState(1);
    const secondState: GameState = {
      ...secondBase,
      board: {
        ...secondBase.board,
        expertSeatAvailable: {
          ...secondBase.board.expertSeatAvailable,
          DESIGN: false,
        },
      },
    };
    const second = reachExpert(secondState);
    expect(second.status).toBe('ACCEPTED');
    if (second.status !== 'ACCEPTED') return;
    expect(second.state.players[1]?.expertDepartments).toEqual(['DESIGN']);
    expect(second.state.players[1]?.conferenceSeatsFaceUp).toBe(1);
    expect(second.state.players[1]?.conferenceSeatsFaceDown).toBe(3);
    expect(second.events.map((event) => event.type)).not.toContain('EXPERT_SEAT_AWARDED');
    expect(second.state.pendingAwardPlaqueChoice?.playerId).toBe('player:1');
  });

  it('blocks ordinary work commands until the pending expert chooses one available plaque', () => {
    const expert = reachExpert(expertState());
    if (expert.status !== 'ACCEPTED') throw new Error(expert.errors?.join(','));

    const legal = getLegalCommands(expert.state, 'player:0');
    expect(legal).toEqual(
      plaqueIds.map((plaqueId) => ({
        type: 'CHOOSE_AWARD_PLAQUE',
        actorId: 'player:0',
        department: 'DESIGN',
        plaqueId,
      })),
    );

    const invalid = applyCommand(expert.state, {
      type: 'CHOOSE_AWARD_PLAQUE',
      actorId: 'player:0',
      department: 'DESIGN',
      plaqueId: 'award-plaque:99',
    });
    expect(invalid.status).toBe('REJECTED');
    if (invalid.status === 'REJECTED') {
      expect(invalid.errors).toContain('AWARD_PLAQUE_NOT_AVAILABLE');
    }
  });

  it.each([
    ['award-plaque:0', 'bankedShifts', 1],
    ['award-plaque:1', 'pp', 2],
    ['award-plaque:2', 'books', 1],
    ['award-plaque:3', 'vouchers', 1],
  ] as const)('claims %s once and applies its immediate reward', (plaqueId, field, amount) => {
    const expert = reachExpert(expertState());
    if (expert.status !== 'ACCEPTED') throw new Error('expert setup failed');

    const result = applyCommand(expert.state, {
      type: 'CHOOSE_AWARD_PLAQUE',
      actorId: 'player:0',
      department: 'DESIGN',
      plaqueId,
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.state.players[0]?.[field]).toBe(amount);
    expect(result.state.board.awardPlaquePools.DESIGN).not.toContain(plaqueId);
    expect(result.state.pendingAwardPlaqueChoice).toBeNull();
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'AWARD_PLAQUE_CLAIMED', plaqueId }),
    );

    const repeated = applyCommand(result.state, {
      type: 'CHOOSE_AWARD_PLAQUE',
      actorId: 'player:0',
      department: 'DESIGN',
      plaqueId,
    });
    expect(repeated.status).toBe('REJECTED');
  });
});
