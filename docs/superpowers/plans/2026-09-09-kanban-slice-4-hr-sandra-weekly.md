# Slice 4 — HR, Sandra and Weekly Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Human Resources training/certification/expert progression, Factory Goals/Seat conversion, Original-2014 Nice/Mean Sandra, Administration micromanagement, Week advancement and End-of-Week scoring while preserving the deterministic Command → Events → Reducer architecture.

**Architecture:** HR progression is state-driven and content-configurable. Training levels and tie order live in deterministic game state; certification/expert transitions materialize as events. Sandra remains a system actor whose evaluation and cleanup are planned by pure functions, with all random cleanup decisions materialized before reduction. Printed component values that are not verified remain synthetic content data and never become hard-coded rules.

**Tech Stack:** TypeScript 6, Vitest, React/Vite development UI, existing `@kanban/rules` workspace and GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-09-07-kanban-digital-adaptation-design.md`

## Global Constraints

- Ruleset remains `KANBAN_AR_2014`; do not import Kanban EV differences.
- UI legality comes only from `getLegalCommands()` / validator results.
- No `Math.random()` in rules runtime; every shuffle uses the seeded RNG and event payloads.
- Benefits earned during the current workday that are Books/Vouchers/Banked Shifts remain pending until end of day unless the verified rule explicitly says the reward is immediate.
- Do not invent printed Certification Track benefits, Factory Goal thresholds, Award Plaque distributions or card text. Development fixtures may use clearly synthetic `authoritative:false` content.
- Source-backed HR rules: 1 Shift = +1 training stage; top of a stack is ahead for ties; certification occurs after passing stage 3; Books give +1 training without spending a Shift; first expert earns a Seat and each new expert chooses one remaining Award Plaque; plaque rewards are Bank 1 Shift / +2 PP / Book / Parts Voucher.
- Source-backed Factory Goal categories: certifications, claimed cars, upgraded designs. Seat counts scale by player count; exact tile thresholds are content data.
- Source-backed Sandra Original-2014 rules: Nice audits the most-trained player(s), excludes players with zero training from a reward, then rewards qualifying audited players by their current Banked Shifts. Mean audits the least-trained player(s), and qualifying subpar players lose 1 PP per Banked Shift fewer than 5. Stack order does not break Sandra audit ties.
- Sandra department performance conditions: Testing >=2 upgraded designs / Mean <=2; Assembly >=2 garage cars / Mean <=2; Logistics >=2 player parts / Mean <=2; Design >=2 blueprint designs / Mean <=2; Administration >=2 certifications / Mean <=2.
- Sandra tasks: Testing Pace Car +1; Assembly clear all Assembly parts; Logistics leave at most one part in each warehouse; Design return the oldest/rightmost 4 designs to Central deck and shuffle; Administration Week +1 and End-of-Week scoring.
- Weekly scoring: for each car in a player's garage, score every upgrade of that model: own upgrade 2 PP, another player's upgrade 1 PP. Multiple cars of one model multiply that model's result.

---

## File map

**Create**
- `packages/rules/src/hr.ts` — training, ranking, certification/expert planners.
- `packages/rules/src/factory-goals.ts` — goal metric evaluation and Seat award planning.
- `packages/rules/src/sandra.ts` — movement, audit, cleanup and Administration-week planner.
- `packages/rules/src/weekly-scoring.ts` — pure scoring breakdown.
- `packages/rules/test/hr-training.test.ts`
- `packages/rules/test/hr-expert.test.ts`
- `packages/rules/test/factory-goals.test.ts`
- `packages/rules/test/administration.test.ts`
- `packages/rules/test/sandra.test.ts`
- `packages/rules/test/weekly-scoring.test.ts`
- `packages/rules/test/hr-sandra-invariants.test.ts`

**Modify**
- `packages/rules/src/model.ts`
- `packages/rules/src/content.ts`
- `packages/rules/src/ids.ts`
- `packages/rules/src/commands.ts`
- `packages/rules/src/events.ts`
- `packages/rules/src/errors.ts`
- `packages/rules/src/create-game.ts`
- `packages/rules/src/reducer.ts`
- `packages/rules/src/engine.ts`
- `packages/rules/src/invariants.ts`
- `packages/rules/src/index.ts`
- `apps/web/src/development-game.ts`
- `apps/web/src/App.tsx`
- `apps/web/src/App.test.tsx`

---

### Task 1: HR state and content contracts

**Interfaces**

Add:

```ts
export interface TrainingRulesConfig {
  readonly certificationLevel: number;
  readonly expertLevel: number;
}

