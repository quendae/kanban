# Slice 5 — Meetings + Final Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Original 2014 Meeting flow, Production Cycle clock, 3/2 end-game trigger and deterministic final scoring while keeping all unverified Performance Goal / Final Goal printed data content-driven and synthetic.

**Architecture:** Extend the existing deterministic `Command -> Validate -> GameEvent[] -> Reducer` pipeline. Meeting decisions live in canonical serializable state; goal conditions and printed car/final-goal values are content data, never React logic. End-of-day orchestration owns the transition into Meeting and then final scoring so scheduled Meeting / End-of-Week effects finish before `FINAL_SCORE`.

**Tech Stack:** TypeScript 6, Vitest, React 19, Vite, pnpm workspace, GitHub Actions.

**Spec:** `Kanban_Automotive_Revolution_Digital_Design_Doc_PL.docx`, sections 11–12, 13, 21, 25 and M5 handoff.

## Global Constraints

- Ruleset is `KANBAN_AR_2014`; do not import Kanban EV changes.
- A Meeting begins only after the current work day finishes when `meetingScheduled === true`.
- Speaker order is descending Certification Track position.
- A player must reveal exactly one pet project during each Meeting before they may Pass.
- A face-up own-color Seat is required to score a Performance Goal; Red Seats never speak directly.
- A player may score each Performance Goal at most once per Meeting.
- Performance Goal decay is per-card speaker count, not global Meeting round.
- Consecutive passes by all players end the Meeting; earlier passers may re-enter before that happens.
- Used face-up Seats return face-down; unused face-up Seats remain face-up.
- Meeting completion advances `productionCycle` by exactly 1 and clears `meetingScheduled`.
- End game triggers at clock 3/2 in either orientation and only resolves after the whole current day, including Meeting and/or weekly scoring.
- Final Tested Design scoring is not multiplied by duplicate same-model cars.
- Final Training scoring is 5/3/1 PP by rank; training stack order breaks ties; zero progress scores 0.
- Every scoring function returns points plus a human-readable breakdown.
- Exact printed Performance Goal conditions/values, Final Goal conditions/values and car printed values must not be invented. Synthetic fixtures use `authoritative:false`.
- `getLegalCommands` remains the only UI legality source.
- No `Math.random()` in rules runtime; all replenishment/deck order uses seeded RNG.

---

### Task 1: Meeting content IDs and canonical state

**Files:**
- Modify: `packages/rules/src/ids.ts`
- Modify: `packages/rules/src/content.ts`
- Modify: `packages/rules/src/model.ts`
- Modify: `packages/rules/src/create-game.ts`
- Test: `packages/rules/test/meeting-state.test.ts`

**Interfaces:**
- Produces `PerformanceGoalId`, `FinalGoalId`.
- Produces `PerformanceGoalDefinition`, `FinalGoalDefinition`, `CarDefinition.finalPP`.
- Produces `MeetingState` and canonical deck/hand/display fields.

- [ ] **Step 1: Write the failing state test**

```ts
it('serializes Meeting display, player hands and per-meeting speaker state', () => {
  const state = createShellGame({ seed: 'm5-state', playerCount: 3 });
  expect(state.meeting).toMatchObject({
    active: false,
    speakerOrder: [],
    speakerCursor: 0,
    consecutivePasses: 0,
    revealedPetProjects: [],
    spokenGoalsByPlayer: {},
    usedSeatsByPlayer: {},
  });
  expect(state.board.performanceGoalDisplay).toEqual([]);
  expect(state.performanceGoalDeck).toEqual([]);
  expect(state.performanceGoalHands).toEqual({});
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});
```

- [ ] **Step 2: Verify RED**

Run CI / `pnpm --filter @kanban/rules test -- meeting-state.test.ts`.
Expected: missing IDs/content/state fields.

- [ ] **Step 3: Add minimal content/state types**

```ts
export type PerformanceGoalId = `performance-goal:${number}`;
export type FinalGoalId = `final-goal:${number}`;

export interface GoalCondition {
  readonly metric: string;
  readonly operator: 'GTE' | 'LTE' | 'EQ';
  readonly value: number;
}

export interface PerformanceGoalDefinition {
  readonly id: PerformanceGoalId;
  readonly condition: GoalCondition;
  readonly basePP: number;
  readonly firstMultiplier: number;
}

export interface FinalGoalAchievementDefinition {
  readonly condition: GoalCondition;
  readonly pp: number;
}

export interface FinalGoalDefinition {
  readonly id: FinalGoalId;
  readonly achievements: readonly FinalGoalAchievementDefinition[];
}
```

`CarDefinition` gains `finalPP: number | null`; null means printed value not supplied in this manifest.

