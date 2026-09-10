import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  applyCommand,
  createShellGame,
  getFactoryGoalMetric,
  getLegalCommands,
  planFactoryGoalAwards,
  type FactoryGoalId,
  type GameContent,
  type GameState,
} from '../src/index.js';

const goals = {
  cert: 'factory-goal:0' as FactoryGoalId,
  cars: 'factory-goal:1' as FactoryGoalId,
  upgrades: 'factory-goal:2' as FactoryGoalId,
  certTwin: 'factory-goal:3' as FactoryGoalId,
};

function goalContent(): GameContent {
  return {
    ...EMPTY_GAME_CONTENT,
    id: 'synthetic-factory-goals-fixture',
    cars: {
      'car:0': { id: 'car:0', model: 'model:0' },
      'car:1': { id: 'car:1', model: 'model:1' },
    },
    designs: {
      'design:0': { id: 'design:0', model: 'model:0', partType: 'part-type:0', oldestBonus: null },
      'design:1': { id: 'design:1', model: 'model:1', partType: 'part-type:1', oldestBonus: null },
    },
    factoryGoals: {
      [goals.cert]: {
        id: goals.cert,
        category: 'CERTIFICATIONS',
        threshold: 1,
        initialSeatsByPlayerCount: { 2: 1, 3: 2, 4: 2 },
      },
      [goals.cars]: {
        id: goals.cars,
        category: 'CARS',
        threshold: 2,
        initialSeatsByPlayerCount: { 2: 1, 3: 1, 4: 2 },
      },
      [goals.upgrades]: {
        id: goals.upgrades,
        category: 'UPGRADED_DESIGNS',
        threshold: 2,
        initialSeatsByPlayerCount: { 2: 1, 3: 1, 4: 2 },
      },
      [goals.certTwin]: {
        id: goals.certTwin,
        category: 'CERTIFICATIONS',
        threshold: 1,
        initialSeatsByPlayerCount: { 2: 1, 3: 1, 4: 2 },
      },
    },
  };
}

function baseState(activeGoals: readonly FactoryGoalId[] = [goals.cert, goals.cars, goals.upgrades]): GameState {
  const shell = createShellGame({ seed: 'factory-goals', playerCount: 2 });
  return {
    ...shell,
    content: goalContent(),
    phase: 'WORK',
    activeActorId: 'player:0',
    workOrder: ['player:0', 'player:1'],
    workCursor: 0,
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? {
            ...player,
            currentDepartment: 'DESIGN',
            currentWorkstation: 'D_RIGHT',
            baseShiftsToday: 3,
          }
        : player,
    ),
    board: {
      ...shell.board,
      factoryGoals: activeGoals.map((goalId) => ({
        goalId,
        seatsRemaining: goalContent().factoryGoals[goalId]?.initialSeatsByPlayerCount[2] ?? 0,
        claimedBy: [],
      })),
    },
  };
}

function withCertification(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === 'player:0'
        ? { ...player, certifications: ['DESIGN'], training: { ...player.training, DESIGN: 4 } }
        : player,
    ),
  };
}

function withCars(state: GameState): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      cars: {
        ...state.board.cars,
        'car:0': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 0 },
        'car:1': { kind: 'PLAYER', playerId: 'player:0', area: 'garage', slot: 1 },
      },
    },
  };
}

function withUpgrades(state: GameState): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      designs: {
        ...state.board.designs,
        'design:0': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 0 },
        'design:1': { kind: 'PLAYER', playerId: 'player:0', area: 'blueprints', slot: 1 },
      },
      designUpgrades: {
        ...state.board.designUpgrades,
        'design:0': { partType: 'part-type:0', doubleUpgrade: false },
        'design:1': { partType: 'part-type:1', doubleUpgrade: false },
      },
    },
  };
}

