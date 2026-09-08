# Kanban Slice 1 — Verified Daily Phase Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the verified Original 2014 workstation alley, Department Selection, Working Phase ordering, Shift allowance preview, end-of-day boundary and pending-reward activation on top of the deterministic Slice 0 kernel.

**Architecture:** `packages/rules` remains the sole source of legality. Workstations are immutable data with explicit Original 2014 left-to-right order. Selection and work are event-driven; React only renders legal commands. The starting-round card/part draft is deliberately not fabricated: the engine exposes a deterministic shell first-day order until the verified content manifest is added in the later setup-content slice.

**Tech Stack:** TypeScript strict mode, Vitest, React/Vite, pnpm, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-07-kanban-digital-adaptation-design.md`

## Global Constraints

- Ruleset remains exactly `KANBAN_AR_2014`.
- V1 remains 1 human + 1–3 bots; no hot-seat.
- Runtime rules never use `Math.random()`.
- All state transitions are `Command -> Validate -> GameEvent[] -> Reducer -> Invariants`.
- Maximum total work is 4 Shifts per player/day.
- A player cannot select the same department on consecutive days.
- Benefits earned today remain pending until the end-of-day boundary.
- Workstation order is Original 2014 A→F: Testing & Innovation, Assembly, Logistics, Design, Administration, Sandra desk.
- Normal department workstations grant 2 Shifts on the left and 3 on the right; Administration grants 1 then 2.
- In 2-player games, a player cannot select Sandra's current department; Sandra may later enter a player's department.
- The first day keeps Sandra at her Administration desk and does not perform an audit or advance Week.
- Do not invent printed Performance Goal, Final Goal, Demand, Kanban Order or starting Certification-slot effects.

## Source verification

Primary project source: supplied `Kanban_Automotive_Revolution_Digital_Design_Doc_PL.docx`, especially setup/core-loop sections. It states that each day has Department Selection + Working Phase, the same-department prohibition, 2/3 Shifts (Administration 1/2), left-to-right work order and next-day activation of earned Books/Vouchers/Banked Shifts.

Cross-check: Official English Original 2014 rulebook v1.0 / first-edition PDF. Verified facts used by this slice:

- board workstations are A–F in left-to-right order;
- A Testing & Innovation, B Assembly, C Logistics, D Design, E Administration, F Sandra Administration desk;
- left-to-right determines selection/work priority;
- first day Sandra goes to her Administration desk and does not assess/advance Week;
- 2-player restriction: players cannot move to Sandra's department.

The exact starting Certification-slot printed benefits and card-specific content remain outside this slice because they are image/content data and are not required to validate the daily phase state machine.

---

## Planned files

```text
packages/rules/src/
  workstations.ts        # immutable A→F station definitions and selectors
  model.ts               # workstation + daily ordering state
  commands.ts            # SELECT_WORKSTATION / FINISH_WORK
  events.ts              # WORKSTATION_SELECTED / WORKING_PHASE_STARTED / PLAYER_FINISHED_WORK / DAY_ENDED
  engine.ts              # validation, legal command generation, automatic phase events
  reducer.ts             # pure event application
  invariants.ts          # occupancy/order/shift invariants
  index.ts               # public exports
packages/rules/test/
  workstations.test.ts
  selection.test.ts
  day-flow.test.ts
apps/web/src/
  App.tsx
  App.test.tsx
  styles.css
```

---

### Task 1: Encode Original 2014 Workstation Alley

**Files:**
- Create: `packages/rules/src/workstations.ts`
- Create: `packages/rules/test/workstations.test.ts`
- Modify: `packages/rules/src/index.ts`

**Interfaces:**

```ts
export type WorkstationId =
  | 'A_LEFT' | 'A_RIGHT'
  | 'B_LEFT' | 'B_RIGHT'
  | 'C_LEFT' | 'C_RIGHT'
  | 'D_LEFT' | 'D_RIGHT'
  | 'E_LEFT' | 'E_RIGHT'
  | 'F_SANDRA';

export interface WorkstationDefinition {
  readonly id: WorkstationId;
  readonly order: number;
  readonly department: Department;
  readonly shifts: 0 | 1 | 2 | 3;
  readonly reservedForSandra: boolean;
}

