import { describe, expect, it } from 'vitest';
import {
  applyCommand,
  createShellGame,
  getMeetingSpeakerOrder,
  type GameState,
} from '../src/index.js';

function orderedState(): GameState {
  const shell = createShellGame({ seed: 'meeting-order', playerCount: 3 });
  const positions = [2, 7, 4] as const;
  return {
    ...shell,
    players: shell.players.map((player, index) => ({
      ...player,
      certificationPosition: positions[index]!,
    })),
  };
}

function scheduledFinalWorkerState(): GameState {
  const shell = orderedState();
  return {
    ...shell,
    dayIndex: 1,
    phase: 'WORK',
    meetingScheduled: true,
    activeActorId: 'player:0',
    workOrder: ['player:1', 'player:2', 'player:0'],
    workCursor: 2,
    sandra: {
      ...shell.sandra,
      department: 'LOGISTICS',
      workstation: 'C_LEFT',
    },
    players: shell.players.map((player) => {
      if (player.id === 'player:0') {
        return {
          ...player,
          currentDepartment: 'TESTING_INNOVATION',
          currentWorkstation: 'A_LEFT',
          baseShiftsToday: 2,
        };
      }
      return { ...player, done: true };
    }),
  };
}

describe('M5 Meeting entry', () => {
  it('orders speakers by descending Certification Track position', () => {
    expect(getMeetingSpeakerOrder(orderedState())).toEqual([
      'player:1',
      'player:2',
      'player:0',
    ]);
  });

  it('enters Meeting after the final worker completes a day with a scheduled Meeting', () => {
    const result = applyCommand(scheduledFinalWorkerState(), {
      type: 'FINISH_WORK',
      actorId: 'player:0',
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events.map((event) => event.type)).toContain('MEETING_STARTED');
    expect(result.state.phase).toBe('MEETING');
    expect(result.state.meeting).toMatchObject({
      active: true,
      speakerOrder: ['player:1', 'player:2', 'player:0'],
      speakerCursor: 0,
      consecutivePasses: 0,
    });
    expect(result.state.activeActorId).toBe('player:1');
    expect(result.state.dayIndex).toBe(2);
  });
});
