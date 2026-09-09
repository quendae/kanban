import type { Department } from './enums.js';
import type { PlayerId } from './ids.js';
import type { GameState, MicromanageDepartment } from './model.js';

export const MICROMANAGE_DEPARTMENTS = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
] as const satisfies readonly MicromanageDepartment[];

export function getEffectiveWorkDepartment(
  state: GameState,
  playerId: PlayerId,
): Department | null {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return null;
  if (
    player.currentDepartment === 'ADMINISTRATION' &&
    player.micromanagedDepartment !== null
  ) {
    return player.micromanagedDepartment;
  }
  return player.currentDepartment;
}

export function getTrainableDepartments(
  state: GameState,
  playerId: PlayerId,
): readonly Department[] {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player || player.currentDepartment === null) return [];
  if (
    player.currentDepartment === 'ADMINISTRATION' &&
    player.micromanagedDepartment !== null
  ) {
    return ['ADMINISTRATION', player.micromanagedDepartment];
  }
  return [player.currentDepartment];
}
