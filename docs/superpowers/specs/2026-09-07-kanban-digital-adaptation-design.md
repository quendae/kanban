# Kanban: Automotive Revolution — Digital Adaptation Design Spec

**Status:** approved direction, living implementation spec  
**Date:** 2026-09-07  
**Repository:** `quendae/kanban`  
**Primary ruleset:** `KANBAN_AR_2014` — original 2014 rules only  
**Primary source:** `Kanban_Automotive_Revolution_Digital_Design_Doc_PL.docx` supplied with the project

## 1. Product goal

Build a browser-based single-player computer adaptation of **Kanban: Automotive Revolution** using the **original 2014 ruleset**, not Kanban EV. The game must preserve the board game's key strategic character: time efficiency, workstation order, shared production dependencies, Sandra pressure, Meetings, weekly scoring and the dual 3/2 end-game clocks.

The first complete version is intended to be rules-faithful and testable rather than commercially publishable. Original artwork may be used locally for development/reference, but copyrighted assets must not be committed to the public repository. The implementation must support replacing the entire visual asset pack without changing game rules.

## 2. V1 scope

V1 is **single-player only**.

Supported games:

- 2 players: 1 human + 1 bot
- 3 players: 1 human + 2 bots
- 4 players: 1 human + 3 bots

Required V1 systems:

- complete legal game loop for 2/3/4 players
- Original 2014 setup and rules
- Nice Sandra and Mean Sandra
- Design, Logistics, Assembly Line, Testing & Innovation, Administration, Human Resources
- Training, Books, certifications, expert rewards and Factory Goals
- Meetings, Seats, pet projects and Performance Goals
- weekly scoring
- end trigger at Production Cycle / Week = 3/2 in either order
- final scoring and tie breakers
- at least one competent heuristic bot profile
- save/load
- deterministic replay
- autosave
- human-readable event/scoring log
- deterministic random-legal and bot simulation harness
- responsive desktop/tablet-landscape interface

Explicitly deferred until the rules, AI and replay systems are stable:

- online multiplayer
- spectators
- matchmaking/lobbies
- asynchronous multiplayer
- server authority / reconnect protocol

Hot-seat is intentionally not part of V1.

## 3. Design principles

### 3.1 One factory, not five minigames

The board remains the main screen. Department actions may use a focus mode, inspector or modal where needed, but the player should retain context of the shared factory state.

### 3.2 Time is a visible currency

Every legal command shows its Shift cost before confirmation. The UI must distinguish:

- base Shifts from the workstation
- Banked Shifts available now
- Shifts spent today
- rewards earned today but not spendable until next day
- the hard limit of 4 total Shifts in a day

### 3.3 Turn order is strategic information

Workstation selection must communicate both today's Working Phase order and the effect on the next Department Selection order.

### 3.4 Legality comes only from the rules engine

React components do not duplicate rules. The UI renders commands and disabled reasons from `RulesEngine.getLegalCommands()` / validation result codes.

### 3.5 Explain automation

Bookkeeping may be automatic, but every consequential state change must be explainable in the event log: PP source, car movement, Sandra evaluation, design refill, Meeting multiplier decay, scoring formula, pending reward activation and end-game triggers.

## 4. Technology and repository architecture

Use a TypeScript workspace with React + Vite for the web client.

Recommended top-level structure:

```text
apps/
  web/
packages/
  rules/
  content/
  ai/
  replay/
  assets/
  testkit/
docs/
  superpowers/
    specs/
    plans/
```

Responsibilities:

### `packages/rules`

Pure TypeScript. No React, DOM or browser storage dependencies.

Contains:

- identifiers and enums
- `GameState`
- commands
- command validation
- `GameEvent` definitions
- deterministic reducers
- phase/state machine
- setup
- all department rules
- Sandra
- Meetings
- scoring
- invariants
- public `PlayerView` derivation

### `packages/content`

Data-only content definitions:

- design tiles
- Kanban Order cards
- Performance Goals
- Factory Goals
- Demand tiles
- Award Plaques
- Final Goals
- player-count setup configuration
- ruleset-specific constants

Content is separate from rules so that unverified card data can never become hard-coded behavior.

### `packages/ai`

Bots consume the same legal-command interface as the human player and receive only a valid `PlayerView`.

### `packages/replay`

Serialization, autosave, save migration, event replay, replay navigation and optional JSON import/export.

### `packages/assets`

Asset manifest API and visual metadata. No original copyrighted image files in Git.

### `packages/testkit`

Fixtures, seeded game builders, random-legal simulation, bot-vs-bot simulation and regression seeds.

### `apps/web`

React application, board renderer, controls, inspector panels, accessibility and animations.

