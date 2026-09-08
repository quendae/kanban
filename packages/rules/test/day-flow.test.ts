import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getBaseShifts,
  getLegalCommands,
  getMaximumUsableShifts,
  type WorkstationId,
} from '../src/index.js';

function workingGame(
  p0Workstation: WorkstationId = 'A_LEFT',
  p1Workstation: WorkstationId = 'B_RIGHT',
) {
  const shell = createShellGame({ seed: `working-${p0Workstation}-${p1Workstation}`, playerCount: 2 });
  const started = applyCommand(shell, { type: 'START_GAME', actorId: 'player:0' });
  if (started.status !== 'ACCEPTED') throw new Error('start failed');
  const p0 = applyCommand(started.state, {
    type: 'SELECT_WORKSTATION',
    actorId: 'player:0',
    workstationId: p0Workstation,
  });
  if (p0.status !== 'ACCEPTED') throw new Error('p0 selection failed');
  const p1 = applyCommand(p0.state, {
    type: 'SELECT_WORKSTATION',
    actorId: 'player:1',
    workstationId: p1Workstation,
  });
  if (p1.status !== 'ACCEPTED') throw new Error('p1 selection failed');
  return p1.state;
}

describe('Working Phase', () => {
  it('derives base Shifts from the selected workstation', () => {
    const state = workingGame();
    expect(getBaseShifts(state, 'player:0')).toBe(2);
    expect(getBaseShifts(state, 'player:1')).toBe(3);
  });

  it('caps maximum usable daily Shifts at four including banked Shifts', () => {
    const source = workingGame();
    const state = {
      ...source,
      players: source.players.map((player) =>
        player.id === 'player:0' ? { ...player, bankedShifts: 9 } : player,
      ),
    };
    expect(getMaximumUsableShifts(state, 'player:0')).toBe(4);
    expect(getMaximumUsableShifts(source, 'player:1')).toBe(3);
  });

  it('offers FINISH_WORK only to the current worker', () => {
    const state = workingGame();
    expect(getLegalCommands(state, 'player:0')).toContainEqual({
      type: 'FINISH_WORK',
      actorId: 'player:0',
    });
    expect(getLegalCommands(state, 'player:1')).toEqual([]);
  });

  it('rejects FINISH_WORK from a non-active player without replacing state', () => {
    const state = workingGame();
    const result = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:1' });
    expect(result).toMatchObject({ status: 'REJECTED', errors: ['NOT_ACTIVE_ACTOR'] });
    expect(result.state).toBe(state);
  });

  it('marks the worker done and advances left-to-right work order', () => {
    const state = workingGame();
    const result = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:0' });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events.map((event) => event.type)).toEqual(['PLAYER_FINISHED_WORK']);
    expect(result.state.players[0]?.done).toBe(true);
    expect(result.state.workCursor).toBe(1);
    expect(result.state.activeActorId).toBe('player:1');
    expect(result.state.phase).toBe('WORK');
  });

  it('keeps pending rewards unavailable until the final worker ends the day', () => {
    const source = workingGame();
    const state = {
      ...source,
      pendingRewards: [
        { playerId: 'player:0' as const, type: 'BANKED_SHIFT' as const, amount: 2 },
        { playerId: 'player:0' as const, type: 'BOOK' as const, amount: 1 },
        { playerId: 'player:0' as const, type: 'VOUCHER' as const, amount: 1 },
      ],
    };

    expect(getMaximumUsableShifts(state, 'player:0')).toBe(2);
    expect(state.players[0]).toMatchObject({ bankedShifts: 0, books: 0, vouchers: 0 });

    const first = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:0' });
    if (first.status !== 'ACCEPTED') throw new Error('first finish failed');
    expect(first.state.pendingRewards).toHaveLength(3);
    expect(first.state.players[0]).toMatchObject({ bankedShifts: 0, books: 0, vouchers: 0 });

    const last = applyCommand(first.state, { type: 'FINISH_WORK', actorId: 'player:1' });
    expect(last.status).toBe('ACCEPTED');
    if (last.status !== 'ACCEPTED') return;
    expect(last.events.map((event) => event.type)).toEqual(['PLAYER_FINISHED_WORK', 'DAY_ENDED']);
    expect(last.state.players[0]).toMatchObject({
      bankedShifts: 2,
      books: 1,
      vouchers: 1,
      previousDepartment: 'TESTING_INNOVATION',
      currentDepartment: null,
      currentWorkstation: null,
      baseShiftsToday: 0,
      shiftsSpentToday: 0,
      done: false,
    });
    expect(last.state.pendingRewards).toEqual([]);
    expect(last.state.dayIndex).toBe(1);
    expect(last.state.phase).toBe('SELECT_DEPARTMENT');
    expect(last.state.selectionCursor).toBe(0);
    expect(last.state.workCursor).toBe(0);
    expect(last.state.workOrder).toEqual([]);
  });

  it('uses today’s left-to-right workstation positions as tomorrow’s selection order', () => {
    const state = workingGame('D_RIGHT', 'A_RIGHT');
    expect(state.workOrder).toEqual(['player:1', 'player:0']);

    const first = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:1' });
    if (first.status !== 'ACCEPTED') throw new Error('first finish failed');
    const last = applyCommand(first.state, { type: 'FINISH_WORK', actorId: 'player:0' });
    if (last.status !== 'ACCEPTED') throw new Error('last finish failed');

    expect(last.state.selectionOrder).toEqual(['player:1', 'player:0']);
    expect(last.state.activeActorId).toBe('player:1');
    expect(last.state.players[0]?.previousDepartment).toBe('DESIGN');
    expect(last.state.players[1]?.previousDepartment).toBe('TESTING_INNOVATION');
  });
});
