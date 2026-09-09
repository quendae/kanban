import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  type CarId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

function meetingContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'testing-meeting-trigger-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:1' },
      'car:2': { id: 'car:2', model: 'model:2' },
      'car:3': { id: 'car:3', model: 'model:3' },
    },
    designs: {
      'design:0': { id: 'design:0', model: 'model:0', partType: null, oldestBonus: null },
      'design:1': { id: 'design:1', model: 'model:1', partType: null, oldestBonus: null },
      'design:2': { id: 'design:2', model: 'model:2', partType: null, oldestBonus: null },
      'design:3': { id: 'design:3', model: 'model:3', partType: null, oldestBonus: null },
    },
    garageBenefits: [{ kind: 'NONE' }, { kind: 'NONE' }, { kind: 'NONE' }, { kind: 'NONE' }],
  };
}

function meetingState(paceCarPosition: number): GameState {
  const shell = createShellGame({ seed: 'pace-car-meeting', playerCount: 2 });
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'BOARD', area: 'test-track', slot: 0 },
    'car:1': { kind: 'BOARD', area: 'test-track', slot: 1 },
    'car:2': { kind: 'BOARD', area: 'test-track', slot: 2 },
    'car:3': { kind: 'BOARD', area: 'test-track', slot: 3 },
  };
  const designs: Partial<Record<DesignId, EntityLocation>> = {
    'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
    'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
    'design:2': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 2 },
    'design:3': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 3 },
  };

  return {
    ...shell,
    content: meetingContent(),
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
        bankedShifts: 1,
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
      designs,
      paceCarPosition,
      nextMeetingThreshold: 4,
    },
  };
}

function claimOne(state: GameState) {
  return applyCommand(state, {
    type: 'CLAIM_CARS',
    actorId: 'player:0',
    claims: [{ carId: 'car:0', designId: 'design:0', garageSlot: 0 }],
  });
}

describe('Testing & Innovation — Pace Car Meeting trigger', () => {
  it('does not schedule a Meeting while the new Pace Car position remains below the threshold', () => {
    const result = claimOne(meetingState(1));
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.state.board.paceCarPosition).toBe(2);
    expect(result.state.meetingScheduled).toBe(false);
  });

  it('schedules a Meeting immediately when a claim reaches the threshold without interrupting WORK', () => {
    const result = claimOne(meetingState(3));
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.state.board.paceCarPosition).toBe(4);
    expect(result.state.meetingScheduled).toBe(true);
    expect(result.state.phase).toBe('WORK');
    expect(result.state.activeActorId).toBe('player:0');
  });

  it('schedules a Meeting when a multi-car claim crosses the threshold', () => {
    const result = applyCommand(meetingState(3), {
      type: 'CLAIM_CARS',
      actorId: 'player:0',
      claims: [
        { carId: 'car:0', designId: 'design:0', garageSlot: 0 },
        { carId: 'car:1', designId: 'design:1', garageSlot: 1 },
      ],
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.state.board.paceCarPosition).toBe(5);
    expect(result.state.meetingScheduled).toBe(true);
    expect(result.state.phase).toBe('WORK');
  });

  it('materializes the crossed threshold and previous/new Pace Car positions in replay events', () => {
    const result = claimOne(meetingState(3));
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events).toContainEqual(
      expect.objectContaining({
        type: 'MEETING_SCHEDULED',
        previousPaceCarPosition: 3,
        newPaceCarPosition: 4,
        threshold: 4,
      }),
    );
  });
});