## 5. Core state architecture

The engine follows:

```text
Command -> Validate -> GameEvents -> Reducer -> Invariant checks
```

No UI code directly mutates `GameState`.

Core shape:

```ts
type GamePhase =
  | 'SETUP'
  | 'SELECT_DEPARTMENT'
  | 'WORK'
  | 'END_OF_DAY'
  | 'MEETING'
  | 'WEEKLY_SCORE'
  | 'FINAL_SCORE'
  | 'GAME_OVER';

interface GameState {
  schemaVersion: number;
  ruleset: 'KANBAN_AR_2014';
  seed: string;
  rngCursor: number;
  playerCount: 2 | 3 | 4;
  phase: GamePhase;
  dayIndex: number;
  week: number;
  productionCycle: number;
  meetingScheduled: boolean;
  activeActorId: string | null;
  board: BoardState;
  sandra: SandraState;
  players: PlayerState[];
  decks: DeckState;
  pendingRewards: PendingReward[];
  eventIndex: number;
}
```

Every physical entity has exactly one location at a time. Cars, parts and designs must not be duplicated between supply, board areas and player holdings.

## 6. Deterministic randomness

All randomness is generated from one seeded RNG owned by the rules layer.

Seeded operations include:

- deck shuffles
- initial goals
- initial design display
- random recycling parts
- bot noise on lower difficulties

A save/replay stores both the original seed and sufficient deterministic event/RNG position information to reproduce the game exactly.

`Math.random()` is forbidden inside the rules, AI and simulation packages.

## 7. Original 2014 rule guardrails

The ruleset must not silently inherit Kanban EV changes.

Critical compatibility checks:

- a player may replace a car when all garages are full in Original 2014, but receives no garage benefit for the replacement
- Nice Sandra and Mean Sandra use Original 2014 reward/penalty behavior
- Sandra's Design cleanup follows Original 2014 behavior
- rewards earned during the day remain pending until the appropriate end-of-day boundary
- maximum total work per day is 4 Shifts
- a player cannot select the same department on consecutive days
- red Seats do not directly score during Meetings
- a pet project must be revealed exactly once during a Meeting
- each player may speak at most once per Performance Goal per Meeting
- end of game triggers at 3/2 and resolves the entire current day before final scoring

## 8. Authoritative-content boundaries

The supplied source explicitly states that not every Performance Goal, Final Goal and printed component value has a reliable machine-readable catalogue.

Therefore:

- do not invent missing card conditions or values
- content with uncertain values must remain unavailable to production gameplay until verified against an authoritative Original 2014 source
- tests for a card must cite the corresponding verified content record
- each content record should carry a `sourceRef` string for auditability

The supplied document also does not provide a complete authoritative left-to-right mapping of every workstation in Workstation Alley. Turn-order data must therefore be entered only after verification against the Original 2014 board/rulebook. Visual department placement must never be used as the rules source for turn order.

## 9. AI architecture

Bots use exactly the same legal-command generation as the human.

Pipeline:

1. build bot `PlayerView`
2. get legal commands
3. group commands into meaningful macro-action candidates where necessary
4. score candidates
5. select command/macro plan
6. execute one legal command at a time through the normal rules engine

Initial evaluator features:

- immediate PP
- likely Meeting PP
- Seat scarcity/value
- Sandra audit risk
- Shift efficiency
- certification tempo
- tested-design synergy
- next-day workstation priority
- blocked future actions
- end-game clock risk/value

V1 requires a solid heuristic bot. Easy/Medium/Hard tuning and deeper expectimax/MCTS are later refinements, not prerequisites for the first rules-complete build.

Bots must never read another player's hidden goal cards.

## 10. Save, load and replay

Every accepted command creates one or more deterministic events.

Save payload contains at minimum:

```ts
interface SaveGame {
  schemaVersion: number;
  rulesetVersion: string;
  createdAt: string;
  updatedAt: string;
  seed: string;
  initialSnapshot: GameState;
  currentSnapshot: GameState;
  eventStream: GameEvent[];
  currentEventIndex: number;
}
```

Requirements:

- autosave after every accepted command
- autosave on phase boundaries
- manual named saves
- load from browser storage
- export save as JSON
- import save from JSON
- replay from initial state through event stream
- replay step forward/back by decision boundary
- visible event log with scoring breakdown
- schema migration hooks from the first persisted version

## 11. Main board UI

Primary target is desktop. Minimum supported gameplay viewport is 1280×800 landscape; 1920×1080 is the baseline design target.

Screen structure:

### Top status bar

Shows:

- day
- Week 0–3
- Production Cycle 0–3
- Meeting status/token
- Sandra mode and current location
- active actor
- current Working Phase order