describe('Factory Goals — metric and Seat awards', () => {
  it('derives all three metrics strictly from state', () => {
    const state = withUpgrades(withCars(withCertification(baseState())));

    expect(getFactoryGoalMetric(state, 'player:0', 'CERTIFICATIONS')).toBe(1);
    expect(getFactoryGoalMetric(state, 'player:0', 'CARS')).toBe(2);
    expect(getFactoryGoalMetric(state, 'player:0', 'UPGRADED_DESIGNS')).toBe(2);
  });

  it('awards only a newly crossed goal with seats remaining and never awards it twice to one player', () => {
    const before = baseState([goals.cert]);
    const after = withCertification(before);

    expect(planFactoryGoalAwards(before, after)).toEqual([
      expect.objectContaining({
        playerId: 'player:0',
        goalId: goals.cert,
        category: 'CERTIFICATIONS',
        beforeMetric: 0,
        afterMetric: 1,
        threshold: 1,
        seatOutcome: 'FLIP_OWN_SEAT',
      }),
    ]);

    const alreadyClaimed: GameState = {
      ...after,
      board: {
        ...after.board,
        factoryGoals: [{ goalId: goals.cert, seatsRemaining: 1, claimedBy: ['player:0'] }],
      },
    };
    expect(planFactoryGoalAwards(before, alreadyClaimed)).toEqual([]);

    const exhausted: GameState = {
      ...after,
      board: {
        ...after.board,
        factoryGoals: [{ goalId: goals.cert, seatsRemaining: 0, claimedBy: [] }],
      },
    };
    expect(planFactoryGoalAwards(before, exhausted)).toEqual([]);
  });

  it('plans simultaneous crossings deterministically and falls back to a generic Red Seat after own face-down Seats run out', () => {
    const beforeBase = baseState([goals.cert, goals.certTwin]);
    const before: GameState = {
      ...beforeBase,
      players: beforeBase.players.map((player) =>
        player.id === 'player:0'
          ? { ...player, conferenceSeatsFaceDown: 1, conferenceSeatsFaceUp: 1 }
          : player,
      ),
    };
    const awards = planFactoryGoalAwards(before, withCertification(before));

    expect(awards.map((award) => [award.goalId, award.seatOutcome])).toEqual([
      [goals.cert, 'FLIP_OWN_SEAT'],
      [goals.certTwin, 'GAIN_RED_SEAT'],
    ]);
  });

  it('hooks a certification threshold into the accepted command event stream', () => {
    const state = baseState([goals.cert]);
    const prepared: GameState = {
      ...state,
      players: state.players.map((player) =>
        player.id === 'player:0'
          ? { ...player, training: { ...player.training, DESIGN: 3 } }
          : player,
      ),
    };

    const result = applyCommand(prepared, {
      type: 'TRAIN_DEPARTMENT',
      actorId: 'player:0',
      department: 'DESIGN',
      source: 'SHIFT',
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'FACTORY_GOAL_ACHIEVED', goalId: goals.cert }),
    );
    expect(result.state.board.factoryGoals[0]).toEqual({
      goalId: goals.cert,
      seatsRemaining: 0,
      claimedBy: ['player:0'],
    });
    expect(result.state.players[0]?.conferenceSeatsFaceUp).toBe(2);
    expect(result.state.players[0]?.conferenceSeatsFaceDown).toBe(2);
    expect(result.state.players[0]?.genericRedSeats).toBe(0);
  });
});

describe('Factory Goals — explicit Red Seat conversion', () => {
  function convertibleState(phase: GameState['phase'] = 'WORK'): GameState {
    const state = baseState([]);
    return {
      ...state,
      phase,
      players: state.players.map((player) =>
        player.id === 'player:0'
          ? {
              ...player,
              genericRedSeats: 1,
              conferenceSeatsFaceUp: 1,
              conferenceSeatsFaceDown: 1,
            }
          : player,
      ),
    };
  }

  it('exposes a free conversion outside Meeting and flips one own Seat', () => {
    const state = convertibleState();
    expect(getLegalCommands(state, 'player:0')).toContainEqual({
      type: 'CONVERT_RED_SEAT',
      actorId: 'player:0',
    });

    const result = applyCommand(state, { type: 'CONVERT_RED_SEAT', actorId: 'player:0' });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;

    expect(result.events).toContainEqual(expect.objectContaining({ type: 'RED_SEAT_CONVERTED' }));
    expect(result.state.players[0]?.genericRedSeats).toBe(0);
    expect(result.state.players[0]?.conferenceSeatsFaceUp).toBe(2);
    expect(result.state.players[0]?.conferenceSeatsFaceDown).toBe(0);
  });

  it('rejects conversion during Meeting or without both resources', () => {
    const meeting = applyCommand(convertibleState('MEETING'), {
      type: 'CONVERT_RED_SEAT',
      actorId: 'player:0',
    });
    expect(meeting.status).toBe('REJECTED');

    const noRedBase = convertibleState();
    const noRed: GameState = {
      ...noRedBase,
      players: noRedBase.players.map((player) =>
        player.id === 'player:0' ? { ...player, genericRedSeats: 0 } : player,
      ),
    };
    const noRedResult = applyCommand(noRed, { type: 'CONVERT_RED_SEAT', actorId: 'player:0' });
    expect(noRedResult.status).toBe('REJECTED');

    const noSeatBase = convertibleState();
    const noSeat: GameState = {
      ...noSeatBase,
      players: noSeatBase.players.map((player) =>
        player.id === 'player:0' ? { ...player, conferenceSeatsFaceDown: 0 } : player,
      ),
    };
    const noSeatResult = applyCommand(noSeat, { type: 'CONVERT_RED_SEAT', actorId: 'player:0' });
    expect(noSeatResult.status).toBe('REJECTED');
  });
});