```ts
export interface MeetingState {
  readonly active: boolean;
  readonly speakerOrder: readonly PlayerId[];
  readonly speakerCursor: number;
  readonly consecutivePasses: number;
  readonly revealedPetProjects: readonly PlayerId[];
  readonly spokenGoalsByPlayer: Readonly<Partial<Record<PlayerId, readonly PerformanceGoalId[]>>>;
  readonly usedSeatsByPlayer: Readonly<Partial<Record<PlayerId, number>>>;
}
```

`GameState` gains `meeting`, `performanceGoalDeck`, `performanceGoalHands`, `finalGoalId`; `BoardState` gains `performanceGoalDisplay`.

- [ ] **Step 4: Initialize empty shell state and EMPTY_GAME_CONTENT**

Use empty arrays/maps and `finalGoalId: null`; do not seed real card data.

- [ ] **Step 5: Run focused + full tests and commit**

Expected: all tests green.

---

### Task 2: Meeting phase entry and speaker order

**Files:**
- Create: `packages/rules/src/meeting.ts`
- Modify: `packages/rules/src/weekly-engine.ts`
- Modify: `packages/rules/src/weekly-events.ts`
- Modify: `packages/rules/src/weekly-reducer.ts`
- Test: `packages/rules/test/meeting-entry.test.ts`

**Interfaces:**
- Produces `getMeetingSpeakerOrder(state): readonly PlayerId[]`.
- Produces `MEETING_STARTED` event.

- [ ] **Step 1: Write RED tests**

```ts
it('orders speakers by descending certificationPosition', () => {
  expect(getMeetingSpeakerOrder(stateWithCertificationPositions([2, 7, 4]))).toEqual([
    'player:1', 'player:2', 'player:0',
  ]);
});

it('enters MEETING after the final worker if a Meeting is scheduled', () => {
  const result = applyCommand(scheduledFinalWorkerState(), {
    type: 'FINISH_WORK', actorId: 'player:0',
  });
  expect(result.state.phase).toBe('MEETING');
  expect(result.events.map(e => e.type)).toContain('MEETING_STARTED');
});
```

- [ ] **Step 2: Verify RED**

Expected: no meeting helper/event and current `DAY_ENDED` transitions directly to department selection.

- [ ] **Step 3: Implement speaker order**

Sort by `certificationPosition` descending; stable fallback by `playerId` only for impossible equal-position fixture states.

- [ ] **Step 4: Implement Meeting entry orchestration**

At end of day, preserve day-end bookkeeping but transition to `MEETING` instead of `SELECT_DEPARTMENT` when `meetingScheduled` is set. Emit `MEETING_STARTED` after day bookkeeping, initialize meeting state, set first speaker as `activeActorId`.

- [ ] **Step 5: Run full suite and commit**

---

### Task 3: Reveal pet project, Speak and Pass legality

**Files:**
- Modify: `packages/rules/src/commands.ts`
- Modify: `packages/rules/src/meeting.ts`
- Modify: `packages/rules/src/weekly-events.ts`
- Modify: `packages/rules/src/weekly-engine.ts`
- Modify: `packages/rules/src/weekly-reducer.ts`
- Test: `packages/rules/test/meeting-actions.test.ts`

**Interfaces:**
- Adds commands:

```ts
| { readonly type: 'REVEAL_PET_PROJECT'; readonly actorId: PlayerId; readonly goalId: PerformanceGoalId }
| { readonly type: 'SPEAK_AT_MEETING'; readonly actorId: PlayerId; readonly goalId: PerformanceGoalId }
| { readonly type: 'PASS_MEETING'; readonly actorId: PlayerId }
```

- [ ] **Step 1: RED — pet project must precede Pass and may be revealed once**

Assert `PASS_MEETING` rejected before reveal, accepted after reveal, duplicate reveal rejected, reveal requires a goal in that player's hand.

- [ ] **Step 2: RED — Speak requires active speaker, face-up Seat and one-use-per-goal**

Assert Red Seat count alone is insufficient; `conferenceSeatsFaceUp >= 1` is required; second Speak by same player at same goal is rejected.

- [ ] **Step 3: Implement validators and legal-command enumeration**

`getLegalCommands` in `MEETING` returns only current speaker Meeting commands. `REVEAL_PET_PROJECT` lists hand goals not yet revealed by that player. `SPEAK_AT_MEETING` lists central/revealed goals that satisfy the content condition and have remaining score value.

- [ ] **Step 4: Implement events/reducer**

Use `PET_PROJECT_REVEALED`, `MEETING_GOAL_SCORED`, `MEETING_PLAYER_PASSED` with resolved PP inside the event. Speak consumes one face-up Seat immediately and records the goal in `spokenGoalsByPlayer`.

