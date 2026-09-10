import type { PlayerId } from './ids.js';
import type { GameState } from './model.js';

export function getMeetingSpeakerOrder(state: GameState): readonly PlayerId[] {
  return [...state.players]
    .sort((left, right) => {
      const positionDifference = right.certificationPosition - left.certificationPosition;
      return positionDifference !== 0
        ? positionDifference
        : left.id.localeCompare(right.id);
    })
    .map((player) => player.id);
}
