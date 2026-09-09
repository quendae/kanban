# Kanban Slice 2 — Design + Logistics

## Goal

Implement milestone M2 for the Original 2014 ruleset: Design actions, Logistics actions, capacities, Design replenishment, and global Recycling. Preserve the deterministic Command → Validate → GameEvents → Reducer architecture. Do not invent authoritative card/tile distributions that are not verified from original components.

## Source-backed rules in scope

### Design
- Taking one Design tile costs 1 Shift per tile.
- A player must have a free blueprint slot and may not discard a blueprint just to make room.
- Standard blueprint capacity is 4; certification unlocks a 5th slot.
- During one Design selection action, taken spaces are not replenished until the selection action ends.
- At action end, gaps in both rows shift toward the oldest/right side and new tiles enter from their corresponding side decks; if a side deck empties, Central deck becomes the replenishment source.
- The oldest/rightmost visible design in a row grants its printed bonus (Shift or Book); earned benefits are pending until end of day.
- Certified Design players may also choose fresh designs from the top of the two side decks and Central deck.

### Logistics
- Issue Kanban Order: at most once per day, costs 1 Shift, and grants 1 pending Banked Shift.
- The order orientation determines which 4 of its 6 symbols replenish matching warehouses; exact original 12-card symbol layouts remain content data, not hard-coded rules.
- Collect Car Parts: costs 1 Shift per chosen warehouse / part type; within that warehouse the player may take any positive number up to own storage capacity.
- Standard part capacity is 5; Logistics certification unlocks a 6th slot.
- Certified Logistics players may gain 1 Parts Voucher per day. Because the design document does not state a Shift cost for that action, keep cost as explicit ruleset content/configuration and default the development fixture to 0 until primary-source cross-check.

### Recycling
- Outside Meeting, a player may repeatedly swap one owned part for one part in Recycling at zero Shift cost.
- Recycling contains at most 3 parts and at most one part per type/slot.
- Swap is atomic: outgoing player part moves to Recycling and selected Recycling part moves to the player.

## Content boundary

The engine must not pretend that synthetic data is original component data.

Add a serializable `GameContent` catalog with opaque IDs:
- 5 model IDs
- 6 part-type IDs
- Design definitions: model + optional part type + optional oldest-slot bonus
- Kanban Order definitions: six part-type symbols

Production rules consume the catalog. Tests use explicit fixtures. A development catalog may exist for the web shell, but it must be named/marked non-authoritative and replaceable by an original-2014 manifest after literal component cross-check.

## Task 1 — Domain/state foundations

Files:
- `packages/rules/src/ids.ts`
- `packages/rules/src/content.ts` (new)
- `packages/rules/src/model.ts`
- `packages/rules/src/create-game.ts`
- `packages/rules/src/invariants.ts`
- tests in `packages/rules/test/content-state.test.ts`

RED first:
- content IDs and definitions are serializable
- player has explicit part/design capacities and daily flags
- physical Design/Part entities still have one location each
- Design rows/decks and Logistics warehouses/Recycling can be queried deterministically
- invariant rejects duplicate physical locations and capacity overflow

GREEN: minimal state/catalog implementation only.

## Task 2 — Design selection + replenishment

Files:
- `packages/rules/src/commands.ts`
- `packages/rules/src/errors.ts`
- `packages/rules/src/events.ts`
- `packages/rules/src/engine.ts`
- `packages/rules/src/reducer.ts`
- `packages/rules/src/design.ts` (new)
- `packages/rules/test/design.test.ts`

RED first for:
- only active worker in DESIGN may start/take/end a Design selection
- each taken tile costs 1 Shift
- cannot exceed total 4 Shifts/day or blueprint capacity
- no replenish between successive picks in the same selection
- end selection compacts each row toward the right and replenishes from its side deck, then Central fallback
- oldest/rightmost bonus becomes pending, not immediately spendable
- certified source access and capacity 5

GREEN with minimal commands/events.

## Task 3 — Logistics collect parts

Files:
- `packages/rules/src/logistics.ts` (new)
- command/event/engine/reducer files
- `packages/rules/test/logistics-collect.test.ts`

RED first for:
- only active LOGISTICS worker
- one chosen warehouse/type per command
- any positive quantity from that warehouse costs exactly 1 Shift
- cannot exceed warehouse stock, player capacity, or 4 Shift/day total
- capacity 5 / certified 6
- moved Part IDs change location atomically

GREEN minimal implementation.

## Task 4 — Kanban Order + certified voucher

Files:
- command/event/engine/reducer files
- `packages/rules/test/logistics-order.test.ts`

RED first for:
- issue at most once per day
- cost 1 Shift
- orientation chooses the four active printed symbols
- warehouse refill transfers actual Part IDs from supply only when available
- grants exactly 1 pending Banked Shift
- used order cycles to bottom and replacement order is drawn deterministically
- certified voucher once/day; reward uses pending availability boundary if earned today

GREEN minimal implementation with content-driven order symbols.

## Task 5 — Recycling

Files:
- `packages/rules/src/recycling.ts` (new)
- command/event/engine/reducer files
- `packages/rules/test/recycling.test.ts`

RED first for:
- swap costs 0 Shifts
- available in ordinary work turns regardless of current department
- unavailable during Meeting
- player must own outgoing part and have selected incoming Recycling part
- outgoing/incoming move atomically; pool remains max 3 and one per slot/type
- repeated swaps are legal when each resulting state remains legal

GREEN minimal implementation.

## Task 6 — Development UI

Files:
- `apps/web/src/App.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/App.test.tsx`

Show Design display/decks, Logistics warehouses, player capacities/resources, and engine-generated legal actions. React still owns no legality.

## Verification gate

For every task:
1. Commit failing test only.
2. Confirm CI fails for the intended missing behavior.
3. Commit minimal implementation.
4. Confirm full CI: deterministic guard, lint, typecheck, tests, build.

Before integration:
- full feature-branch CI green
- PR to `main`
- merge using regular merge commit
- post-merge CI on `main` green
