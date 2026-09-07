# Kanban Slice 0 — Foundation + Rules Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a buildable React/TypeScript workspace and a deterministic, UI-independent rules kernel that can create a shell game state, validate commands, emit events, reduce state and enforce invariants.

**Architecture:** `apps/web` is only a thin Vite/React shell. All game-domain primitives live in `packages/rules`, which has no DOM/browser dependencies. State changes pass through `Command -> validate -> GameEvent[] -> reducer -> invariants`; randomness is immutable seeded state, never `Math.random()`.

**Tech Stack:** pnpm workspaces, TypeScript strict mode, React, Vite, Vitest, ESLint, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-kanban-digital-adaptation-design.md`

## Global Constraints

- Ruleset identifier is exactly `KANBAN_AR_2014`.
- V1 is single-player: 1 human plus 1–3 bots; multiplayer is deferred.
- `packages/rules` must not import React, Vite, DOM APIs or browser storage.
- No `Math.random()` inside `packages/rules`, `packages/ai` or `packages/testkit`.
- Every accepted command returns events; reducers are the only state-mutating concept.
- Reducers are implemented as pure functions returning new state.
- Every command result is either `Accepted` with events/new state or `Rejected` with stable reason codes.
- TypeScript is strict; CI runs typecheck, unit tests and build.
- Original copyrighted graphics are never committed to the repository.

---

## Planned file structure for Slice 0

```text
.github/
  workflows/
    ci.yml
apps/
  web/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    src/
      App.tsx
      main.tsx
      styles.css
packages/
  rules/
    package.json
    tsconfig.json
    src/
      constants.ts
      enums.ts
      ids.ts
      model.ts
      rng.ts
      commands.ts
      events.ts
      errors.ts
      reducer.ts
      engine.ts
      invariants.ts
      create-game.ts
      index.ts
    test/
      ids.test.ts
      rng.test.ts
      create-game.test.ts
      engine.test.ts
      invariants.test.ts
.gitignore
eslint.config.js
package.json
pnpm-workspace.yaml
tsconfig.base.json
```

---

### Task 1: Bootstrap the workspace and CI

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `eslint.config.js`
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `packages/rules/package.json`
- Create: `packages/rules/tsconfig.json`
- Create: `packages/rules/src/index.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces workspace package `@kanban/rules` imported by `@kanban/web`.
- Produces root commands: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`.

- [ ] **Step 1: Create root workspace metadata**

`package.json`:

```json
{
  "name": "kanban-digital",
  "private": true,
  "packageManager": "pnpm@10",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "@eslint/js": "latest",
    "eslint": "latest",
    "typescript": "latest",
    "typescript-eslint": "latest"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

- [ ] **Step 2: Add strict shared TypeScript configuration**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Scaffold `@kanban/rules` with Vitest**

`packages/rules/package.json`:

```json
{
  "name": "@kanban/rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json --noEmit",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "lint": "eslint src test"
  },
  "devDependencies": {
    "vitest": "latest"
  }
}
```

`packages/rules/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Scaffold the React/Vite shell**

Create `@kanban/web` using React + TypeScript. `App.tsx` must render only:

```tsx
export function App() {
  return (
    <main className="boot-shell">
      <h1>Kanban: Automotive Revolution</h1>
      <p>Original 2014 rules engine bootstrap</p>
    </main>
  );
}
```

Do not build board UI in Slice 0.

- [ ] **Step 5: Add repository-safe asset ignore rules**

`.gitignore` must include:

```gitignore
node_modules/
dist/
coverage/
.vite/
.DS_Store

# Local-only copyrighted/reference assets
apps/web/public/assets/original-test/
```

- [ ] **Step 6: Add GitHub Actions CI**

`.github/workflows/ci.yml` runs on pushes and pull requests using Node 22 and pnpm, then:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

- [ ] **Step 7: Install and run the empty workspace**

Run:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit `0`.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: bootstrap Kanban TypeScript workspace"
```

---

### Task 2: Define stable IDs, enums and constants

**Files:**
- Create: `packages/rules/src/constants.ts`
- Create: `packages/rules/src/enums.ts`
- Create: `packages/rules/src/ids.ts`
- Create: `packages/rules/test/ids.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `RulesetId`, `GamePhase`, `Department`, `ActorKind`, `PlayerCount`.
- Produces branded IDs and `makeId()` used by all later model types.

- [ ] **Step 1: Write failing ID tests**

`packages/rules/test/ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeId } from '../src/ids.js';

