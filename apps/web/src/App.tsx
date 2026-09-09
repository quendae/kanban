import { useState } from 'react';
import {
  PART_TYPE_IDS,
  applyCommand,
  getBaseShifts,
  getDesignDeck,
  getDesignRow,
  getGameRules,
  getLegalCommands,
  getMaximumUsableShifts,
  getPlayerDesigns,
  getPlayerParts,
  getRecyclingParts,
  getWarehouseParts,
  getWorkstation,
  type DesignId,
  type GameCommand,
  type GameState,
  type PartId,
  type PartTypeId,
  type PlayerId,
  type WorkstationId,
} from '@kanban/rules';
import { createDevelopmentGame } from './development-game.js';

interface DepartmentLaneDefinition {
  readonly label: string;
  readonly code: string;
  readonly workstations: readonly [WorkstationId, WorkstationId];
}

const DEPARTMENT_LANES: readonly DepartmentLaneDefinition[] = [
  { label: 'Testing & Innovation', code: 'A', workstations: ['A_LEFT', 'A_RIGHT'] },
  { label: 'Assembly Line', code: 'B', workstations: ['B_LEFT', 'B_RIGHT'] },
  { label: 'Logistics', code: 'C', workstations: ['C_LEFT', 'C_RIGHT'] },
  { label: 'Design', code: 'D', workstations: ['D_LEFT', 'D_RIGHT'] },
  { label: 'Administration', code: 'E', workstations: ['E_LEFT', 'E_RIGHT'] },
] as const;

function shiftLabel(shifts: number): string {
  return `${shifts} ${shifts === 1 ? 'Shift' : 'Shifts'}`;
}

function commandActor(state: GameState): PlayerId {
  if (
    state.activeActorId !== null &&
    state.activeActorId !== 'sandra' &&
    state.activeActorId.startsWith('player:')
  ) {
    return state.activeActorId as PlayerId;
  }
  return 'player:0';
}

function stationCommand(
  commands: readonly GameCommand[],
  workstationId: WorkstationId,
): Extract<GameCommand, { readonly type: 'SELECT_WORKSTATION' }> | undefined {
  return commands.find(
    (command): command is Extract<GameCommand, { readonly type: 'SELECT_WORKSTATION' }> =>
      command.type === 'SELECT_WORKSTATION' && command.workstationId === workstationId,
  );
}

function partTypeLabel(partType: PartTypeId): string {
  return `Type ${Number(partType.split(':')[1]) + 1}`;
}

function designLabel(state: GameState, designId: DesignId): string {
  const definition = state.content.designs[designId];
  if (!definition) return designId;
  const part = definition.partType === null ? 'no part' : partTypeLabel(definition.partType);
  return `${definition.model} · ${part}`;
}

function partLabel(state: GameState, partId: PartId): string {
  const definition = state.content.parts[partId];
  return definition ? `${partTypeLabel(definition.type)} · ${partId}` : partId;
}

function commandLabel(state: GameState, command: GameCommand): string {
  switch (command.type) {
    case 'START_GAME':
      return 'Start game';
    case 'SELECT_WORKSTATION':
      return `Choose ${command.workstationId}`;
    case 'START_DESIGN_SELECTION':
      return 'Select designs';
    case 'TAKE_DESIGN':
      return `Take ${designLabel(state, command.designId)} · 1 Shift`;
    case 'END_DESIGN_SELECTION':
      return 'Finish Design selection';
    case 'COLLECT_PARTS':
      return `Collect ${command.quantity} × ${partTypeLabel(command.partType)} · 1 Shift`;
    case 'ISSUE_KANBAN_ORDER':
      return `Issue ${command.orderId} · ${command.orientation === 'LEFT_FOUR' ? 'left four' : 'right four'} · 1 Shift`;
    case 'TAKE_PARTS_VOUCHER': {
      const cost = getGameRules(state.content).logisticsVoucherShiftCost;
      return `Take Parts Voucher · ${shiftLabel(cost)}`;
    }
    case 'PROVIDE_ASSEMBLY_PART':
      return `Provide ${partLabel(state, command.partId)} → ${command.model} · 1 Shift`;
    case 'CLAIM_CARS':
      return `Claim ${command.claims.length} ${command.claims.length === 1 ? 'car' : 'cars'}`;
    case 'UPGRADE_DESIGN':
      return `Upgrade ${designLabel(state, command.designId)} with ${partLabel(state, command.partId)} · ${command.upgradeSpaceId}${command.doubleUpgrade ? ' · double' : ''} · 1 Shift`;
    case 'SWAP_RECYCLING_PART':
      return `Recycle ${command.outgoingPartId} ↔ ${command.incomingPartId} · 0 Shifts`;
    case 'FINISH_WORK':
      return 'Finish work';
  }
}

