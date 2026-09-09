import { describe, expect, it } from 'vitest';
import {
  createShellGame,
  type Department,
} from '../src/index.js';

const DEPARTMENTS: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

describe('Human Resources — state contract', () => {
  it('initializes all five training tracks at zero with deterministic tie order', () => {
    const state = createShellGame({ seed: 'hr-state', playerCount: 4 });
    const expectedOrder = ['player:0', 'player:1', 'player:2', 'player:3'];

    for (const player of state.players) {
      for (const department of DEPARTMENTS) {
        expect(player.training[department]).toBe(0);
      }
      expect(player.certificationPosition).toBe(0);
      expect(player.expertDepartments).toEqual([]);
      expect(player.conferenceSeatsFaceUp).toBe(1);
      expect(player.conferenceSeatsFaceDown).toBe(3);
      expect(player.micromanagedDepartment).toBeNull();
    }

    for (const department of DEPARTMENTS) {
      expect(state.board.trainingTieOrder[department]).toEqual(expectedOrder);
      expect(state.board.expertSeatAvailable[department]).toBe(true);
      expect(state.board.awardPlaquePools[department]).toEqual([]);
    }
  });

  it('keeps HR thresholds in content and remains JSON serializable', () => {
    const state = createShellGame({ seed: 'hr-serialize', playerCount: 2 });

    expect(state.content.trainingRules.certificationLevel).toBe(4);
    expect(state.content.trainingRules.expertLevel).toBe(5);
    expect(state.board.factoryGoals).toEqual([]);
    expect(() => JSON.parse(JSON.stringify(state))).not.toThrow();
  });
});
