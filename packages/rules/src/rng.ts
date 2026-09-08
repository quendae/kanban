export interface RngState {
  readonly state: number;
  readonly cursor: number;
}

export interface RngValue<T> {
  readonly value: T;
  readonly rng: RngState;
}

export interface ShuffleResult<T> {
  readonly values: readonly T[];
  readonly rng: RngState;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash >>> 0;
}

export function createRng(seed: string): RngState {
  return {
    state: hashSeed(seed),
    cursor: 0,
  };
}

export function nextUint32(rng: RngState): RngValue<number> {
  const nextState = (rng.state + 0x6d2b79f5) >>> 0;
  let value = nextState;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  value = (value ^ (value >>> 14)) >>> 0;

  return {
    value,
    rng: {
      state: nextState,
      cursor: rng.cursor + 1,
    },
  };
}

export function nextInt(rng: RngState, maxExclusive: number): RngValue<number> {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error('maxExclusive must be a positive integer');
  }

  const draw = nextUint32(rng);
  return {
    value: Math.floor((draw.value / 0x1_0000_0000) * maxExclusive),
    rng: draw.rng,
  };
}

export function shuffle<T>(rng: RngState, items: readonly T[]): ShuffleResult<T> {
  const values = [...items];
  let currentRng = rng;

  for (let index = values.length - 1; index > 0; index -= 1) {
    const draw = nextInt(currentRng, index + 1);
    currentRng = draw.rng;

    const current = values[index]!;
    values[index] = values[draw.value]!;
    values[draw.value] = current;
  }

  return {
    values,
    rng: currentRng,
  };
}