export const WORKSTATIONS: readonly WorkstationDefinition[];
export function getWorkstation(id: WorkstationId): WorkstationDefinition;
```

- [ ] **Step 1: Write failing tests** asserting the exact order `A_LEFT..F_SANDRA`, department mapping, left/right Shift values and that only `F_SANDRA` is reserved.
- [ ] **Step 2: Run** `pnpm --filter @kanban/rules test -- workstations.test.ts` and verify RED because `workstations.ts` is missing.
- [ ] **Step 3: Implement only the immutable map and lookup.** No phase logic.
- [ ] **Step 4: Run** the workstation test + rules typecheck and verify GREEN.
- [ ] **Step 5: Commit** `feat: encode Original 2014 workstation alley`.

---

### Task 2: Add workstation selection state and legality

**Files:**
- Modify: `packages/rules/src/model.ts`
- Modify: `packages/rules/src/create-game.ts`
- Modify: `packages/rules/src/commands.ts`
- Modify: `packages/rules/src/events.ts`
- Modify: `packages/rules/src/engine.ts`
- Modify: `packages/rules/src/reducer.ts`
- Create: `packages/rules/test/selection.test.ts`

**State additions:**

```ts
interface PlayerState {
  readonly currentWorkstation: WorkstationId | null;
  readonly baseShiftsToday: number;
  // existing currentDepartment / previousDepartment remain canonical convenience fields
}

interface GameState {
  readonly selectionOrder: readonly PlayerId[];
  readonly selectionCursor: number;
  readonly workOrder: readonly PlayerId[];
  readonly workCursor: number;
}
```

`createShellGame()` initializes `selectionOrder` to player IDs in seat order as a deterministic shell fixture. The later content-backed starting-round slice replaces this with the real Certification Track result; no fake Certification benefit is introduced here.

**Commands/events:**

```ts
{ type: 'SELECT_WORKSTATION'; actorId: PlayerId; workstationId: WorkstationId }

{ type: 'WORKSTATION_SELECTED'; id: EventId; playerId: PlayerId; workstationId: WorkstationId }
{ type: 'WORKING_PHASE_STARTED'; id: EventId; workOrder: readonly PlayerId[] }
```

**Validation codes:** `WORKSTATION_OCCUPIED`, `SAME_DEPARTMENT_AS_PREVIOUS_DAY`, `WORKSTATION_RESERVED`, `SANDRA_DEPARTMENT_BLOCKED`, `NOT_ACTIVE_ACTOR`.

- [ ] **Step 1: Write failing tests** for active-player selection, occupied station rejection, same-department rejection, Sandra-reserved rejection, and 2p Sandra-department blocking.
- [ ] **Step 2: Run** selection tests and verify RED on missing command/state.
- [ ] **Step 3: Implement minimal model/command/event types and reducer support.**
- [ ] **Step 4: Extend `getLegalCommands()`** to return one `SELECT_WORKSTATION` command per legal station only for `activeActorId` during `SELECT_DEPARTMENT`.
- [ ] **Step 5: When the final player selects**, emit `WORKING_PHASE_STARTED`; work order is players sorted by `getWorkstation(currentWorkstation).order`.
- [ ] **Step 6: Run** selection tests + full rules suite + typecheck and verify GREEN.
- [ ] **Step 7: Commit** `feat: add department workstation selection`.

---

### Task 3: Implement Working Phase and Shift capacity preview

**Files:**
- Modify: `packages/rules/src/commands.ts`
- Modify: `packages/rules/src/events.ts`
- Modify: `packages/rules/src/engine.ts`
- Modify: `packages/rules/src/reducer.ts`
- Create: `packages/rules/test/day-flow.test.ts`

**Interfaces:**

```ts
export function getBaseShifts(state: GameState, playerId: PlayerId): number;
export function getMaximumUsableShifts(state: GameState, playerId: PlayerId): number;