export type AwardPlaqueReward =
  | { readonly kind: 'BANKED_SHIFT'; readonly amount: 1 }
  | { readonly kind: 'PP'; readonly amount: 2 }
  | { readonly kind: 'BOOK'; readonly amount: 1 }
  | { readonly kind: 'VOUCHER'; readonly amount: 1 };

export interface AwardPlaqueDefinition {
  readonly id: AwardPlaqueId;
  readonly reward: AwardPlaqueReward;
}

export type FactoryGoalCategory = 'CERTIFICATIONS' | 'CARS' | 'UPGRADED_DESIGNS';
export interface FactoryGoalDefinition {
  readonly id: FactoryGoalId;
  readonly category: FactoryGoalCategory;
  readonly threshold: number;
  readonly initialSeatsByPlayerCount: Readonly<Record<2|3|4, number>>;
}
```

Extend `PlayerState` with:

```ts
readonly training: Readonly<Record<Department, number>>;
readonly certificationPosition: number;
readonly expertDepartments: readonly Department[];
readonly conferenceSeatsFaceUp: number;
readonly conferenceSeatsFaceDown: number;
readonly micromanagedDepartment: Exclude<Department, 'ADMINISTRATION'> | null;
```

Extend `BoardState` with:

```ts
readonly trainingTieOrder: Readonly<Record<Department, readonly PlayerId[]>>;
readonly expertSeatAvailable: Readonly<Record<Department, boolean>>;
readonly awardPlaquePools: Readonly<Record<Department, readonly AwardPlaqueId[]>>;
readonly factoryGoals: readonly ActiveFactoryGoalState[];
```

- [ ] Write `hr-training.test.ts` asserting shell state is JSON-serializable and initializes all five training values at 0 with deterministic tie order.
- [ ] Run CI; expected RED on missing fields/types.
- [ ] Add IDs/content/state/config defaults and `createShellGame()` initialization only.
- [ ] Run full CI; expected GREEN.
- [ ] Commit `feat: add HR state and content contracts`.

### Task 2: Training, Books and certification transition

**Produces**

```ts
TRAIN_DEPARTMENT { actorId, department, source: 'SHIFT'|'BOOK' }
TRAINING_ADVANCED
PLAYER_CERTIFIED
getTrainingRank(state, department)
getTrainingLeaders(state, department)
getTrainingLaggards(state, department)
```

Rules:
- Shift training costs 1 Shift.
- Book training costs 1 Book and 0 Shifts.
- Normal worker can train only in current department.
- Administration worker may always train Administration; micromanaged target becomes legal after Task 5.
- On arrival at a level occupied by another player, update tie order so the newly arrived player is ahead at that level.
- Crossing configured `certificationLevel` emits `PLAYER_CERTIFIED` exactly once and adds department certification.
- Existing structural certification effects remain the source of truth: Design/Logistics/Testing behavior already checks `certifications`; Administration certification unlocks one additional conference Seat slot through state, but no printed Certification Track benefit is invented.

- [ ] Write RED tests for Shift training, Book training, stack-ahead behavior, no Book/no Shift rejection, and exactly-once certification crossing.
- [ ] Implement `hr.ts`, command/errors/events/reducer/engine integration minimally.
- [ ] Verify `getLegalCommands()` emits training commands only in legal contexts.
- [ ] Run full CI GREEN.
- [ ] Commit `feat: implement training books and certification`.

### Task 3: Expert completion and Award Plaques

**Produces**

```ts
BECOME_EXPERT is derived from training progression
CHOOSE_AWARD_PLAQUE { actorId, department, plaqueId }
PLAYER_BECAME_EXPERT
EXPERT_SEAT_AWARDED
AWARD_PLAQUE_CLAIMED
```

Rules:
- Reaching configured `expertLevel` marks expert.
- Only the first expert in a department consumes that department's expert Seat.
- Every player who becomes expert chooses one remaining plaque from that department's pool.
- Plaque reward resolves immediately, matching the source wording: +2 PP / Bank 1 Shift / Book / Voucher. This task intentionally treats the four plaque rewards as immediate expert benefits, unlike pending design/Kanban rewards.
- Exact plaque distribution is fixture/content data; setup uses synthetic non-authoritative pools until verified.

- [ ] RED tests: first expert gets Seat, second does not; both choose plaque; chosen plaque leaves pool; invalid plaque rejected; each reward kind updates exactly once.
- [ ] Implement pending expert-choice state in `PlayerState` or `GameState` so work cannot continue until required plaque selection is resolved.
- [ ] GREEN full CI.
- [ ] Commit `feat: add expert seats and award plaques`.

### Task 4: Factory Goals and Red Seat conversion

**Produces**

```ts
FACTORY_GOAL_ACHIEVED
CONVERT_RED_SEAT
getFactoryGoalMetric(state, playerId, category)
planFactoryGoalAwards(before, after)
```

Rules:
- Metrics are certification count, garage car count, and owned upgraded Design count.
- After any accepted command/event sequence, derived events check newly crossed thresholds.
- A goal Seat can be claimed only while seats remain.
- Factory Goal Red Seat handling: if a face-down own-color conference Seat is available, consume the Red Seat award conceptually and flip one own Seat face-up; otherwise add one generic Red Seat to the player board.
- `CONVERT_RED_SEAT` is a free global action outside Meeting: spend one generic Red Seat and flip one face-down own Seat face-up.
- Exact Factory Goal thresholds remain synthetic content records with `authoritative:false`.

- [ ] RED tests for all three metrics, threshold crossing once, simultaneous goal crossings, no seats remaining, face-down Seat flip vs generic Red Seat fallback, and explicit conversion outside Meeting.
- [ ] Implement pure planner + derived-event hook after accepted commands.
- [ ] GREEN full CI.
- [ ] Commit `feat: implement factory goals and seat conversion`.

### Task 5: Administration micro-manage

**Produces**

```ts
START_MICROMANAGE { actorId, department }
MICROMANAGE_STARTED
getEffectiveWorkDepartment(state, playerId)
```

Rules:
- Only a worker physically in Administration may start micro-management.
- Target is exactly one of Testing, Assembly, Logistics or Design; target is fixed for that day.
- After target selection, existing work commands for that target use `getEffectiveWorkDepartment()` rather than directly comparing `currentDepartment`.
- Administration training remains legal regardless of selected micro-managed department.
- Training in the selected target is also legal using Shift/Book.
- `FINISH_WORK` clears daily micromanage state at day boundary.

- [ ] RED tests: choose one target, cannot change target same day, target actions become legal, unrelated department actions remain illegal, Administration training remains legal.
- [ ] Refactor validators to consume `getEffectiveWorkDepartment()` without duplicating rules in UI.
- [ ] GREEN full CI.
- [ ] Commit `feat: implement Administration micro-management`.

### Task 6: Sandra movement, Original Nice/Mean audit and department cleanup

**Produces**

```ts
planSandraVisit(state): SandraVisitPlan
SANDRA_MOVED
SANDRA_AUDIT_RESOLVED
SANDRA_DEPARTMENT_TASK_RESOLVED
```

Movement:
- Sandra follows factory department order Testing → Assembly → Logistics → Design → Administration → Testing.
- In a normal department choose the first free workstation of that department; if both are occupied, continue to the next department.
- Administration uses `F_SANDRA` desk.
- Store Sandra workstation explicitly for replay/debugging.

Audit:
- Nice candidate set = players at maximum training level in visited department; stack order ignored. If max level is 0, nobody can be rewarded.
- Mean candidate set = players at minimum training level; stack order ignored.
- Apply department performance predicate from Global Constraints.
- Nice qualifying candidate receives PP equal to current `bankedShifts`.
- Mean qualifying candidate loses `max(0, 5 - bankedShifts)` PP, clamped so PP never drops below 0.
- Event payload includes audited player IDs, training level, predicate metric, predicate pass/fail and PP delta for human-readable replay.

Cleanup:
- Testing: Pace Car +1 and reuse Meeting scheduling logic if threshold crossed.
- Assembly: all parts in `assembly:*` return to supply.
- Logistics: deterministically keep slot/ID-first one part per warehouse; return extras to supply.
- Design: return exactly four oldest/rightmost visible designs to Central deck and seed-shuffle Central deck; do not use EV's eight-tile cleanup.
- Administration handled in Task 7.

- [ ] RED tests covering Nice leader ties, Mean laggard ties, zero-training Nice exclusion, Banked Shifts 0/4/5/10, all five department predicates, and four cleanup tasks.
- [ ] Implement pure planners and automatic Sandra resolution after the human Working Phase ends.
- [ ] GREEN full CI.
- [ ] Commit `feat: implement Original Sandra audits and cleanup`.

### Task 7: Week advancement and End-of-Week scoring

**Produces**

```ts
scoreEndOfWeek(state): readonly PlayerWeeklyScore[]
WEEK_ADVANCED
END_OF_WEEK_SCORED
```

Breakdown shape:

```ts
interface WeeklyModelScore {
  readonly model: ModelId;
  readonly garageCars: number;
  readonly ownUpgrades: number;
  readonly otherUpgrades: number;
  readonly pointsPerCar: number;
  readonly points: number;
}
interface PlayerWeeklyScore {
  readonly playerId: PlayerId;
  readonly models: readonly WeeklyModelScore[];
  readonly total: number;
}
```

Rules:
- Sandra Administration task increments Week by 1.
- End-of-Week scoring is skipped only for the initial pre-game/first-day Administration visit if the current rules state represents that setup visit; normal Administration visits score.
- For each player's garage car of model M: own upgrades of M = 2 PP each; upgrades owned by other players = 1 PP each. Duplicate garage cars multiply the model subtotal.
- `END_OF_WEEK_SCORED` contains the human-readable breakdown and reducer applies only its totals.
- Do not implement final-game trigger/final scoring here; Slice 5 owns that transition, but Week must remain monotonic and ready for the 3/2 condition.

- [ ] RED tests for own/other upgrades, duplicate same-model cars, models without cars, models without upgrades, and multi-player totals.
- [ ] Integrate scoring into Sandra Administration visit.
- [ ] GREEN full CI.
- [ ] Commit `feat: add week advancement and weekly scoring`.

### Task 8: M4 invariants and development UI surface

Add invariants:
- each training level is integer within `[0, expertLevel]`;
- certifications correspond to training at/above certification threshold;
- expert flag corresponds to expert level;
- no duplicate IDs inside Award Plaque pools;
- conference Seat counts are nonnegative and do not exceed unlocked capacity;
- Factory Goal seats never negative;
- Week never outside supported clock range;
- Sandra workstation/department pairing is valid.

Development UI:
- Add Human Resources panel with five training tracks, certification count/order summary, Shift Bank, expert Seat state, Award Plaque counts and Factory Goals.
- Add Sandra status card: mode, current department/workstation, next visit preview and last audit breakdown.
- Add Week scoring summary in event/status panel.
- Buttons remain generated only from legal commands.

- [ ] RED invariant tests for each malformed state plus UI contract tests for `Human Resources`, `Training`, `Factory Goals`, `Sandra`, `Week`.
- [ ] Implement invariant checks and development-only surface.
- [ ] GREEN full CI: deterministic guard, lint, typecheck, all tests, production build.
- [ ] Commit `feat: add HR Sandra weekly development surface`.

### Task 9: Slice review and integration gate

- [ ] Compare branch against `main`; require `behind_by = 0` or reconcile before PR.
- [ ] Confirm no content record introduced by this slice is labeled authoritative unless it has a verified source record.
- [ ] Re-read Slice 4 spec and this plan line-by-line; list and fix any missing implementation requirement.
- [ ] Run fresh full CI on branch and require deterministic guard + lint + typecheck + tests + build all success.
- [ ] Open PR `Slice 4: HR, Sandra and weekly scoring`.
- [ ] Merge to `main` using merge commit after green branch CI.
- [ ] Require fresh post-merge CI on `main` before beginning Slice 5.
