export type PlayerId = `player:${number}`;
export type CarId = `car:${number}`;
export type PartId = `part:${number}`;
export type DesignId = `design:${number}`;
export type KanbanOrderId = `kanban-order:${number}`;
export type DemandId = `demand:${number}`;
export type AssemblyNodeId = `assembly-node:${string}`;
export type UpgradeSpaceId = `upgrade-space:${number}`;
export type AwardPlaqueId = `award-plaque:${number}`;
export type FactoryGoalId = `factory-goal:${number}`;
export type PerformanceGoalId = `performance-goal:${number}`;
export type FinalGoalId = `final-goal:${number}`;
export type EventId = `event:${number}`;

export function makeId(namespace: 'player', index: number): PlayerId;
export function makeId(namespace: 'car', index: number): CarId;
export function makeId(namespace: 'part', index: number): PartId;
export function makeId(namespace: 'design', index: number): DesignId;
export function makeId(namespace: 'kanban-order', index: number): KanbanOrderId;
export function makeId(namespace: 'demand', index: number): DemandId;
export function makeId(namespace: 'upgrade-space', index: number): UpgradeSpaceId;
export function makeId(namespace: 'award-plaque', index: number): AwardPlaqueId;
export function makeId(namespace: 'factory-goal', index: number): FactoryGoalId;
export function makeId(namespace: 'performance-goal', index: number): PerformanceGoalId;
export function makeId(namespace: 'final-goal', index: number): FinalGoalId;
export function makeId(namespace: 'event', index: number): EventId;
export function makeId(namespace: string, index: number): `${string}:${number}` {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid ID index: ${index}`);
  }

  return `${namespace}:${index}`;
}
