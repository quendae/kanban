import {
  planSandraVisit,
  type Department,
  type GameEvent,
  type GameState,
} from '@kanban/rules';
import './m4.css';

const DEPARTMENTS: readonly Department[] = [
  'TESTING_INNOVATION',
  'ASSEMBLY',
  'LOGISTICS',
  'DESIGN',
  'ADMINISTRATION',
];

const DEPARTMENT_LABELS: Readonly<Record<Department, string>> = {
  TESTING_INNOVATION: 'Testing & Innovation',
  ASSEMBLY: 'Assembly',
  LOGISTICS: 'Logistics',
  DESIGN: 'Design',
  ADMINISTRATION: 'Administration',
};

function playerLabel(playerId: string): string {
  return playerId === 'player:0' ? 'You' : `Bot ${Number(playerId.split(':')[1])}`;
}

function getNextSandraVisit(state: GameState): string {
  try {
    const visit = planSandraVisit(state);
    return `${DEPARTMENT_LABELS[visit.department]} · ${visit.workstationId}`;
  } catch {
    return 'No legal destination';
  }
}

export function HumanResourcesSurface({ state }: { readonly state: GameState }) {
  const certification = state.content.trainingRules.certificationLevel;
  const expert = state.content.trainingRules.expertLevel;

  return (
    <section className="m4-surface hr-surface" aria-labelledby="human-resources-title">
      <header className="m4-heading">
        <div>
          <span className="m4-kicker">E · People development</span>
          <h2 id="human-resources-title">Human Resources</h2>
        </div>
        <span className="m4-readout">Training · Cert {certification} · Expert {expert}</span>
      </header>

      <div className="training-table" role="table" aria-label="Training tracks">
        <div className="training-row training-row-head" role="row">
          <span role="columnheader">Department</span>
          {state.players.map((player) => <span role="columnheader" key={player.id}>{playerLabel(player.id)}</span>)}
          <span role="columnheader">Expert Seat</span>
          <span role="columnheader">Award Plaques</span>
        </div>
        {DEPARTMENTS.map((department) => (
          <div className="training-row" role="row" key={department} data-training-department={department}>
            <strong role="cell">{DEPARTMENT_LABELS[department]}</strong>
            {state.players.map((player) => (
              <span className="training-level" role="cell" key={player.id}>
                <b>{player.training[department]}</b>
                <small>
                  {player.expertDepartments.includes(department)
                    ? 'Expert'
                    : player.certifications.includes(department)
                      ? 'Certified'
                      : 'Training'}
                </small>
              </span>
            ))}
            <span className="m4-state-pill" role="cell">
              {state.board.expertSeatAvailable[department] ? 'Expert Seat open' : 'Expert Seat claimed'}
            </span>
            <span className="m4-state-pill" role="cell">
              Award Plaques {state.board.awardPlaquePools[department].length}
            </span>
          </div>
        ))}
      </div>

      <section className="factory-goals-panel" aria-labelledby="factory-goals-title">
        <header>
          <div><span className="m4-kicker">Shared milestones</span><h3 id="factory-goals-title">Factory Goals</h3></div>
          <strong>{state.board.factoryGoals.length}</strong>
        </header>
        <div className="factory-goals-grid">
          {state.board.factoryGoals.length === 0 ? (
            <p className="m4-empty">No active synthetic Factory Goals in this development fixture.</p>
          ) : state.board.factoryGoals.map((goal) => {
            const definition = state.content.factoryGoals[goal.goalId];
            return (
              <article className="factory-goal" key={goal.goalId}>
                <strong>{definition?.category ?? goal.goalId}</strong>
                <span>{definition ? `Threshold ${definition.threshold}` : goal.goalId}</span>
                <small>Seats {goal.seatsRemaining} · claimed {goal.claimedBy.length}</small>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}

export function SandraWeekSurface({
  state,
  recentEvents,
}: {
  readonly state: GameState;
  readonly recentEvents: readonly GameEvent[];
}) {
  const audit = recentEvents.find(
    (event): event is Extract<GameEvent, { readonly type: 'SANDRA_AUDIT_RESOLVED' }> =>
      event.type === 'SANDRA_AUDIT_RESOLVED',
  );
  const weeklyScore = recentEvents.find(
    (event): event is Extract<GameEvent, { readonly type: 'END_OF_WEEK_SCORED' }> =>
      event.type === 'END_OF_WEEK_SCORED',
  );

  return (
    <section className="m4-surface sandra-week-surface" aria-labelledby="sandra-status-title">
      <header className="m4-heading">
        <div>
          <span className="m4-kicker">Manager loop</span>
          <h2 id="sandra-status-title">Sandra status</h2>
        </div>
        <span className="m4-readout">{state.sandra.mode}</span>
      </header>

      <dl className="sandra-readout">
        <div><dt>Current</dt><dd>{state.sandra.department} · {state.sandra.workstation}</dd></div>
        <div><dt>Next visit</dt><dd>{getNextSandraVisit(state)}</dd></div>
        <div><dt>Week</dt><dd>{state.week} / 3</dd></div>
        <div><dt>Production Cycle</dt><dd>{state.productionCycle} / 2</dd></div>
      </dl>

      <section className="m4-event-panel" aria-labelledby="sandra-audit-title">
        <header><h3 id="sandra-audit-title">Latest audit</h3><span>{audit?.mode ?? '—'}</span></header>
        {audit ? (
          <div className="audit-results">
            {audit.results.length === 0 ? <p className="m4-empty">No player evaluated.</p> : audit.results.map((result) => (
              <div className="audit-result" key={result.playerId}>
                <strong>{playerLabel(result.playerId)}</strong>
                <span>Training {result.trainingLevel} · Metric {result.metric}</span>
                <b>{result.ppDelta >= 0 ? '+' : ''}{result.ppDelta} PP</b>
              </div>
            ))}
          </div>
        ) : <p className="m4-empty">No Sandra audit in the latest action.</p>}
      </section>

      <section className="m4-event-panel" aria-labelledby="weekly-scoring-title">
        <header><h3 id="weekly-scoring-title">Weekly scoring</h3><span>Garage × upgrades</span></header>
        {weeklyScore ? (
          <div className="weekly-score-grid">
            {weeklyScore.scores.map((score) => (
              <div className="weekly-score" key={score.playerId}>
                <span>{playerLabel(score.playerId)}</span>
                <strong>+{score.total} PP</strong>
              </div>
            ))}
          </div>
        ) : <p className="m4-empty">No End-of-Week score in the latest action.</p>}
      </section>
    </section>
  );
}