function DepartmentLane({
  lane,
  state,
  legalCommands,
  onCommand,
}: {
  readonly lane: DepartmentLaneDefinition;
  readonly state: GameState;
  readonly legalCommands: readonly GameCommand[];
  readonly onCommand: (command: GameCommand) => void;
}) {
  return (
    <section className="department-lane" aria-labelledby={`department-${lane.code}`}>
      <header className="department-header">
        <span className="department-code" aria-hidden="true">
          {lane.code}
        </span>
        <h2 id={`department-${lane.code}`}>{lane.label}</h2>
      </header>

      <div className="workstation-pair">
        {lane.workstations.map((workstationId) => {
          const workstation = getWorkstation(workstationId);
          const legal = stationCommand(legalCommands, workstationId);
          const occupant = state.players.find(
            (player) => player.currentWorkstation === workstationId,
          );

          return (
            <button
              className="workstation"
              data-command-type="SELECT_WORKSTATION"
              data-workstation={workstationId}
              data-legal={legal ? 'true' : 'false'}
              disabled={!legal}
              key={workstationId}
              onClick={() => {
                if (legal) onCommand(legal);
              }}
              type="button"
            >
              <span className="workstation-position">
                {workstationId.endsWith('LEFT') ? 'Left' : 'Right'}
              </span>
              <strong>{shiftLabel(workstation.shifts)}</strong>
              <span className="workstation-occupant">
                {occupant ? occupant.id : 'Available'}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DesignTile({ state, designId }: { readonly state: GameState; readonly designId: DesignId }) {
  const definition = state.content.designs[designId];
  return (
    <div className="design-tile" data-design-id={designId}>
      <strong>{definition?.model ?? designId}</strong>
      <span>{definition?.partType ? partTypeLabel(definition.partType) : 'No part icon'}</span>
      {definition?.oldestBonus ? <em>{definition.oldestBonus}</em> : null}
    </div>
  );
}

function DesignStudio({ state }: { readonly state: GameState }) {
  return (
    <section className="operation-surface design-studio" aria-labelledby="design-studio-title">
      <header className="operation-heading">
        <div>
          <span className="operation-kicker">D · Blueprint flow</span>
          <h2 id="design-studio-title">Design Studio</h2>
        </div>
        <dl className="deck-readout" aria-label="Design deck counts">
          <div><dt>Top</dt><dd>{getDesignDeck(state, 'row0').length}</dd></div>
          <div><dt>Bottom</dt><dd>{getDesignDeck(state, 'row1').length}</dd></div>
          <div><dt>Central</dt><dd>{getDesignDeck(state, 'central').length}</dd></div>
        </dl>
      </header>

      <div className="design-rows">
        {[0, 1].map((row) => (
          <div className="design-row" key={row} aria-label={`Design row ${row + 1}`}>
            <span className="row-index">0{row + 1}</span>
            <div className="design-track">
              {getDesignRow(state, row as 0 | 1).map((id) => (
                <DesignTile designId={id} key={id} state={state} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LogisticsFloor({ state }: { readonly state: GameState }) {
  return (
    <section className="operation-surface logistics-floor" aria-labelledby="logistics-floor-title">
      <header className="operation-heading">
        <div>
          <span className="operation-kicker">C · Parts supply</span>
          <h2 id="logistics-floor-title">Logistics Floor</h2>
        </div>
        <div className="kanban-deck-readout">
          <span>Kanban deck</span>
          <strong>{state.kanbanOrderDeck.length}</strong>
        </div>
      </header>

      <div className="warehouse-grid">
        {PART_TYPE_IDS.map((type) => {
          const stock = getWarehouseParts(state, type);
          return (
            <article className="warehouse-bin" data-part-type={type} key={type}>
              <div>
                <strong>{partTypeLabel(type)}</strong>
                <span>{type}</span>
              </div>
              <b>{stock.length}</b>
              <div className="warehouse-parts" aria-label={`${stock.length} parts in ${partTypeLabel(type)}`}>
                {stock.length === 0 ? <span className="empty-slot">empty</span> : stock.map((id) => <i key={id}>{id}</i>)}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function RecyclingBay({ state }: { readonly state: GameState }) {
  const recycling = getRecyclingParts(state);
  return (
    <section className="operation-surface recycling-bay" aria-labelledby="recycling-bay-title">
      <header className="operation-heading">
        <div>
          <span className="operation-kicker">Global · 0 Shifts</span>
          <h2 id="recycling-bay-title">Recycling Bay</h2>
        </div>
        <strong className="pool-count">{recycling.length}/3</strong>
      </header>
      <div className="recycling-slots">
        {[0, 1, 2].map((slot) => {
          const id = recycling[slot];
          return (
            <div className="recycling-slot" key={slot}>
              <span>R{slot + 1}</span>
              <strong>{id ? partLabel(state, id) : 'Empty'}</strong>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PlayerRail({ state }: { readonly state: GameState }) {
  return (
    <section className="player-rail" aria-label="Players">
      {state.players.map((player) => {
        const parts = getPlayerParts(state, player.id).length;
        const blueprints = getPlayerDesigns(state, player.id).length;
        return (
          <article className="player-slot" data-player={player.id} key={player.id}>
            <div className="player-identity">
              <strong>{player.id === 'player:0' ? 'You' : `Bot ${Number(player.id.split(':')[1])}`}</strong>
              <span>{player.kind}</span>
            </div>
            <dl>
              <div><dt>Station</dt><dd>{player.currentWorkstation ?? '—'}</dd></div>
              <div><dt>Parts</dt><dd>{parts}/{player.partCapacity}</dd></div>
              <div><dt>Blueprints</dt><dd>{blueprints}/{player.designCapacity}</dd></div>
              <div><dt>Kanban Orders</dt><dd>{player.kanbanOrders.length}</dd></div>
              <div><dt>Banked</dt><dd>{player.bankedShifts}</dd></div>
              <div><dt>Books / Vouchers</dt><dd>{player.books} / {player.vouchers}</dd></div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}

function ActionPanel({
  state,
  actorId,
  legalCommands,
  onCommand,
}: {
  readonly state: GameState;
  readonly actorId: PlayerId;
  readonly legalCommands: readonly GameCommand[];
  readonly onCommand: (command: GameCommand) => void;
}) {
  const start = legalCommands.find(
    (command): command is Extract<GameCommand, { readonly type: 'START_GAME' }> =>
      command.type === 'START_GAME',
  );
  const workstationChoices = legalCommands.filter(
    (command) => command.type === 'SELECT_WORKSTATION',
  ).length;
  const workCommands = legalCommands.filter(
    (command) => command.type !== 'START_GAME' && command.type !== 'SELECT_WORKSTATION',
  );

  return (
    <aside className="action-panel" aria-label="Current action">
      <div className="action-panel-heading">
        <div>
          <span className="panel-kicker">Engine legal commands</span>
          <h2>Current action</h2>
        </div>
        <span>{state.phase}</span>
      </div>

      {start ? (
        <>
          <p>Initialize the deterministic four-player development game.</p>
          <button
            className="action-command action-command-primary"
            data-command-type="START_GAME"
            onClick={() => onCommand(start)}
            type="button"
          >
            Start game
          </button>
        </>
      ) : null}

      {workstationChoices > 0 ? (
        <div className="selection-instruction">
          <strong>{actorId}</strong>
          <span>{workstationChoices} legal workstation choices</span>
          <p>Choose a highlighted workstation directly on the factory alley.</p>
        </div>
      ) : null}

      {workCommands.length > 0 ? (
        <div className="command-stack" aria-label="Legal work commands">
          <div className="shift-summary">
            <div><span>Base Shifts</span><strong>{getBaseShifts(state, actorId)}</strong></div>
            <div><span>Max usable</span><strong>{getMaximumUsableShifts(state, actorId)}</strong></div>
          </div>
          {workCommands.map((command, index) => (
            <button
              className={
                command.type === 'FINISH_WORK' || command.type === 'END_DESIGN_SELECTION'
                  ? 'action-command action-command-secondary'
                  : index === 0
                    ? 'action-command action-command-primary'
                    : 'action-command'
              }
              data-command-type={command.type}
              key={`${command.type}-${index}-${commandLabel(state, command)}`}
              onClick={() => onCommand(command)}
              type="button"
            >
              {commandLabel(state, command)}
            </button>
          ))}
        </div>
      ) : null}

      {!start && workstationChoices === 0 && workCommands.length === 0 ? (
        <p className="action-hint">No player command is available in this development phase.</p>
      ) : null}
    </aside>
  );
}

export function App() {
  const [state, setState] = useState<GameState>(() => createDevelopmentGame());
  const [statusMessage, setStatusMessage] = useState('Ready for factory setup.');
  const actorId = commandActor(state);
  const legalCommands = getLegalCommands(state, actorId);

  function dispatch(command: GameCommand) {
    const result = applyCommand(state, command);
    if (result.status === 'ACCEPTED') {
      setState(result.state);
      setStatusMessage(`Applied: ${commandLabel(state, command)}.`);
      return;
    }
    setStatusMessage(`Command rejected: ${result.errors.join(', ')}.`);
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <span className="eyebrow">Factory operating board</span>
          <h1>Kanban: Automotive Revolution</h1>
          <span>Original 2014 rules implementation</span>
        </div>

        <dl className="game-status">
          <div><dt>Phase</dt><dd>{state.phase}</dd></div>
          <div><dt>Day</dt><dd>{state.dayIndex + 1}</dd></div>
          <div><dt>Active actor</dt><dd>{state.activeActorId ?? '—'}</dd></div>
          <div><dt>Sandra</dt><dd>{state.sandra.department}</dd></div>
        </dl>
      </header>

      <div className="content-provenance" role="note">
        <strong>{state.content.authoritative ? 'Authoritative content' : 'Synthetic development content'}</strong>
        <span>{state.content.id} · IDs and distributions are replaceable fixtures, not claimed original component data.</span>
      </div>

      <div className="game-layout">
        <div className="factory-column">
          <section className="factory-board" aria-label="Workstation Alley">
            <div className="factory-board-heading">
              <div>
                <span className="section-kicker">Daily routing</span>
                <h2>Workstation Alley</h2>
                <p>Left → right determines Working Phase priority.</p>
              </div>
              <span className="ruleset-id">{state.ruleset}</span>
            </div>

            <div className="department-grid">
              {DEPARTMENT_LANES.map((lane) => (
                <DepartmentLane
                  key={lane.code}
                  lane={lane}
                  legalCommands={legalCommands}
                  onCommand={dispatch}
                  state={state}
                />
              ))}
            </div>

            <section className="sandra-desk" aria-label="Sandra Administration desk">
              <span className="department-code" aria-hidden="true">F</span>
              <div>
                <strong>Sandra</strong>
                <span>Administration desk · reserved</span>
              </div>
            </section>
          </section>

          <section className="operations-deck" aria-label="Factory resources">
            <DesignStudio state={state} />
            <LogisticsFloor state={state} />
            <RecyclingBay state={state} />
          </section>
        </div>

        <div className="control-column">
          <ActionPanel
            actorId={actorId}
            legalCommands={legalCommands}
            onCommand={dispatch}
            state={state}
          />
          <p className="command-status" key={state.eventIndex} role="status" aria-live="polite">
            {statusMessage}
          </p>
        </div>
      </div>

      <PlayerRail state={state} />
    </main>
  );
}