### Central factory board

Interactive SVG/DOM board with pan/zoom where needed.

All major factory systems remain visible:

- Testing & Innovation
- Assembly Line
- Logistics
- Design
- Administration
- Human Resources

The board has a dedicated Workstation Alley overlay/strip. Its display order is driven by ruleset data, never inferred from the visual coordinates of departments.

### Right action inspector

Shows legal actions and blocked actions for the current context.

Each item shows:

- action name
- Shift cost
- required resource(s)
- selected target(s)
- immediate effect preview
- pending effect preview
- disabled reason if illegal

### Bottom player tray

Always-accessible human player summary:

- PP
- current/day Shifts
- Banked Shifts
- parts and capacity
- blueprints and capacity
- upgraded designs
- garages/cars
- Books
- Vouchers
- generic red Seats
- conference Seats
- certifications
- compact training summary

### Focus mode

Selecting a department may enlarge it and the action inspector, but the rest of the factory remains visible in a reduced-context state.

## 12. Department presentation

The digital layout is functional rather than a one-to-one copy of the physical board.

Each area has a unique visual motif while sharing the same interaction language.

### Design

Two visible ageing rows plus three deck locations. Age/reward state is visually obvious. Selecting a tile previews the consumed Shift, capacity consequence and any pending reward.

### Logistics

Six stable part-type columns/warehouses. Kanban Order action visually previews which four/two symbols refill which stores. Player storage capacity remains visible during collection.

### Assembly Line

Five car-model lanes with explicit part slots and two movement paths. Providing a part previews the entire resulting car push chain before confirmation.

### Testing & Innovation

Test Track, Pace Car, available cars, innovation/upgrade spaces and global part values share one area. Claim cost is shown from the pre-claim position snapshot.

### Administration

Conference table, active Performance Goals, Final Goal, Week track and Sandra desk are grouped here. During normal work it also exposes micromanage selection.

### Human Resources

Shift Bank, Certification Track, five Training Tracks and Factory Goals are always inspectable. Training stack order must be visually distinguishable for ties.

## 13. Meeting presentation

Meetings use a dedicated full-screen Board Room state rather than tiny interactions on the main board.

The Meeting screen shows:

- speaker order
- each player's available face-up Seats
- four current Performance Goals
- current multiplier/value per goal
- whether the human already spoke about that goal
- human progress toward every goal
- pet-project reveal state
- pass/re-entry state
- a compact persistent factory summary

After the Meeting, the UI animates Seat state changes, goal replacement and Production Cycle advancement, then returns to the board.

## 14. Sandra presentation

Sandra is a system actor, not a normal bot.

Her turn is split visually into:

1. movement/location
2. audit target selection
3. audit condition
4. PP reward/penalty breakdown
5. department cleanup/task
6. Week advancement if Administration triggers it

The UI may forecast the next potential Sandra department and public audit risk, but must not calculate a prescriptive optimal move for the player.

## 15. Visual asset system

```ts
interface AssetPack {
  id: string;
  board: BoardAssetManifest;
  cars: Record<CarModel, AssetRef>;
  parts: Record<PartType, AssetRef>;
  designs: Record<string, AssetRef>;
  cards: Record<string, AssetRef>;
  icons: Record<string, AssetRef>;
  sandra: SandraAssetManifest;
}
```

Two expected packs:

- `fallback`: repository-safe generated/vector placeholders used by CI and fresh clones
- `original-test`: local-only mapping to original art for private development/testing

The local original-art directory is ignored by Git. Missing local assets must fall back cleanly to repository-safe placeholders.

## 16. Accessibility and information design

Required from the beginning, not as a final cosmetic pass:

- model/part identity never encoded by color alone
- labels/tooltips for all symbols
- UI scaling at least 100–160%
- keyboard navigation for core turn actions
- reduced-motion mode
- semantic event descriptions
- readable disabled-action reasons
- no scoring condition expressed only as an illustration

## 17. Testing strategy

### Unit tests

Every command validator gets legal and illegal fixtures. Every scoring function returns both the score and a breakdown and is tested against fixed states.

### Property/invariant tests

At minimum:

- each Car ID has one location
- each Design ID has one location
- player parts never exceed capacity
- player designs never exceed capacity
- garage occupancy never exceeds unlocked capacity
- Banked Shifts never become negative
- total Shifts used in a day never exceed 4
- Week and Production Cycle never move backward
- hidden player information does not leak into another `PlayerView`

### Simulation tests

The harness must support:

- random-legal games
- heuristic-bot games
- fixed regression seeds
- deterministic replay hash comparison

Rules-complete V1 is not accepted until thousands of simulated games complete without invariant failures or non-terminating states.

