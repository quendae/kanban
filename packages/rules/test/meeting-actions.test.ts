import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  applyCommand,
  createShellGame,
  getLegalCommands,
  type GameState,
  type PerformanceGoalId,
} from '../src/index.js';

const CENTRAL_GOAL = 'performance-goal:0' as PerformanceGoalId;
const PET_PROJECT = 'performance-goal:1' as PerformanceGoalId;

function meetingState(options: {
  readonly faceUpSeats?: number;
  readonly redSeats?: number;
  readonly petRevealed?: boolean;
  readonly spokenCentral?: boolean;
} = {}): GameState {
  const shell = createShellGame({ seed: 'meeting-actions', playerCount: 2 });
  return {
    ...shell,
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'meeting-actions-fixture',
      authoritative: false,
      performanceGoals: {
        [CENTRAL_GOAL]: {
          id: CENTRAL_GOAL,
          condition: { metric: 'CARS', operator: 'GTE', value: 0 },
          basePP: 2,
          firstMultiplier: 3,
        },
        [PET_PROJECT]: {
          id: PET_PROJECT,
          condition: { metric: 'CARS', operator: 'GTE', value: 0 },
          basePP: 1,
          firstMultiplier: 2,
        },
      },
    },
    phase: 'MEETING',
    activeActorId: 'player:0',
    meetingScheduled: true,
    meeting: {
      active: true,
      speakerOrder: ['player:0', 'player:1'],
      speakerCursor: 0,
      consecutivePasses: 0,
      revealedPetProjects: options.petRevealed ? ['player:0'] : [],
      spokenGoalsByPlayer: options.spokenCentral
        ? { 'player:0': [CENTRAL_GOAL] }
        : {},
      usedSeatsByPlayer: {},
      replenishmentChoicesPending: [],
      nextGoalChoices: {},
    },
    board: {
      ...shell.board,
      performanceGoalDisplay: [CENTRAL_GOAL],
    },
    performanceGoalHands: {
      'player:0': options.petRevealed ? [] : [PET_PROJECT],
      'player:1': [],
    },
    players: shell.players.map((player) =>
      player.id === 'player:0'
        ? {
            ...player,
            conferenceSeatsFaceUp: options.faceUpSeats ?? 1,
            conferenceSeatsFaceDown: 4 - (options.faceUpSeats ?? 1),
            genericRedSeats: options.redSeats ?? 0,
          }
        : player,
    ),
  };
}

describe('Original 2014 Meeting actions', () => {
  it('requires the pet project before Pass and allows revealing it exactly once from hand', () => {
    const source = meetingState();

    const earlyPass = applyCommand(source, { type: 'PASS_MEETING', actorId: 'player:0' });
    expect(earlyPass).toMatchObject({
      status: 'REJECTED',
      errors: ['MEETING_PET_PROJECT_REQUIRED'],
    });

    expect(getLegalCommands(source, 'player:0')).toContainEqual({
      type: 'REVEAL_PET_PROJECT',
      actorId: 'player:0',
      goalId: PET_PROJECT,
    });

    const reveal = applyCommand(source, {
      type: 'REVEAL_PET_PROJECT',
      actorId: 'player:0',
      goalId: PET_PROJECT,
    });
    expect(reveal.status).toBe('ACCEPTED');
    if (reveal.status !== 'ACCEPTED') return;
    expect(reveal.events.map((event) => event.type)).toEqual(['PET_PROJECT_REVEALED']);
    expect(reveal.state.meeting.revealedPetProjects).toEqual(['player:0']);
    expect(reveal.state.performanceGoalHands['player:0']).toEqual([]);
    expect(reveal.state.board.performanceGoalDisplay).toEqual([CENTRAL_GOAL, PET_PROJECT]);
    expect(reveal.state.activeActorId).toBe('player:0');

    const duplicate = applyCommand(reveal.state, {
      type: 'REVEAL_PET_PROJECT',
      actorId: 'player:0',
      goalId: PET_PROJECT,
    });
    expect(duplicate).toMatchObject({
      status: 'REJECTED',
      errors: ['MEETING_PET_PROJECT_ALREADY_REVEALED', 'MEETING_PET_PROJECT_NOT_IN_HAND'],
    });

    const pass = applyCommand(reveal.state, { type: 'PASS_MEETING', actorId: 'player:0' });
    expect(pass.status).toBe('ACCEPTED');
    if (pass.status !== 'ACCEPTED') return;
    expect(pass.events.map((event) => event.type)).toEqual(['MEETING_PLAYER_PASSED']);
    expect(pass.state.meeting.consecutivePasses).toBe(1);
    expect(pass.state.activeActorId).toBe('player:1');
  });

  it('requires an own-color face-up Seat to Speak; Red Seats alone cannot speak', () => {
    const noOwnSeat = meetingState({ faceUpSeats: 0, redSeats: 3, petRevealed: true });
    const rejected = applyCommand(noOwnSeat, {
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:0',
      goalId: CENTRAL_GOAL,
    });
    expect(rejected).toMatchObject({
      status: 'REJECTED',
      errors: ['MEETING_FACE_UP_SEAT_REQUIRED'],
    });

    const source = meetingState({ faceUpSeats: 1, redSeats: 3, petRevealed: true });
    const result = applyCommand(source, {
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:0',
      goalId: CENTRAL_GOAL,
    });
    expect(result.status).toBe('ACCEPTED');
    if (result.status !== 'ACCEPTED') return;
    expect(result.events).toEqual([
      expect.objectContaining({
        type: 'MEETING_GOAL_SCORED',
        playerId: 'player:0',
        goalId: CENTRAL_GOAL,
        ppAwarded: 6,
      }),
    ]);
    expect(result.state.players[0]).toMatchObject({
      pp: 6,
      conferenceSeatsFaceUp: 0,
      genericRedSeats: 3,
    });
    expect(result.state.meeting.spokenGoalsByPlayer['player:0']).toEqual([CENTRAL_GOAL]);
    expect(result.state.meeting.usedSeatsByPlayer['player:0']).toBe(1);
    expect(result.state.activeActorId).toBe('player:1');
  });

  it('rejects speaking on the same Performance Goal twice by the same player', () => {
    const state = meetingState({ faceUpSeats: 1, petRevealed: true, spokenCentral: true });
    const result = applyCommand(state, {
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:0',
      goalId: CENTRAL_GOAL,
    });
    expect(result).toMatchObject({
      status: 'REJECTED',
      errors: ['MEETING_GOAL_ALREADY_SCORED'],
    });
  });
});
