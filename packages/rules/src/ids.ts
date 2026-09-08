export type PlayerId = `player:${number}`;
export type CarId = `car:${number}`;
export type PartId = `part:${number}`;
export type DesignId = `design:${number}`;
export type EventId = `event:${number}`;

export function makeId(namespace: 'player', index: number): PlayerId;
export function makeId(namespace: 'car', index: number): CarId;
export function makeId(namespace: 'part', index: number): PartId;
export function makeId(namespace: 'design', index: number): DesignId;
export function makeId(namespace: 'event', index: number): EventId;
export function makeId(namespace: string, index: number): `${string}:${number}` {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error(`Invalid ID index: ${index}`);
  }

  return `${namespace}:${index}`;
}