### Browser E2E

Playwright targets:

- 1920×1080
- 2560×1440
- 3440×1440
- 1280×800 landscape
- UI scale 100/125/150%

Tests cover at least one full day, one Meeting, save/load equivalence and replay determinism.

## 18. Implementation slices

Each slice must end in independently testable software.

### Slice 0 — Project foundation + rules kernel

Deliver:

- workspace/Vite scaffolding
- strict TypeScript config
- `packages/rules`
- IDs/enums
- seeded RNG
- base `GameState`
- Command/Event/Reducer pipeline
- invariant framework
- Vitest setup
- CI

No game UI beyond a minimal boot screen.

### Slice 1 — Setup + daily phase machine

Deliver:

- deterministic 2/3/4-player setup
- one human + N bot seats in state model
- starting round
- Department Selection
- Working Phase ordering
- Shift Bank
- pending rewards
- end-of-day boundary

Completion is blocked until authoritative Original 2014 workstation ordering has been verified and entered as data.

### Slice 2 — Design + Logistics

Deliver full rules and tests for:

- design selection/capacity
- ageing/replenishment
- certified fresh-design access
- Kanban Orders
- part collection
- storage capacity
- recycling
- vouchers

### Slice 3 — Assembly + Testing & Innovation

Deliver:

- assembly graph
- part requirements
- car push chains
- test-track overflow
- Demand tiles
- claim costs
- garages/replacement Original rule
- design upgrades
- global part values
- tested designs
- double upgrade

### Slice 4 — HR + Sandra + weekly scoring

Deliver:

- all Training Tracks
- stack tie order
- certification unlocks
- expert awards
- Factory Goals / Seat conversion
- Nice Sandra
- Mean Sandra
- department cleanup tasks
- Week advancement
- weekly scoring

### Slice 5 — Meetings + end game

Deliver:

- conference Seats
- pet projects
- speaker ordering
- per-goal multiplier decay
- pass and re-entry
- goal replacement
- Production Cycle
- 3/2 trigger
- final goals
- final scoring
- tie breakers

Performance/Final Goal content may only be enabled when verified records exist in `packages/content`.

### Slice 6 — Simulation harness + first bot

Deliver:

- random legal player
- heuristic bot
- 1+1, 1+2 and 1+3 bot game startup
- bot-vs-bot simulator
- regression-seed persistence
- thousands-of-games stability run

### Slice 7 — Main board UI

Deliver:

- top status bar
- factory board
- Workstation Alley
- department focus mode
- right action inspector
- bottom player tray
- event log
- legal/illegal action feedback
- repository-safe placeholder asset pack
- local original-test asset override

### Slice 8 — Department interaction polish

Deliver visual/action UX for all six areas, movement previews, Assembly chain preview, claim preview, Design refill feedback and pending-resource visualization.

### Slice 9 — Meeting/Sandra/scoring presentation

Deliver Board Room UI, Sandra audit sequence, scoring breakdowns and end-game presentation.

### Slice 10 — Save/load/replay

Deliver persistent browser saves, manual saves, JSON import/export, autosave, migrations and replay controls.

### Slice 11 — Tutorial + accessibility + performance polish

Deliver scripted tutorial, keyboard navigation, reduced motion, UI scaling, readable labels, performance pass and responsive verification.

### Slice 12 — Multiplayer foundation, after V1 stability

Only after V1 rules, simulation, AI, save and replay are stable:

- authority model
- command/event transport
- hidden PlayerViews
- reconnect from snapshot + event tail
- live lobby
- optional AI takeover

Multiplayer must reuse the exact V1 command/event protocol rather than introduce a second rules implementation.

## 19. V1 Definition of Done

V1 is complete when:

- a human can complete a legal 2/3/4-player game against 1–3 bots
- the complete Original 2014 game loop works, including Sandra, Meetings, weekly/final scoring and 3/2 clocks
- disabled UI actions always have a rules-engine reason
- save/load reproduces exactly the same game state
- replay reproduces the same state hash event by event
- simulations run thousands of complete games without invariant failures
- no bot sees hidden opponent information
- no unverified Performance/Final Goal content is fabricated
- the game is usable at 1920×1080 and 1280×800 landscape and at 150% UI scale
- online multiplayer is not required for V1 and is implemented only after this baseline is stable

## 20. Immediate next work

The first implementation plan should cover **Slice 0 only**. Slice 0 creates the project foundation and deterministic rules kernel without prematurely implementing cards, visual board details or multiplayer.

Once Slice 0 passes unit tests and CI, proceed to Slice 1 and verify the missing authoritative workstation-order data before declaring the daily phase machine complete.
