import { describe, expect, it } from 'vitest';
import { applyCommand, createShellGame, getLegalCommands } from '../src/index.js';

function startedGame(playerCount: 2 | 3 | 4 = 3) {
  const shell = createShellGame({ seed: `selection-${playerCount}`, playerCount });
  const result = applyCommand(shell, { type: 'START_GAME', actorId: 'player:0' });
  if (result.status !== 'ACCEPTED') throw new Error('START_GAME failed');
  return result.state;
}

describe('Department Selection', () => {
  it('starts selection with the first seat in the deterministic shell order', () => {
    const state = startedGame(3);
    expect(state.selectionOrder).toEqual(['player:0', 'player:1', 'player:2']);
    expect(state.selectionCursor).toBe(0);
    expect(state.activeActorId).toBe('player:0');
  });

  it('lets only the active actor select a legal non-Sandra workstation', () => {
    const state = startedGame(3);
    const legal = getLegalCommands(state, 'player:0');
    expect(legal).toContainEqual({
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'A_LEFT',
    });
    expect(legal.some((command) => command.type === 'SELECT_WORKSTATION' && command.workstationId === 'F_SANDRA')).toBe(false);
    expect(getLegalCommands(state, 'player:1')).toEqual([]);
  });

  it('records workstation, department and base Shifts then advances the selection actor', () => {
    const state = startedGame(3);
    const result = applyCommand(state, {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'C_RIGHT',
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.state.players[0]).toMatchObject({
      currentWorkstation: 'C_RIGHT',
      currentDepartment: 'LOGISTICS',
      baseShiftsToday: 3,
    });
    expect(result.state.selectionCursor).toBe(1);
    expect(result.state.activeActorId).toBe('player:1');
  });

  it('rejects an occupied workstation and preserves the rejected state reference', () => {
    const first = applyCommand(startedGame(3), {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'A_LEFT',
    });
    if (first.status !== 'ACCEPTED') throw new Error('first selection failed');
    const second = applyCommand(first.state, {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:1',
      workstationId: 'A_LEFT',
    });
    expect(second).toMatchObject({ status: 'REJECTED', errors: ['WORKSTATION_OCCUPIED'] });
    expect(second.state).toBe(first.state);
  });

  it('rejects the same department as the previous day', () => {
    const source = startedGame(3);
    const state = {
      ...source,
      players: source.players.map((player, index) =>
        index === 0 ? { ...player, previousDepartment: 'LOGISTICS' as const } : player,
      ),
    };
    const result = applyCommand(state, {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'C_LEFT',
    });
    expect(result).toMatchObject({
      status: 'REJECTED',
      errors: ['SAME_DEPARTMENT_AS_PREVIOUS_DAY'],
    });
  });

  it('rejects Sandra reserved workstation', () => {
    const result = applyCommand(startedGame(3), {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'F_SANDRA',
    });
    expect(result).toMatchObject({ status: 'REJECTED', errors: ['WORKSTATION_RESERVED'] });
  });

  it('blocks Sandra current department only in a 2-player game', () => {
    const source = startedGame(2);
    const state = { ...source, sandra: { ...source.sandra, department: 'DESIGN' as const } };
    const blocked = applyCommand(state, {
      type: 'SELECT_WORKSTATION',
      actorId: 'player:0',
      workstationId: 'D_LEFT',
    });
    expect(blocked).toMatchObject({ status: 'REJECTED', errors: ['SANDRA_DEPARTMENT_BLOCKED'] });
  });

  it('starts Working Phase in left-to-right workstation order after the last selection', () => {
    const p0 = applyCommand(startedGame(3), {
      type: 'SELECT_WORKSTATION', actorId: 'player:0', workstationId: 'D_RIGHT',
    });
    if (p0.status !== 'ACCEPTED') throw new Error('p0 selection failed');
    const p1 = applyCommand(p0.state, {
      type: 'SELECT_WORKSTATION', actorId: 'player:1', workstationId: 'A_RIGHT',
    });
    if (p1.status !== 'ACCEPTED') throw new Error('p1 selection failed');
    const p2 = applyCommand(p1.state, {
      type: 'SELECT_WORKSTATION', actorId: 'player:2', workstationId: 'C_LEFT',
    });
    expect(p2.status).toBe('ACCEPTED');
    if (p2.status !== 'ACCEPTED') return;
    expect(p2.events.map((event) => event.type)).toEqual([
      'WORKSTATION_SELECTED',
      'WORKING_PHASE_STARTED',
    ]);
    expect(p2.state.phase).toBe('WORK');
    expect(p2.state.workOrder).toEqual(['player:1', 'player:2', 'player:0']);
    expect(p2.state.workCursor).toBe(0);
    expect(p2.state.activeActorId).toBe('player:1');
  });
});
