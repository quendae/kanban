import { describe, expect, it } from 'vitest';
import {
  EMPTY_GAME_CONTENT,
  applyCommand,
  createShellGame,
  getLegalCommands,
  type GameState,
  type PerformanceGoalId,
} from '../src/index.js';

function goal(index: number): PerformanceGoalId {
  return `performance-goal:${index}` as PerformanceGoalId;
}

function meetingFixture(): GameState {
  const shell = createShellGame({ seed: 'meeting-completion', playerCount: 2 });
  const performanceGoals = Object.fromEntries(
    Array.from({ length: 16 }, (_, index) => [
      goal(index),
      {
        id: goal(index),
        condition: { metric: 'CARS' as const, operator: 'GTE' as const, value: 0 },
        basePP: 1,
        firstMultiplier: 3,
      },
    ]),
  );

  return {
    ...shell,
    content: {
      ...EMPTY_GAME_CONTENT,
      id: 'meeting-completion-fixture',
      authoritative: false,
      performanceGoals,
    },
    phase: 'MEETING',
    meetingScheduled: true,
    activeActorId: 'player:0',
    meeting: {
      active: true,
      speakerOrder: ['player:0', 'player:1'],
      speakerCursor: 0,
      consecutivePasses: 0,
      revealedPetProjects: ['player:0', 'player:1'],
      spokenGoalsByPlayer: {},
      usedSeatsByPlayer: { 'player:0': 2, 'player:1': 1 },
      replenishmentChoicesPending: [],
      nextGoalChoices: {},
    },
    board: {
      ...shell.board,
      performanceGoalDisplay: [goal(0), goal(1), goal(2), goal(3), goal(4), goal(5)],
    },
    performanceGoalHands: {
      'player:0': [goal(6), goal(7)],
      'player:1': [goal(8), goal(9)],
    },
    performanceGoalDeck: [goal(10), goal(11), goal(12), goal(13), goal(14), goal(15)],
    performanceGoalDiscard: [],
    players: shell.players.map((player) => {
      if (player.id === 'player:0') {
        return { ...player, conferenceSeatsFaceUp: 1, conferenceSeatsFaceDown: 1 };
      }
      return { ...player, conferenceSeatsFaceUp: 2, conferenceSeatsFaceDown: 1 };
    }),
  };
}

describe('Original 2014 Meeting completion', () => {
  it('resets consecutive passes when somebody acts and allows an earlier passer to re-enter', () => {
    const source = meetingFixture();
    const firstPass = applyCommand(source, { type: 'PASS_MEETING', actorId: 'player:0' });
    expect(firstPass.status).toBe('ACCEPTED');
    if (firstPass.status !== 'ACCEPTED') return;
    expect(firstPass.state.meeting.consecutivePasses).toBe(1);
    expect(firstPass.state.activeActorId).toBe('player:1');

    const speak = applyCommand(firstPass.state, {
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:1',
      goalId: goal(0),
    });
    expect(speak.status).toBe('ACCEPTED');
    if (speak.status !== 'ACCEPTED') return;
    expect(speak.state.meeting.consecutivePasses).toBe(0);
    expect(speak.state.activeActorId).toBe('player:0');

    expect(getLegalCommands(speak.state, 'player:0')).toContainEqual({
      type: 'SPEAK_AT_MEETING',
      actorId: 'player:0',
      goalId: goal(0),
    });
  });

  it('starts replenishment after all players pass consecutively', () => {
    const source = meetingFixture();
    const p0 = applyCommand(source, { type: 'PASS_MEETING', actorId: 'player:0' });
    if (p0.status !== 'ACCEPTED') throw new Error('p0 pass failed');
    const p1 = applyCommand(p0.state, { type: 'PASS_MEETING', actorId: 'player:1' });
    expect(p1.status).toBe('ACCEPTED');
    if (p1.status !== 'ACCEPTED') return;

    expect(p1.events.map((event) => event.type)).toEqual([
      'MEETING_PLAYER_PASSED',
      'MEETING_REPLENISHMENT_STARTED',
    ]);
    expect(p1.state.meeting.replenishmentChoicesPending).toEqual(['player:0', 'player:1']);
    expect(p1.state.activeActorId).toBe('player:0');
    expect(getLegalCommands(p1.state, 'player:0')).toEqual([
      { type: 'CHOOSE_NEXT_MEETING_GOAL', actorId: 'player:0', goalId: goal(6) },
      { type: 'CHOOSE_NEXT_MEETING_GOAL', actorId: 'player:0', goalId: goal(7) },
    ]);
  });

  it('uses explicit player choices, fills to four goals, draws two cards each and flips only used Seats face-down', () => {
    const source = meetingFixture();
    const p0Pass = applyCommand(source, { type: 'PASS_MEETING', actorId: 'player:0' });
    if (p0Pass.status !== 'ACCEPTED') throw new Error('p0 pass failed');
    const p1Pass = applyCommand(p0Pass.state, { type: 'PASS_MEETING', actorId: 'player:1' });
    if (p1Pass.status !== 'ACCEPTED') throw new Error('p1 pass failed');

    const p0Choice = applyCommand(p1Pass.state, {
      type: 'CHOOSE_NEXT_MEETING_GOAL',
      actorId: 'player:0',
      goalId: goal(6),
    });
    expect(p0Choice.status).toBe('ACCEPTED');
    if (p0Choice.status !== 'ACCEPTED') return;
    expect(p0Choice.state.performanceGoalHands['player:0']).toEqual([goal(7)]);
    expect(p0Choice.state.activeActorId).toBe('player:1');

    const p1Choice = applyCommand(p0Choice.state, {
      type: 'CHOOSE_NEXT_MEETING_GOAL',
      actorId: 'player:1',
      goalId: goal(8),
    });
    expect(p1Choice.status).toBe('ACCEPTED');
    if (p1Choice.status !== 'ACCEPTED') return;

    expect(p1Choice.events.map((event) => event.type)).toEqual([
      'NEXT_MEETING_GOAL_CHOSEN',
      'MEETING_COMPLETED',
    ]);
    expect(p1Choice.state.board.performanceGoalDisplay).toEqual([
      goal(6), goal(8), goal(10), goal(11),
    ]);
    expect(p1Choice.state.performanceGoalHands).toEqual({
      'player:0': [goal(7), goal(12), goal(13)],
      'player:1': [goal(9), goal(14), goal(15)],
    });
    expect(p1Choice.state.performanceGoalDeck).toEqual([]);
    expect(p1Choice.state.performanceGoalDiscard).toEqual([
      goal(0), goal(1), goal(2), goal(3), goal(4), goal(5),
    ]);
    expect(p1Choice.state.players[0]).toMatchObject({
      conferenceSeatsFaceUp: 1,
      conferenceSeatsFaceDown: 3,
    });
    expect(p1Choice.state.players[1]).toMatchObject({
      conferenceSeatsFaceUp: 2,
      conferenceSeatsFaceDown: 2,
    });
    expect(p1Choice.state.meeting.active).toBe(false);
    expect(p1Choice.state.meetingScheduled).toBe(false);
    expect(p1Choice.state.phase).toBe('SELECT_DEPARTMENT');
    expect(p1Choice.state.activeActorId).toBe(p1Choice.state.selectionOrder[0]);
    expect(p1Choice.state.productionCycle).toBe(0);
  });
});