- [ ] **Step 5: Run full suite and commit**

---

### Task 4: Content-driven Performance Goal evaluator and per-card decay

**Files:**
- Create: `packages/rules/src/goal-metrics.ts`
- Modify: `packages/rules/src/meeting.ts`
- Test: `packages/rules/test/performance-goal-scoring.test.ts`

**Interfaces:**
- Produces `getGoalMetric(state, playerId, condition): number | null`.
- Produces `evaluateGoalCondition(...)` and `getPerformanceGoalScore(...)`.

- [ ] **Step 1: RED — per-card decay**

For a synthetic fixture `{ basePP: 2, firstMultiplier: 3 }`, expect first/second/third/fourth speaker awards `6/4/2/0`; speaking on another goal must not alter this card's multiplier.

- [ ] **Step 2: RED — condition failure**

A synthetic condition not satisfied by the player must not produce a legal Speak command.

- [ ] **Step 3: Implement a closed metric registry**

Do not execute arbitrary strings. `GoalCondition.metric` is validated against an explicit registry of canonical measurable keys. Initial registry must include only metrics already represented by canonical state (cars, tested designs, certifications, training total, parts, blueprints, upgraded designs, banked shifts, seats). Unsupported metrics return null so unverified cards cannot silently score.

- [ ] **Step 4: Implement score formula**

```ts
const multiplier = Math.max(0, goal.firstMultiplier - priorSpeakers);
return goal.basePP * multiplier;
```

- [ ] **Step 5: Run suite and commit**

---

### Task 5: Consecutive-pass Meeting completion, Seat reset and replenishment

**Files:**
- Modify: `packages/rules/src/meeting.ts`
- Modify: `packages/rules/src/weekly-events.ts`
- Modify: `packages/rules/src/weekly-engine.ts`
- Modify: `packages/rules/src/weekly-reducer.ts`
- Test: `packages/rules/test/meeting-completion.test.ts`

**Interfaces:**
- Produces `MEETING_COMPLETED` with all RNG/deck/hand/display results materialized in the event.

- [ ] **Step 1: RED — pass/re-entry**

A pass increments `consecutivePasses`; any later Reveal/Speak resets it to 0; a player who passed may act again when turn order cycles.

- [ ] **Step 2: RED — all consecutive passes finish Meeting**

When `consecutivePasses === playerCount`, Meeting completes once.

- [ ] **Step 3: RED — Seat reset**

Only Seats actually spent during this Meeting become face-down. Unused face-up Seats remain face-up.

- [ ] **Step 4: RED — next Meeting has four central goals**

Each player contributes exactly one of the two non-pet-project hand cards through a decision command; at 2p/3p remaining slots are filled deterministically from deck. Then each player draws two replacement cards. Never invent card text/values.

If this requires an explicit interstitial choice phase, extend `MeetingState` with `replenishmentChoicesPending` rather than auto-selecting a player's private choice.

- [ ] **Step 5: Implement seeded replenishment and completion event**

Materialize deck/hand/display arrays and RNG state in the event so replay is deterministic.

- [ ] **Step 6: Run full suite and commit**

---

### Task 6: Production Cycle and 3/2 end trigger

**Files:**
- Create: `packages/rules/src/end-game.ts`
- Modify: `packages/rules/src/weekly-events.ts`
- Modify: `packages/rules/src/weekly-reducer.ts`
- Modify: `packages/rules/src/weekly-engine.ts`
- Test: `packages/rules/test/end-trigger.test.ts`

**Interfaces:**
- Produces `isEndGameTriggered(state): boolean`.
- Produces `PRODUCTION_CYCLE_ADVANCED` and `FINAL_SCORING_STARTED` events.

- [ ] **Step 1: RED — exact trigger matrix**

```ts
expect(trigger(3,2)).toBe(true);
expect(trigger(2,3)).toBe(true);
expect(trigger(3,1)).toBe(false);
expect(trigger(2,2)).toBe(false);
```

- [ ] **Step 2: RED — finish day first**

A 3/2 condition reached during work must not jump directly to `FINAL_SCORE`; pending Meeting and weekly scoring resolve first.

- [ ] **Step 3: Implement Production Cycle advance at Meeting completion**

Clamp track to 3; clear `meetingScheduled`; only after all day-end scoring boundaries are complete emit `FINAL_SCORING_STARTED`.

- [ ] **Step 4: Run full suite and commit**

---

### Task 7: Final scoring breakdown excluding unverified Final Goal content

