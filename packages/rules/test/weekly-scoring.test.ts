import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  MODEL_IDS,
  PART_TYPE_IDS,
  applyCommand,
  createShellGame,
  scoreEndOfWeek,
  type CarId,
  type DesignId,
  type EntityLocation,
  type GameContent,
  type GameState,
} from '../src/index.js';

function weeklyContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'weekly-scoring-fixture',
    authoritative: false,
    models: MODEL_IDS,
    partTypes: PART_TYPE_IDS,
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:0' },
      'car:2': { id: 'car:2', model: 'model:1' },
      'car:3': { id: 'car:3', model: 'model:2' },
    },
    designs: {
      'design:0': { id: 'design:0', model: 'model:0', partType: 'part-type:0', oldestBonus: null },
      'design:1': { id: 'design:1', model: 'model:0', partType: 'part-type:1', oldestBonus: null },
      'design:2': { id: 'design:2', model: 'model:1', partType: 'part-type:2', oldestBonus: null },
      'design:3': { id: 'design:3', model: 'model:1', partType: 'part-type:3', oldestBonus: null },
    },
  };
}

function weeklyState(): GameState {
  const shell = createShellGame({ seed: 'weekly-scoring', playerCount: 3 });
  const cars: Partial<Record<CarId, EntityLocation>> = {
    'car:0': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
    'car:1': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 1 },
    'car:2': { kind: 'PLAYER', playerId: 'player:1', area: 'garage', slot: 0 },
    'car:3': { kind: 'PLAYER', playerId: 'player:2', area: 'garage', slot: 0 },
  };
  const designs: Partial<Record<DesignId, EntityLocation>> = {
    'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
    'design:1': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 0 },
    'design:2': { kind: 'PLAYER', playerId: 'player:1', area: 'blueprints', slot: 1 },
    'design:3': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
  };

  return {
    ...shell,
    content: weeklyContent(),
    board: {
      ...shell.board,
      cars,
      designs,
      designUpgrades: {
        'design:0': { partType: 'part-type:0', doubleUpgrade: false },
        'design:1': { partType: 'part-type:1', doubleUpgrade: false },
        'design:2': { partType: 'part-type:2', doubleUpgrade: false },
        'design:3': { partType: 'part-type:3', doubleUpgrade: false },
      },
    },
  };
}

describe('Original 2014 End-of-Week scoring', () => {
  it('scores own upgrades for 2 PP and other-player upgrades for 1 PP per matching garage car', () => {
    const scores = scoreEndOfWeek(weeklyState());
    const p0 = scores.find((score) => score.playerId === 'player:0');

    expect(p0).toEqual({
      playerId: 'player:0',
      models: [
        {
          model: 'model:0',
          garageCars: 2,
          ownUpgrades: 1,
          otherUpgrades: 1,
          pointsPerCar: 3,
          points: 6,
        },
      ],
      total: 6,
    });
  });

  it('does not score upgraded models without a matching garage car', () => {
    const p0 = scoreEndOfWeek(weeklyState()).find((score) => score.playerId === 'player:0');
    expect(p0?.models.map((model) => model.model)).toEqual(['model:0']);
    expect(p0?.total).toBe(6);
  });

  it('keeps a zero-point breakdown for a garage model that has no upgrades', () => {
    const p2 = scoreEndOfWeek(weeklyState()).find((score) => score.playerId === 'player:2');
    expect(p2).toEqual({
      playerId: 'player:2',
      models: [
        {
          model: 'model:2',
          garageCars: 1,
          ownUpgrades: 0,
          otherUpgrades: 0,
          pointsPerCar: 0,
          points: 0,
        },
      ],
      total: 0,
    });
  });

  it('returns independent human-readable totals for every player', () => {
    const scores = scoreEndOfWeek(weeklyState());
    expect(scores.map((score) => ({ playerId: score.playerId, total: score.total }))).toEqual([
      { playerId: 'player:0', total: 6 },
      { playerId: 'player:1', total: 3 },
      { playerId: 'player:2', total: 0 },
    ]);
  });

  it('advances Week and applies the weekly breakdown when Sandra visits Administration', () => {
    const source = weeklyState();
    const state: GameState = {
      ...source,
      phase: 'WORK',
      week: 1,
      activeActorId: 'player:0',
      workOrder: ['player:1', 'player:2', 'player:0'],
      workCursor: 2,
      sandra: {
        ...source.sandra,
        department: 'DESIGN',
        workstation: 'D_LEFT',
        mode: 'NICE',
      },
      players: source.players.map((player) => {
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

    const result = applyCommand(state, { type: 'FINISH_WORK', actorId: 'player:0' });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events.map((event) => event.type)).toEqual([
      'PLAYER_FINISHED_WORK',
      'SANDRA_MOVED',
      'SANDRA_AUDIT_RESOLVED',
      'SANDRA_DEPARTMENT_TASK_RESOLVED',
      'WEEK_ADVANCED',
      'END_OF_WEEK_SCORED',
      'DAY_ENDED',
    ]);
    expect(result.state.week).toBe(2);
    expect(result.state.players.map((player) => player.pp)).toEqual([6, 3, 0]);

    const scoringEvent = result.events.find((event) => event.type === 'END_OF_WEEK_SCORED');
    expect(scoringEvent).toMatchObject({
      type: 'END_OF_WEEK_SCORED',
      scores: expect.arrayContaining([
        expect.objectContaining({ playerId: 'player:0', total: 6 }),
        expect.objectContaining({ playerId: 'player:1', total: 3 }),
        expect.objectContaining({ playerId: 'player:2', total: 0 }),
      ]),
    });
  });
});