describe('makeId', () => {
  it('creates deterministic namespaced IDs', () => {
    expect(makeId('player', 0)).toBe('player:0');
    expect(makeId('car', 17)).toBe('car:17');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
pnpm --filter @kanban/rules test -- ids.test.ts
```

Expected: FAIL because `ids.ts` does not exist.

- [ ] **Step 3: Implement constants/enums/IDs**

`constants.ts`:

```ts
export const RULESET_ID = 'KANBAN_AR_2014' as const;
export const MAX_SHIFTS_PER_DAY = 4 as const;
```

`enums.ts`:

```ts
export type RulesetId = typeof import('./constants.js').RULESET_ID;
export type PlayerCount = 2 | 3 | 4;

export type GamePhase =
  | 'SETUP'
  | 'SELECT_DEPARTMENT'
  | 'WORK'
  | 'END_OF_DAY'
  | 'MEETING'
  | 'WEEKLY_SCORE'
  | 'FINAL_SCORE'
  | 'GAME_OVER';

export type Department =
  | 'DESIGN'
  | 'LOGISTICS'
  | 'ASSEMBLY'
  | 'TESTING_INNOVATION'
  | 'ADMINISTRATION';

export type ActorKind = 'HUMAN' | 'BOT' | 'SANDRA';
```

`ids.ts`:

```ts
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
```

- [ ] **Step 4: Export the public API and run tests**

Update `src/index.ts` to export constants, enums and IDs.

Run:

```bash
pnpm --filter @kanban/rules test
pnpm --filter @kanban/rules typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rules
 git commit -m "feat: define core Kanban domain identifiers"
```

---

### Task 3: Implement immutable seeded RNG

**Files:**
- Create: `packages/rules/src/rng.ts`
- Create: `packages/rules/test/rng.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `RngState`.
- Produces `createRng(seed)`, `nextUint32(rng)`, `nextInt(rng, maxExclusive)`, `shuffle(rng, items)`.
- Every RNG operation returns a new RNG state and never mutates input.

- [ ] **Step 1: Write failing deterministic RNG tests**

```ts
import { describe, expect, it } from 'vitest';
import { createRng, nextInt, nextUint32, shuffle } from '../src/rng.js';

describe('seeded RNG', () => {
  it('replays identical values for the same seed', () => {
    const a0 = createRng('kanban-seed');
    const b0 = createRng('kanban-seed');
    const a1 = nextUint32(a0);
    const b1 = nextUint32(b0);
    expect(a1.value).toBe(b1.value);
    expect(a1.rng).toEqual(b1.rng);
  });

  it('does not mutate the input state', () => {
    const rng = createRng('immutable');
    const snapshot = structuredClone(rng);
    nextUint32(rng);
    expect(rng).toEqual(snapshot);
  });

  it('produces bounded integers', () => {
    const { value } = nextInt(createRng('bounded'), 5);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(5);
  });

  it('shuffles deterministically without changing the source array', () => {
    const source = [1, 2, 3, 4, 5];
    const resultA = shuffle(createRng('shuffle'), source);
    const resultB = shuffle(createRng('shuffle'), source);
    expect(resultA.values).toEqual(resultB.values);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });
});
```

- [ ] **Step 2: Verify tests fail**

```bash
pnpm --filter @kanban/rules test -- rng.test.ts
```

- [ ] **Step 3: Implement RNG using explicit 32-bit state**

Use a deterministic string hash to initialize a 32-bit state, then a fixed integer-only PRNG step. The implementation must use `Math.imul` and unsigned `>>> 0` coercions so results remain stable in JavaScript runtimes.

Public state:

```ts
export interface RngState {
  readonly state: number;
  readonly cursor: number;
}
```

Every call increments `cursor` by exactly one PRNG draw. `shuffle()` uses Fisher-Yates and returns both the copied shuffled array and final RNG state.

- [ ] **Step 4: Run tests and typecheck**

```bash
pnpm --filter @kanban/rules test -- rng.test.ts
pnpm --filter @kanban/rules typecheck
```

Expected: PASS.

- [ ] **Step 5: Add a repository search guard for `Math.random()`**

Add to `packages/rules/test/rng.test.ts` a test that recursively reads `packages/rules/src/*.ts` and fails if source text contains `Math.random(`. This test may use Node filesystem APIs because it is test-only; `src` remains runtime-neutral.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
 git commit -m "feat: add deterministic seeded RNG"
```

---

### Task 4: Define the serializable core game model

**Files:**
- Create: `packages/rules/src/model.ts`
- Create: `packages/rules/test/create-game.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `GameState`, `PlayerState`, `BoardState`, `SandraState`, `PendingReward`, `EntityLocation`.
- All state is JSON-serializable; no `Set`, `Map`, class instances or functions in state.

- [ ] **Step 1: Write a failing JSON-serialization test**

```ts
import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';

describe('core game state', () => {
  it('round-trips through JSON without information loss', () => {
    const state = createShellGame({ seed: 'json', playerCount: 4 });
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('creates one human and the remaining seats as bots', () => {
    const state = createShellGame({ seed: 'seats', playerCount: 4 });
    expect(state.players.map((p) => p.kind)).toEqual([
      'HUMAN',
      'BOT',
      'BOT',
      'BOT'
    ]);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @kanban/rules test -- create-game.test.ts
```

- [ ] **Step 3: Implement the model**

Use these core fields:

```ts
export interface PlayerState {
  readonly id: PlayerId;
  readonly kind: 'HUMAN' | 'BOT';
  readonly pp: number;
  readonly bankedShifts: number;
  readonly shiftsSpentToday: number;
  readonly previousDepartment: Department | null;
  readonly currentDepartment: Department | null;
  readonly done: boolean;
  readonly books: number;
  readonly vouchers: number;
  readonly genericRedSeats: number;
}

export interface SandraState {
  readonly department: Department | 'SANDRA_DESK';
  readonly mode: 'NICE' | 'MEAN';
}

export interface BoardState {
  readonly cars: Record<CarId, EntityLocation>;
  readonly parts: Record<PartId, EntityLocation>;
  readonly designs: Record<DesignId, EntityLocation>;
}

export type EntityLocation =
  | { readonly kind: 'SUPPLY' }
  | { readonly kind: 'BOARD'; readonly area: string; readonly slot: number }
  | { readonly kind: 'PLAYER'; readonly playerId: PlayerId; readonly area: string; readonly slot: number };

export interface GameState {
  readonly schemaVersion: 1;
  readonly ruleset: 'KANBAN_AR_2014';
  readonly seed: string;
  readonly rng: RngState;
  readonly playerCount: PlayerCount;
  readonly phase: GamePhase;
  readonly dayIndex: number;
  readonly week: number;
  readonly productionCycle: number;
  readonly meetingScheduled: boolean;
  readonly activeActorId: PlayerId | 'sandra' | null;
  readonly players: readonly PlayerState[];
  readonly board: BoardState;
  readonly sandra: SandraState;
  readonly pendingRewards: readonly PendingReward[];
  readonly eventIndex: number;
}
```

`BoardState` is intentionally an entity-location foundation in Slice 0; department-specific indexed views are added in later slices without changing the one-location invariant.

- [ ] **Step 4: Implement `createShellGame()`**

Create `packages/rules/src/create-game.ts`:

```ts
export interface CreateShellGameInput {
  readonly seed: string;
  readonly playerCount: PlayerCount;
}

export function createShellGame(input: CreateShellGameInput): GameState;
```

Requirements:

- reject blank seed
- create player IDs `player:0..N-1`
- `player:0` is `HUMAN`, all others `BOT`
- phase is `SETUP`
- counters start at zero
- Sandra starts at `SANDRA_DESK`
- board entity maps start empty
- RNG is initialized from seed

- [ ] **Step 5: Run tests and typecheck**

```bash
pnpm --filter @kanban/rules test -- create-game.test.ts
pnpm --filter @kanban/rules typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/rules
 git commit -m "feat: add serializable core game state"
```

---

### Task 5: Add command, event and reducer primitives

**Files:**
- Create: `packages/rules/src/commands.ts`
- Create: `packages/rules/src/events.ts`
- Create: `packages/rules/src/errors.ts`
- Create: `packages/rules/src/reducer.ts`
- Create: `packages/rules/test/engine.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `GameCommand`, `GameEvent`, `RuleErrorCode`, `reduceEvent()`.
- Slice 0 defines a real `START_GAME` command and `GAME_STARTED` event only; later slices extend the unions.

- [ ] **Step 1: Write failing reducer tests**

```ts
import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { reduceEvent } from '../src/reducer.js';

describe('reduceEvent', () => {
  it('applies GAME_STARTED without mutating the source state', () => {
    const source = createShellGame({ seed: 'event', playerCount: 2 });
    const next = reduceEvent(source, {
      id: 'event:0',
      type: 'GAME_STARTED'
    });

    expect(source.phase).toBe('SETUP');
    expect(next.phase).toBe('SELECT_DEPARTMENT');
    expect(next.eventIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @kanban/rules test -- engine.test.ts
```

- [ ] **Step 3: Implement command/event types**

```ts
export type GameCommand = {
  readonly type: 'START_GAME';
  readonly actorId: PlayerId;
};

export type GameEvent = {
  readonly id: EventId;
  readonly type: 'GAME_STARTED';
};
```

Stable error codes for Slice 0:

```ts
export type RuleErrorCode =
  | 'WRONG_PHASE'
  | 'WRONG_ACTOR'
  | 'GAME_ALREADY_STARTED'
  | 'INVARIANT_FAILED';
```

- [ ] **Step 4: Implement `reduceEvent()`**

`GAME_STARTED` transitions `SETUP -> SELECT_DEPARTMENT` and increments `eventIndex` exactly once.

Any unknown event must be rejected by exhaustive TypeScript checking; do not add a default branch that silently returns state.

- [ ] **Step 5: Run the reducer test**

```bash
pnpm --filter @kanban/rules test -- engine.test.ts
```

Expected: PASS for reducer test.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
 git commit -m "feat: add command event and reducer primitives"
```

---

### Task 6: Implement validation and `applyCommand()`

**Files:**
- Create: `packages/rules/src/engine.ts`
- Modify: `packages/rules/test/engine.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `getLegalCommands(state, playerId)`.
- Produces `applyCommand(state, command)`.
- Produces discriminated `CommandResult`.

```ts
export type CommandResult =
  | {
      readonly status: 'ACCEPTED';
      readonly state: GameState;
      readonly events: readonly GameEvent[];
    }
  | {
      readonly status: 'REJECTED';
      readonly state: GameState;
      readonly errors: readonly RuleErrorCode[];
    };
```

- [ ] **Step 1: Add failing engine tests**

Add tests that verify:

```ts
it('starts a setup game only for the human actor', () => {
  const source = createShellGame({ seed: 'start', playerCount: 3 });
  const result = applyCommand(source, {
    type: 'START_GAME',
    actorId: 'player:0'
  });
  expect(result.status).toBe('ACCEPTED');
  if (result.status === 'ACCEPTED') {
    expect(result.events).toHaveLength(1);
    expect(result.state.phase).toBe('SELECT_DEPARTMENT');
  }
});

it('rejects START_GAME from a bot', () => {
  const source = createShellGame({ seed: 'bot-start', playerCount: 3 });
  const result = applyCommand(source, {
    type: 'START_GAME',
    actorId: 'player:1'
  });
  expect(result).toMatchObject({
    status: 'REJECTED',
    errors: ['WRONG_ACTOR']
  });
});

it('rejects START_GAME outside SETUP', () => {
  const source = createShellGame({ seed: 'twice', playerCount: 2 });
  const once = applyCommand(source, {
    type: 'START_GAME',
    actorId: 'player:0'
  });
  if (once.status !== 'ACCEPTED') throw new Error('first start failed');
  const twice = applyCommand(once.state, {
    type: 'START_GAME',
    actorId: 'player:0'
  });
  expect(twice.status).toBe('REJECTED');
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @kanban/rules test -- engine.test.ts
```

- [ ] **Step 3: Implement validation**

`START_GAME` validation rules:

- current phase must equal `SETUP`
- actor must equal `player:0`
- actor kind must equal `HUMAN`

`getLegalCommands()` returns one `START_GAME` command for `player:0` during `SETUP`, and an empty array for all bot player IDs.

- [ ] **Step 4: Implement event resolution**

On accepted `START_GAME`, emit exactly:

```ts
{
  id: makeId('event', state.eventIndex),
  type: 'GAME_STARTED'
}
```

Then reduce events in order and return the resulting state.

Rejected commands must return the identical state object reference and no events field.

- [ ] **Step 5: Run engine tests**

```bash
pnpm --filter @kanban/rules test -- engine.test.ts
pnpm --filter @kanban/rules typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
 git commit -m "feat: add validated command pipeline"
```

---

### Task 7: Enforce core invariants after every accepted command

**Files:**
- Create: `packages/rules/src/invariants.ts`
- Create: `packages/rules/test/invariants.test.ts`
- Modify: `packages/rules/src/engine.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**
- Produces `getInvariantViolations(state): readonly InvariantViolation[]`.
- Produces `assertInvariants(state): void`.
- `applyCommand()` calls `assertInvariants()` after reducing accepted events.

- [ ] **Step 1: Write failing invariant tests**

```ts
import { describe, expect, it } from 'vitest';
import { createShellGame } from '../src/create-game.js';
import { getInvariantViolations } from '../src/invariants.js';

describe('core invariants', () => {
  it('accepts a fresh shell state', () => {
    const state = createShellGame({ seed: 'valid', playerCount: 4 });
    expect(getInvariantViolations(state)).toEqual([]);
  });

  it('rejects shifts above the daily maximum', () => {
    const state = createShellGame({ seed: 'shifts', playerCount: 2 });
    const broken = {
      ...state,
      players: [
        { ...state.players[0]!, shiftsSpentToday: 5 },
        state.players[1]!
      ]
    };
    expect(getInvariantViolations(broken).map((v) => v.code)).toContain(
      'SHIFT_LIMIT_EXCEEDED'
    );
  });

  it('rejects duplicate player IDs', () => {
    const state = createShellGame({ seed: 'ids', playerCount: 2 });
    const broken = {
      ...state,
      players: [state.players[0]!, { ...state.players[1]!, id: 'player:0' as const }]
    };
    expect(getInvariantViolations(broken).map((v) => v.code)).toContain(
      'DUPLICATE_PLAYER_ID'
    );
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @kanban/rules test -- invariants.test.ts
```

- [ ] **Step 3: Implement invariant checks**

Initial invariant codes:

```ts
export type InvariantCode =
  | 'PLAYER_COUNT_MISMATCH'
  | 'DUPLICATE_PLAYER_ID'
  | 'NEGATIVE_BANKED_SHIFTS'
  | 'SHIFT_LIMIT_EXCEEDED'
  | 'INVALID_WEEK'
  | 'INVALID_PRODUCTION_CYCLE'
  | 'INVALID_EVENT_INDEX';
```

Checks:

- `players.length === playerCount`
- all player IDs unique
- all `bankedShifts >= 0`
- all `0 <= shiftsSpentToday <= 4`
- `0 <= week <= 3`
- `0 <= productionCycle <= 3`
- `eventIndex >= 0` integer

- [ ] **Step 4: Make the engine assert after reduction**

`applyCommand()` must call `assertInvariants(nextState)` before returning `ACCEPTED`.

Invariant failure is a developer/programmer error, not a normal rejected player command. `assertInvariants()` throws an `InvariantError` containing the full violations array.

- [ ] **Step 5: Run the complete rules test suite**

```bash
pnpm --filter @kanban/rules test
pnpm --filter @kanban/rules typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
 git commit -m "feat: enforce core game invariants"
```

---

### Task 8: Connect the web shell to the rules package without moving logic into React

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**
- Consumes `createShellGame()` and `getLegalCommands()` from `@kanban/rules`.
- Produces a development-only smoke view proving workspace integration.

- [ ] **Step 1: Add the workspace dependency**

`apps/web/package.json` contains:

```json
{
  "dependencies": {
    "@kanban/rules": "workspace:*"
  }
}
```

Keep normal React/Vite dependencies from Task 1.

- [ ] **Step 2: Update `App.tsx`**

Render a read-only smoke screen from a newly created shell state:

```tsx
import { createShellGame, getLegalCommands } from '@kanban/rules';

const state = createShellGame({ seed: 'development', playerCount: 4 });

export function App() {
  const legal = getLegalCommands(state, 'player:0');
  return (
    <main className="boot-shell">
      <h1>Kanban: Automotive Revolution</h1>
      <dl>
        <dt>Ruleset</dt>
        <dd>{state.ruleset}</dd>
        <dt>Players</dt>
        <dd>{state.playerCount}</dd>
        <dt>Phase</dt>
        <dd>{state.phase}</dd>
        <dt>Legal commands</dt>
        <dd>{legal.map((command) => command.type).join(', ')}</dd>
      </dl>
    </main>
  );
}
```

No button dispatch, board UI or game store yet.

- [ ] **Step 3: Run the full workspace verification**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all pass.

- [ ] **Step 4: Start Vite and manually smoke-check**

```bash
pnpm --filter @kanban/web dev
```

Expected page contains:

- `KANBAN_AR_2014`
- `4`
- `SETUP`
- `START_GAME`

- [ ] **Step 5: Commit**

```bash
git add apps/web package.json pnpm-lock.yaml
 git commit -m "feat: connect web shell to rules kernel"
```

---

## Slice 0 verification gate

Before Slice 0 is considered complete, run exactly:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Required outcomes:

- all commands pass
- CI passes on the Slice 0 head commit
- `@kanban/rules` has no React/DOM imports
- repository search finds no `Math.random(` in runtime rules source
- a 4-player shell creates exactly one human and three bots
- state JSON round-trip is lossless
- identical RNG seeds produce identical draws/shuffles
- accepted `START_GAME` produces a `GAME_STARTED` event and transitions via reducer
- rejected commands do not mutate or replace the source state
- invariant violations are detected deterministically

Only after this gate passes should Slice 1 (full setup + daily phase machine) begin.