{ type: 'FINISH_WORK'; actorId: PlayerId }
{ type: 'PLAYER_FINISHED_WORK'; id: EventId; playerId: PlayerId }
```

`getMaximumUsableShifts()` returns `min(4, baseShiftsToday + bankedShifts)`. It does not spend Banked Shifts; later department action commands will do that when their actual Shift costs exist.

- [ ] **Step 1: Write failing tests** proving workstation base Shifts, 4-Shift cap and that only the current `workOrder[workCursor]` may `FINISH_WORK`.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement selectors and `FINISH_WORK` event/reducer.**
- [ ] **Step 4: Advance `workCursor` deterministically after each finish.**
- [ ] **Step 5: Verify GREEN** across day-flow tests + all rules tests.
- [ ] **Step 6: Commit** `feat: add deterministic working phase order`.

---

### Task 4: Commit pending rewards only at end of day

**Files:**
- Modify: `packages/rules/src/events.ts`
- Modify: `packages/rules/src/engine.ts`
- Modify: `packages/rules/src/reducer.ts`
- Modify: `packages/rules/test/day-flow.test.ts`

**Events:**

```ts
{
  type: 'DAY_ENDED';
  id: EventId;
  nextSelectionOrder: readonly PlayerId[];
}
```

When the last player finishes, the engine emits `DAY_ENDED`. The reducer must:

- activate all pending `BANKED_SHIFT`, `BOOK`, `VOUCHER` rewards;
- clear `pendingRewards`;
- copy `currentDepartment` to `previousDepartment`;
- clear `currentDepartment` and `currentWorkstation`;
- reset `baseShiftsToday`, `shiftsSpentToday`, `done`;
- increment `dayIndex`;
- set `phase = 'SELECT_DEPARTMENT'`;
- set `selectionOrder = nextSelectionOrder` based on the just-finished workstation order;
- reset selection/work cursors.

- [ ] **Step 1: Add failing tests** showing a pending reward is unusable during the workday and becomes spendable only after `DAY_ENDED`.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement minimal DAY_ENDED reducer.**
- [ ] **Step 4: Verify GREEN** full rules suite and typecheck.
- [ ] **Step 5: Commit** `feat: enforce end-of-day reward boundary`.

---

### Task 5: Strengthen daily invariants

**Files:**
- Modify: `packages/rules/src/invariants.ts`
- Modify: `packages/rules/test/invariants.test.ts`

New invariant codes:

```ts
'DUPLICATE_WORKSTATION'
'INVALID_SELECTION_CURSOR'
'INVALID_WORK_CURSOR'
'INVALID_WORK_ORDER'
'WORKSTATION_DEPARTMENT_MISMATCH'
'INVALID_BASE_SHIFTS'
```

- [ ] **Step 1: Write failing invariant tests** for duplicate occupied workstations, impossible cursors, work-order duplicates and mismatch between current workstation/department/base shifts.
- [ ] **Step 2: Verify RED.**
- [ ] **Step 3: Implement checks.**
- [ ] **Step 4: Run full rules suite and typecheck; verify GREEN.**
- [ ] **Step 5: Commit** `test: enforce daily phase invariants`.

---

### Task 6: Replace bootstrap card with a workstation-alley development UI

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`

The development UI remains thin: it renders current phase, active actor, five department lanes, the two workstations per department, and disabled/legal state derived from `getLegalCommands()`. It may dispatch `START_GAME`, `SELECT_WORKSTATION` and `FINISH_WORK`, but contains no duplicated rule predicates.

- [ ] **Step 1: Write failing render test** expecting department labels, `2 Shifts / 3 Shifts`, Administration `1 / 2`, active actor and legal workstation command markers.
- [ ] **Step 2: Verify RED against the bootstrap card.**
- [ ] **Step 3: Implement minimal interactive React shell using `useState(GameState)` and `applyCommand()`.**
- [ ] **Step 4: Verify web tests + full workspace lint/typecheck/test/build.**
- [ ] **Step 5: Commit** `feat: render workstation alley development board`.

---

## Slice 1 verification gate

Run on the final branch head:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Additionally verify:

- no `Math.random(` under `packages/rules/src`;
- `WORKSTATIONS` order is stable and exactly Original 2014 A→F;
- a player cannot take an occupied station or repeat yesterday's department;
- 2-player Sandra-department restriction is enforced;
- work order is derived only from workstation position;
- max usable Shifts never exceeds 4;
- pending rewards remain unavailable until end of day;
- end of day carries current department into `previousDepartment` and establishes the next selection order;
- React renders legality from engine commands rather than duplicating rules.

After green CI, create PR to `main`, mark ready, merge, then verify the push CI on `main` before starting the next slice.
