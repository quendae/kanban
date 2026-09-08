import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getBaseShifts,
  getLegalCommands,
  getMaximumUsableShifts,
} from '../src/index.js';

function workingGame() {
  const shell = createShellGame({ seed: 'working-phase', playerCount: 2 });
  const started = applyCommand(shell, { type: 'START_GAME', actorId: 'player:0' });
  if (started.status !== 'ACCEPTED') throw new Error('start failed');
  const p0 = applyCommand(started.state, {
    type: 'SELECT_WORKSTATION',
    actorId: 'player:0',
    workstationId: 'A_LEFT',
  });
  if (p0.status !== 'ACCEPTED') throw new Error('p0 selection failed');
  const p1 = applyCommand(p0.state, {
    type: 'SELECT_WORKSTATION',
    actorId: 'player:1',
    workstationId: 'B_RIGHT',
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
});