**Files:**
- Create: `packages/rules/src/final-scoring.ts`
- Modify: `packages/rules/src/weekly-events.ts`
- Modify: `packages/rules/src/weekly-reducer.ts`
- Test: `packages/rules/test/final-scoring.test.ts`

**Interfaces:**
- Produces `scoreFinalGame(state, finalGoalChoices): readonly PlayerFinalScore[]`.

```ts
export interface PlayerFinalScore {
  readonly playerId: PlayerId;
  readonly finalGoals: number;
  readonly bankedShifts: number;
  readonly resources: number;
  readonly cars: number;
  readonly testedDesigns: number;
  readonly training: number;
  readonly total: number;
}
```

- [ ] **Step 1: RED — Banked Shift/resources**

Assert +1 PP per Banked Shift and +1 PP per remaining Seat/Book/Voucher.

- [ ] **Step 2: RED — car printed values are content-only**

Synthetic cars with `finalPP: 2/4` score exactly those values; `finalPP:null` contributes 0 and is reported as unresolved content rather than guessed.

- [ ] **Step 3: RED — Tested Designs**

Each own upgraded design with at least one matching-model garage car scores current global `partValue`; two same-model cars do not multiply it.

- [ ] **Step 4: RED — training 5/3/1**

Rank each department using level descending then `trainingTieOrder`; zero progress scores zero. Only first/second/third positive-progress ranks receive 5/3/1.

- [ ] **Step 5: Implement pure scoring with full source breakdown**

Do not mutate state inside scorer. Final Goal achievements are evaluated only from supplied content definitions; unsupported/unverified condition metrics contribute no guessed PP and appear in breakdown as unresolved.

- [ ] **Step 6: Apply `FINAL_SCORE_APPLIED` event and transition to GAME_OVER**

- [ ] **Step 7: Run suite and commit**

---

### Task 8: Winner/tie-break resolution

**Files:**
- Modify: `packages/rules/src/final-scoring.ts`
- Test: `packages/rules/test/winner-resolution.test.ts`

**Interfaces:**
- Produces `resolveWinners(state): WinnerResolution`.

- [ ] **Step 1: RED the tie-break chain**

Order tied PP by cars, Tested Designs, Banked Shifts, Certifications; if still equal return shared winners.

- [ ] **Step 2: Implement deterministic resolution**

Return both winner IDs and a human-readable applied tie-break trace.

- [ ] **Step 3: Run full suite and commit**

---

### Task 9: Board Room development UI

**Files:**
- Create: `apps/web/src/MeetingBoardRoom.tsx`
- Create: `apps/web/src/meeting.css`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**
- Consumes only canonical Meeting state and `getLegalCommands`.
- No goal predicate/scoring logic in React.

- [ ] **Step 1: RED UI contract**

Static markup must contain `Board Room`, current speaker order, face-up Seat count, four goal slots, pet-project status, per-goal current value, and explicit synthetic-content provenance.

- [ ] **Step 2: Implement full-screen Meeting surface**

Keep a compact factory status rail visible. Goal cards show condition text generated from synthetic definition, player's current metric/progress, current PP value and whether the active player already spoke there.

- [ ] **Step 3: Accessibility**

Use native buttons, `aria-live` for score/pass/reveal events, deterministic keyboard focus order, no color-only state. Respect existing `prefers-reduced-motion` rules.

- [ ] **Step 4: Run web tests/full CI and commit**

---

### Task 10: M5 invariants, replay determinism and integration gate

**Files:**
- Create: `packages/rules/src/m5-invariants.ts`
- Modify: `packages/rules/src/index.ts`
- Test: `packages/rules/test/m5-invariants.test.ts`
- Test: `packages/rules/test/m5-replay.test.ts`

**Interfaces:**
- Extends the existing invariant gate without weakening M1–M4 checks.

- [ ] **Step 1: RED invariants**

Cover: four-or-fewer Meeting display goals, active speaker belongs to speaker order, used Seat count never exceeds available Seats, spoken-goal IDs exist, productionCycle/week in 0..3, Meeting cannot disappear without completion, player hand IDs unique and content-backed.

- [ ] **Step 2: RED replay test**

Replay the same M5 event stream from identical initial state twice and compare serialized state after every event.

- [ ] **Step 3: Implement M5 invariant wrapper and export it**

- [ ] **Step 4: Full branch verification**

Require deterministic guard, lint, typecheck, all tests, build.

- [ ] **Step 5: Final compare / source audit**

Verify branch is not behind `main`, no `authoritative:true` card manifest was added, and no exact printed Performance/Final Goal values were guessed.

- [ ] **Step 6: PR and merge**

Open `Slice 5: Meetings and final scoring`, merge with merge commit after green branch/PR CI, then require fresh green `main` CI before Slice 6.
