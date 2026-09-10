import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getEffectiveWorkDepartment,
  getLegalCommands,
  type GameState,
} from '../src/index.js';

function administrationState(): GameState {
  const shell = createShellGame({ seed: 'administration-micromanagement', playerCount: 2 });
  return {
    ...shell,
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:1', 'player:0'],
    workCursor: 1,
    players: shell.players.map((player) => {
      if (player.id === 'player:0') {
        return {
          ...player,
          currentDepartment: 'ADMINISTRATION',
          currentWorkstation: 'E_RIGHT',
          baseShiftsToday: 2,
          books: 1,
        };
      }
      return { ...player, done: true };
    }),
  };
}

describe('Administration micromanagement', () => {
  it('offers exactly the four non-Administration departments before a target is chosen', () => {
    const commands = getLegalCommands(administrationState(), 'player:0').filter(
      (command) => command.type === 'START_MICROMANAGE',
    );

    expect(commands).toEqual([
      { type: 'START_MICROMANAGE', actorId: 'player:0', department: 'TESTING_INNOVATION' },
      { type: 'START_MICROMANAGE', actorId: 'player:0', department: 'ASSEMBLY' },
      { type: 'START_MICROMANAGE', actorId: 'player:0', department: 'LOGISTICS' },
      { type: 'START_MICROMANAGE', actorId: 'player:0', department: 'DESIGN' },
    ]);
  });

  it('locks the target for the day and exposes that department actions through the same rules engine', () => {
    const result = applyCommand(administrationState(), {
      type: 'START_MICROMANAGE',
      actorId: 'player:0',
      department: 'DESIGN',
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'MICROMANAGE_STARTED', department: 'DESIGN' }),
    );
    expect(result.state.players[0]?.currentDepartment).toBe('ADMINISTRATION');
    expect(result.state.players[0]?.micromanagedDepartment).toBe('DESIGN');
    expect(getEffectiveWorkDepartment(result.state, 'player:0')).toBe('DESIGN');

    const legal = getLegalCommands(result.state, 'player:0');
    expect(legal).toContainEqual({ type: 'START_DESIGN_SELECTION', actorId: 'player:0' });
    expect(legal).toContainEqual({
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'DESIGN',
      source: 'SHIFT',
    });
    expect(legal).toContainEqual({
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'ADMINISTRATION',
      source: 'SHIFT',
    });
    expect(legal.some(
      (command) => command.type === 'TRAIN_DEPARTMENT' && command.department === 'LOGISTICS',
    )).toBe(false);
    expect(legal.some((command) => command.type === 'START_MICROMANAGE')).toBe(false);
  });

  it('rejects changing the micromanaged department once selected', () => {
    const first = applyCommand(administrationState(), {
      type: 'START_MICROMANAGE',
      actorId: 'player:0',
      department: 'DESIGN',
    });
    expect(first.status).toBe('ACCEPTED');
    if (first.status !== 'ACCEPTED') return;

    const second = applyCommand(first.state, {
      type: 'START_MICROMANAGE',
      actorId: 'player:0',
      department: 'LOGISTICS',
    });
    expect(second.status).toBe('REJECTED');
    if (second.status !== 'REJECTED') return;
    expect(second.errors).toContain('MICROMANAGE_ALREADY_SELECTED');
  });

  it('clears the target at the day boundary while preserving Administration as the previous physical department', () => {
    const started = applyCommand(administrationState(), {
      type: 'START_MICROMANAGE',
      actorId: 'player:0',
      department: 'ASSEMBLY',
    });
    expect(started.status).toBe('ACCEPTED');
    if (started.status !== 'ACCEPTED') return;

    const finished = applyCommand(started.state, { type: 'FINISH_WORK', actorId: 'player:0' });
    expect(finished.status).toBe('ACCEPTED');
    if (finished.status !== 'ACCEPTED') return;

    expect(finished.state.players[0]?.micromanagedDepartment).toBeNull();
    expect(finished.state.players[0]?.previousDepartment).toBe('ADMINISTRATION');
    expect(finished.state.players[0]?.currentDepartment).toBeNull();
  });
});
