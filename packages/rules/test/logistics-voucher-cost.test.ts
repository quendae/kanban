import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  type GameContent,
  type GameState,
} from '../src/index.js';

function certifiedLogisticsState(shiftCost: 0 | 1, shiftsSpentToday = 0): GameState {
  const shell = createShellGame({ seed: `voucher-cost-${shiftCost}-${shiftsSpentToday}`, playerCount: 2 });
  const content: GameContent = {
    ...shell.content,
    rules: { logisticsVoucherShiftCost: shiftCost },
  };

  return {
    ...shell,
    content,
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? {
            ...player,
            currentDepartment: 'LOGISTICS',
            currentWorkstation: 'C_LEFT',
            baseShiftsToday: 2,
            bankedShifts: 2,
            shiftsSpentToday,
            certifications: ['LOGISTICS'],
            training: {
              ...player.training,
              LOGISTICS: content.trainingRules.certificationLevel,
            },
          }
        : {
            ...player,
            currentDepartment: 'DESIGN',
            currentWorkstation: 'D_LEFT',
            baseShiftsToday: 2,
          },
    ),
  };
}

describe('Logistics — Parts Voucher Shift cost boundary', () => {
  it('uses the explicit ruleset cost and development cost 0 remains legal after four Shifts are spent', () => {
    const state = certifiedLogisticsState(0, 4);
    const result = applyCommand(state, { type: 'TAKE_PARTS_VOUCHER', actorId: 'player:0' });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]?.shiftsSpentToday).toBe(4);
    expect(result.state.pendingRewards).toContainEqual({
      playerId: 'player:0',
      type: 'VOUCHER',
      amount: 1,
    });
  });

  it('can enforce a non-zero cost later if authoritative component research requires it', () => {
    const state = certifiedLogisticsState(1, 4);
    const result = applyCommand(state, { type: 'TAKE_PARTS_VOUCHER', actorId: 'player:0' });

    expect(result.status).toBe('REJECTED');
    if (result.status === 'REJECTED') expect(result.errors).toContain('INSUFFICIENT_SHIFTS');
  });
});
