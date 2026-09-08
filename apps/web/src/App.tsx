import { useState } from 'react';
import {
  applyCommand,
  createShellGame,
  getBaseShifts,
  getLegalCommands,
  getMaximumUsableShifts,
  getWorkstation,
  type GameCommand,
  type GameState,
  type PlayerId,
  type WorkstationId,
} from '@kanban/rules';

interface DepartmentLaneDefinition {
  readonly label: string;
  readonly code: string;
  readonly workstations: readonly [WorkstationId, WorkstationId];
}

const DEPARTMENT_LANES: readonly DepartmentLaneDefinition[] = [
  {
    label: 'Testing & Innovation',
    code: 'A',
    workstations: ['A_LEFT', 'A_RIGHT'],
  },
  {
    label: 'Assembly Line',
    code: 'B',
    workstations: ['B_LEFT', 'B_RIGHT'],
  },
  {
    label: 'Logistics',
    code: 'C',
    workstations: ['C_LEFT', 'C_RIGHT'],
  },
  {
    label: 'Design',
    code: 'D',
    workstations: ['D_LEFT', 'D_RIGHT'],
  },
  {
    label: 'Administration',
    code: 'E',
    workstations: ['E_LEFT', 'E_RIGHT'],
  },
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
    (
      command,
    ): command is Extract<GameCommand, { readonly type: 'SELECT_WORKSTATION' }> =>
      command.type === 'SELECT_WORKSTATION' && command.workstationId === workstationId,
  );
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

function PlayerRail({ state }: { readonly state: GameState }) {
  return (
    <section className="player-rail" aria-label="Players">
      {state.players.map((player) => (
        <article className="player-slot" data-player={player.id} key={player.id}>
          <div>
            <strong>{player.id === 'player:0' ? 'You' : `Bot ${Number(player.id.split(':')[1])}`}</strong>
            <span>{player.kind}</span>
          </div>
          <dl>
            <div>
              <dt>Station</dt>
              <dd>{player.currentWorkstation ?? '—'}</dd>
            </div>
            <div>
              <dt>Base</dt>
              <dd>{player.baseShiftsToday}</dd>
            </div>
            <div>
              <dt>Banked</dt>
              <dd>{player.bankedShifts}</dd>
            </div>
          </dl>
        </article>
      ))}
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
  const finish = legalCommands.find(
    (command): command is Extract<GameCommand, { readonly type: 'FINISH_WORK' }> =>
      command.type === 'FINISH_WORK',
  );
  const workstationChoices = legalCommands.filter(
    (command) => command.type === 'SELECT_WORKSTATION',
  ).length;

  return (
    <aside className="action-panel" aria-label="Current action">
      <div className="action-panel-heading">
        <h2>Current action</h2>
        <span>{state.phase}</span>
      </div>

      {start ? (
        <>
          <p>Initialize the deterministic four-player development game.</p>
          <button className="primary-action" onClick={() => onCommand(start)} type="button">
            Start game
          </button>
        </>
      ) : null}

      {workstationChoices > 0 ? (
        <>
          <p>
            <strong>{actorId}</strong> has {workstationChoices} legal workstation choices.
          </p>
          <p className="action-hint">Choose a highlighted workstation on the factory board.</p>
        </>
      ) : null}

      {finish ? (
        <>
          <dl className="shift-summary">
            <div>
              <dt>Base Shifts</dt>
              <dd>{getBaseShifts(state, finish.actorId)}</dd>
            </div>
            <div>
              <dt>Max usable</dt>
              <dd>{getMaximumUsableShifts(state, finish.actorId)}</dd>
            </div>
          </dl>
          <button className="primary-action" onClick={() => onCommand(finish)} type="button">
            Finish work
          </button>
        </>
      ) : null}

      {!start && workstationChoices === 0 && !finish ? (
        <p className="action-hint">No player command is available in this development phase.</p>
      ) : null}
    </aside>
  );
}

export function App() {
  const [state, setState] = useState<GameState>(() =>
    createShellGame({ seed: 'development', playerCount: 4 }),
  );
  const actorId = commandActor(state);
  const legalCommands = getLegalCommands(state, actorId);

  function dispatch(command: GameCommand) {
    setState((current) => {
      const result = applyCommand(current, command);
      return result.status === 'ACCEPTED' ? result.state : current;
    });
  }

  return (
    <main className="game-shell">
      <header className="game-header">
        <div className="brand-lockup">
          <h1>Kanban: Automotive Revolution</h1>
          <span>Original 2014 development board</span>
        </div>

        <dl className="game-status">
          <div>
            <dt>Phase</dt>
            <dd>{state.phase}</dd>
          </div>
          <div>
            <dt>Day</dt>
            <dd>{state.dayIndex + 1}</dd>
          </div>
          <div>
            <dt>Active actor</dt>
            <dd>{state.activeActorId ?? '—'}</dd>
          </div>
          <div>
            <dt>Sandra</dt>
            <dd>{state.sandra.department}</dd>
          </div>
        </dl>
      </header>

      <div className="game-layout">
        <section className="factory-board" aria-label="Workstation Alley">
          <div className="factory-board-heading">
            <div>
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
            <span className="department-code" aria-hidden="true">
              F
            </span>
            <div>
              <strong>Sandra</strong>
              <span>Administration desk · reserved</span>
            </div>
          </section>
        </section>

        <ActionPanel
          actorId={actorId}
          legalCommands={legalCommands}
          onCommand={dispatch}
          state={state}
        />
      </div>

      <PlayerRail state={state} />
    </main>
  );
}
